import { loadConfig } from "../../lib/config-manager";
import { logInfo, logError } from "../../lib/logger";
import { metrics } from "../../lib/metrics";
import { RunHistoryStore } from "../../storage/run-history";

interface HealthCheckResult {
  status: "healthy" | "degraded" | "unhealthy";
  checks: Array<{
    name: string;
    status: "pass" | "fail" | "warn";
    message: string;
  }>;
}

export async function runHealthCommand(): Promise<HealthCheckResult> {
  const checks: HealthCheckResult["checks"] = [];
  const runHistory = new RunHistoryStore();

  // Check config
  const config = await loadConfig();
  if (config) {
    checks.push({
      name: "config",
      status: "pass",
      message: "Configuration loaded successfully",
    });
  } else {
    checks.push({
      name: "config",
      status: "fail",
      message: "Configuration missing or invalid",
    });
  }

  // Check database
  try {
    runHistory.listRecent(1);
    checks.push({
      name: "database",
      status: "pass",
      message: "Database accessible",
    });
  } catch (error) {
    checks.push({
      name: "database",
      status: "fail",
      message: `Database error: ${error instanceof Error ? error.message : String(error)}`,
    });
  }

  // Check recent failures
  const recentFailures = runHistory.queryRuns({ status: "failed", sinceDays: 1, limit: 100 });
  const allRecent = runHistory.queryRuns({ sinceDays: 1, limit: 100 });
  const failureRate = recentFailures.length / Math.max(1, allRecent.length);
  
  if (failureRate > 0.5) {
    checks.push({
      name: "reliability",
      status: "fail",
      message: `High failure rate: ${(failureRate * 100).toFixed(1)}% (${recentFailures.length} failures)`,
    });
  } else if (failureRate > 0.2) {
    checks.push({
      name: "reliability",
      status: "warn",
      message: `Elevated failure rate: ${(failureRate * 100).toFixed(1)}% (${recentFailures.length} failures)`,
    });
  } else {
    checks.push({
      name: "reliability",
      status: "pass",
      message: `Failure rate: ${(failureRate * 100).toFixed(1)}%`,
    });
  }

  // Check metrics collection
  const metricsSummary = metrics.getSummary();
  if (metricsSummary.totalMetrics > 0 || metricsSummary.recentExecutions > 0) {
    checks.push({
      name: "metrics",
      status: "pass",
      message: `Collecting metrics (${metricsSummary.totalMetrics} points, ${metricsSummary.recentExecutions} executions)`,
    });
  } else {
    checks.push({
      name: "metrics",
      status: "warn",
      message: "No metrics collected yet",
    });
  }

  // Determine overall status
  const hasFailures = checks.some((c) => c.status === "fail");
  const hasWarnings = checks.some((c) => c.status === "warn");
  
  const status: HealthCheckResult["status"] = hasFailures
    ? "unhealthy"
    : hasWarnings
      ? "degraded"
      : "healthy";

  // Output results
  logInfo(`Health Status: ${status.toUpperCase()}`);
  for (const check of checks) {
    const icon = check.status === "pass" ? "✓" : check.status === "warn" ? "⚠" : "✗";
    const level = check.status === "pass" ? logInfo : check.status === "warn" ? logInfo : logError;
    level(`${icon} ${check.name}: ${check.message}`);
  }

  return { status, checks };
}
