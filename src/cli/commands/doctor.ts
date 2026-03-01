import { loadConfig } from "../../lib/config-manager";
import { loadDaemonState, isProcessRunning } from "../../lib/process-manager";
import { createBox, success, error, warning, info } from "../utils/format";
import chalk from "chalk";

export async function runDoctorCommand(): Promise<void> {
  const config = await loadConfig();
  if (!config) {
    console.log("\n" + createBox("Diagnostics", error("Config missing. Run `rexipt-ai init`.")));
    process.exitCode = 1;
    return;
  }

  const diagnostics: string[] = [];
  let hasErrors = false;
  let hasWarnings = false;

  diagnostics.push(chalk.bold("Configuration:"));
  diagnostics.push(success("Config loaded."));
  diagnostics.push("");

  if (!config.organization.name) {
    diagnostics.push(warning("Organization name is empty (optional but recommended)."));
    hasWarnings = true;
  } else {
    diagnostics.push(success(`Organization: ${config.organization.name}`));
  }
  diagnostics.push("");

  diagnostics.push(chalk.bold("Skills:"));
  const enabledSkills = Object.entries(config.skills).filter(([, v]) => v.enabled);
  if (enabledSkills.length === 0) {
    diagnostics.push(error("No skills enabled."));
    hasErrors = true;
  } else {
    diagnostics.push(success(`Enabled skills: ${enabledSkills.map(([k]) => k).join(", ")}`));
  }
  diagnostics.push("");

  diagnostics.push(chalk.bold("Integrations:"));

  const checks: Array<[string, boolean, string?]> = [
    [
      "LLM provider",
      Boolean(config.llm.provider && config.llm.model && config.llm.baseUrl && config.llm.apiKey),
      `${config.llm.provider} (${config.llm.model})`,
    ],
    [
      "Shopify integration",
      !config.integrations.shopify.enabled ||
        Boolean(config.integrations.shopify.storeUrl && config.integrations.shopify.accessToken),
      config.integrations.shopify.enabled ? "enabled" : "disabled",
    ],
    [
      "Google Ads integration",
      !config.integrations.googleAds.enabled ||
        Boolean(
          config.integrations.googleAds.customerId &&
            (config.integrations.googleAds.accessToken || config.integrations.googleAds.refreshToken),
        ),
      config.integrations.googleAds.enabled ? "enabled" : "disabled",
    ],
    [
      "Meta Ads integration",
      !config.integrations.metaAds.enabled ||
        Boolean(config.integrations.metaAds.adAccountId && config.integrations.metaAds.accessToken),
      config.integrations.metaAds.enabled ? "enabled" : "disabled",
    ],
    [
      "TikTok Ads integration",
      !config.integrations.tiktokAds.enabled ||
        Boolean(
          config.integrations.tiktokAds.advertiserId && config.integrations.tiktokAds.accessToken,
        ),
      config.integrations.tiktokAds.enabled ? "enabled" : "disabled",
    ],
    [
      "TikTok Shop integration",
      !config.integrations.tiktokShop.enabled ||
        Boolean(
          config.integrations.tiktokShop.appKey &&
            config.integrations.tiktokShop.accessToken &&
            config.integrations.tiktokShop.shopId,
        ),
      config.integrations.tiktokShop.enabled ? "enabled" : "disabled",
    ],
    [
      "Klaviyo integration",
      !config.integrations.klaviyo.enabled || Boolean(config.integrations.klaviyo.apiKey),
      config.integrations.klaviyo.enabled ? "enabled" : "disabled",
    ],
    [
      "Slack webhook",
      !config.notifications.slack.enabled || config.notifications.slack.webhookUrl.startsWith("https://"),
      config.notifications.slack.enabled ? "enabled" : "disabled",
    ],
    [
      "Telegram bot",
      !config.notifications.telegram.enabled ||
        Boolean(config.notifications.telegram.botToken && config.notifications.telegram.chatId),
      config.notifications.telegram.enabled ? "enabled" : "disabled",
    ],
  ];

  for (const [label, ok, detail] of checks) {
    if (ok) {
      diagnostics.push(success(`${label}: OK${detail ? ` (${detail})` : ""}`));
    } else {
      diagnostics.push(error(`${label}: invalid configuration`));
      hasErrors = true;
    }
  }

  diagnostics.push("");
  diagnostics.push(chalk.bold("Runtime:"));

  const daemon = await loadDaemonState();
  if (!daemon) {
    diagnostics.push(info("Daemon: not running"));
  } else {
    const running = isProcessRunning(daemon.pid);
    if (running) {
      diagnostics.push(success(`Daemon: running (pid ${daemon.pid})`));
    } else {
      diagnostics.push(warning(`Daemon: stale (pid ${daemon.pid})`));
      hasWarnings = true;
    }
  }

  // Overall status
  let statusColor = chalk.green;
  let statusText = "All checks passed!";
  if (hasErrors) {
    statusColor = chalk.red;
    statusText = "Errors found - please fix configuration issues";
  } else if (hasWarnings) {
    statusColor = chalk.yellow;
    statusText = "Warnings found - review configuration";
  }

  console.log("\n" + createBox("Diagnostics", diagnostics.join("\n")));
  console.log("\n" + statusColor(statusText));

  if (hasErrors) {
    process.exitCode = 1;
  }
}
