import { loadConfig, loadRuntimeState } from "../../lib/config-manager";
import { metrics } from "../../lib/metrics";
import { loadDaemonState, isProcessRunning } from "../../lib/process-manager";
import { RunHistoryStore } from "../../storage/run-history";
import { createBox, formatStatus, formatEnabled, formatIntegrationStatus, tip } from "../utils/format";
import chalk from "chalk";
import { describeNextRun } from "../../utils/schedule";

function formatUptime(startedAt: string): string {
  const start = new Date(startedAt);
  const now = new Date();
  const diffMs = now.getTime() - start.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function formatLastRunTime(completedAt: string): string {
  const completed = new Date(completedAt);
  const now = new Date();
  const diffMs = now.getTime() - completed.getTime();
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  if (hours === 0 && minutes === 0) {
    return "Just now";
  }
  if (hours === 0) {
    return `${minutes}m ago`;
  }
  if (hours < 24) {
    return `${hours}h ago`;
  }
  return completed.toLocaleDateString() + " " + completed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export async function runStatusCommand(): Promise<void> {
  const config = await loadConfig();
  const runtime = await loadRuntimeState();
  const daemon = await loadDaemonState();
  const daemonRunning = daemon ? isProcessRunning(daemon.pid) : false;
  const runHistory = new RunHistoryStore();

  if (!config) {
    console.log("\n" + createBox("AI Employee Status", chalk.red("Config missing\n\nRun `rexipt-ai init` to create config.")));
    return;
  }

  // Build status content
  const statusLines: string[] = [];
  const status = daemonRunning ? "running" : runtime?.status === "running" ? "error" : "stopped";
  statusLines.push(`Status: ${formatStatus(status)}`);

  if (runtime?.startedAt && daemonRunning) {
    statusLines.push(`Uptime: ${formatUptime(runtime.startedAt)}`);
  }

  // Get last briefing
  const lastBriefing = runHistory.queryRuns({ skillId: "dailyBriefing", limit: 1 });
  if (lastBriefing.length > 0) {
    statusLines.push(`Last Briefing: ${formatLastRunTime(lastBriefing[0].completedAt)}`);
  }

  // Count alerts in last 24h
  const recentAlerts = runHistory.queryRuns({
    skillId: "anomalyDetection",
    status: "success",
    sinceDays: 1,
    limit: 100,
  });
  statusLines.push(`Alerts Sent: ${recentAlerts.length} (last 24h)`);
  statusLines.push("");

  // Skills section
  statusLines.push("Skills:");
  const enabledSkills = Object.entries(config.skills).filter(([, v]) => v.enabled);
  const disabledSkills = Object.entries(config.skills).filter(([, v]) => !v.enabled);

  for (const [skillId, skillConfig] of enabledSkills) {
    const lastRun = runHistory.queryRuns({ skillId: skillId as any, limit: 1 });
    const lastRunText = lastRun.length > 0 ? ` (last: ${formatLastRunTime(lastRun[0].completedAt)})` : "";
    const nextRunText = skillConfig.schedule ? ` (next: ${describeNextRun(skillConfig.schedule)})` : "";
    statusLines.push(`  ${formatEnabled(true)} ${skillId}${nextRunText}${lastRunText}`);
  }

  for (const [skillId] of disabledSkills) {
    statusLines.push(`  ${formatEnabled(false)} ${skillId} (disabled)`);
  }

  statusLines.push("");

  // Integrations section
  statusLines.push("Integrations:");
  statusLines.push(
    `  ${formatIntegrationStatus(
      config.integrations.shopify.enabled,
      Boolean(
        config.integrations.shopify.storeUrl &&
          config.integrations.shopify.accessToken,
      ),
    )} Shopify`,
  );
  statusLines.push(
    `  ${formatIntegrationStatus(
      config.integrations.googleAds.enabled,
      Boolean(config.integrations.googleAds.customerId && config.integrations.googleAds.accessToken),
    )} Google Ads`,
  );
  statusLines.push(
    `  ${formatIntegrationStatus(
      config.integrations.metaAds.enabled,
      Boolean(config.integrations.metaAds.adAccountId && config.integrations.metaAds.accessToken),
    )} Meta Ads`,
  );
  statusLines.push(
    `  ${formatIntegrationStatus(
      config.integrations.tiktokAds.enabled,
      Boolean(config.integrations.tiktokAds.advertiserId && config.integrations.tiktokAds.accessToken),
    )} TikTok Ads`,
  );
  statusLines.push(
    `  ${formatIntegrationStatus(
      config.integrations.tiktokShop.enabled,
      Boolean(
        config.integrations.tiktokShop.appKey &&
          config.integrations.tiktokShop.accessToken &&
          config.integrations.tiktokShop.shopId,
      ),
    )} TikTok Shop`,
  );
  statusLines.push(
    `  ${formatIntegrationStatus(
      config.integrations.klaviyo.enabled,
      Boolean(config.integrations.klaviyo.apiKey),
    )} Klaviyo`,
  );

  // Show metrics summary
  const metricsSummary = metrics.getSummary();
  if (metricsSummary.totalMetrics > 0) {
    statusLines.push("");
    statusLines.push(
      `Metrics: ${metricsSummary.totalMetrics} points, ${metricsSummary.skillsTracked} skills tracked`,
    );
  }

  // Health check
  const healthIssues: string[] = [];
  if (!daemonRunning && runtime?.status === "running") {
    healthIssues.push("Daemon marked as running but process not found");
  }
  const recentFailures = runHistory.queryRuns({ status: "failed", sinceDays: 1, limit: 10 });
  if (recentFailures.length > 5) {
    healthIssues.push(`${recentFailures.length} failures in last 24h`);
  }

  if (healthIssues.length > 0) {
    statusLines.push("");
    statusLines.push(chalk.yellow(`Health: WARN - ${healthIssues.join(", ")}`));
  }

  console.log("\n" + createBox("AI Employee Status", statusLines.join("\n")));

  // Show tip if inventory not connected
  const inventoryConnected = false; // TODO: Check if Rexipt inventory is connected
  if (!inventoryConnected) {
    console.log("\n" + tip("Connect Rexipt Inventory to unlock stock alerts\n   Run: rexipt-ai inventory connect"));
  }
}
