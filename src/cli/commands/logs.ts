import { RunHistoryStore } from "../../storage/run-history";
import { SkillId } from "../../types";
import chalk from "chalk";

function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString([], {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatStatus(status: "success" | "failed"): string {
  if (status === "success") {
    return chalk.green("✓ success");
  }
  return chalk.red("✗ failed");
}

function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  return `${(ms / 60000).toFixed(1)}m`;
}

export async function runLogsCommand(options: {
  skill?: string;
  status?: "success" | "failed";
  sinceDays?: string;
  limit?: string;
}): Promise<void> {
  const store = new RunHistoryStore();
  const rows = store.queryRuns({
    skillId: options.skill as SkillId | undefined,
    status: options.status,
    sinceDays: options.sinceDays ? Number.parseInt(options.sinceDays, 10) : undefined,
    limit: options.limit ? Number.parseInt(options.limit, 10) : 50,
  });

  if (rows.length === 0) {
    console.log(chalk.gray("No matching logs found."));
    return;
  }

  console.log(chalk.bold(`\nFound ${rows.length} log entries:\n`));

  for (const row of rows) {
    const timestamp = formatTimestamp(row.completedAt);
    const status = formatStatus(row.status);
    const duration = formatDuration(row.durationMs);
    const skillId = chalk.cyan(row.skillId);

    console.log(`${chalk.gray(timestamp)} | ${skillId} | ${status} | ${chalk.gray(duration)}`);
    
    // Show message with indentation
    if (row.message) {
      const messageLines = row.message.split("\n");
      for (const line of messageLines) {
        if (line.trim()) {
          console.log(chalk.gray(`  └─ ${line}`));
        }
      }
    }

    // Show metadata if available
    if (row.metadataJson) {
      try {
        const metadata = JSON.parse(row.metadataJson);
        if (metadata.metrics && Object.keys(metadata.metrics).length > 0) {
          const metricsStr = Object.entries(metadata.metrics)
            .map(([k, v]) => `${k}=${v}`)
            .join(", ");
          console.log(chalk.gray(`  └─ Metrics: ${metricsStr}`));
        }
        if (metadata.severity) {
          const severityColor =
            metadata.severity === "critical"
              ? chalk.red
              : metadata.severity === "warn"
                ? chalk.yellow
                : chalk.blue;
          console.log(chalk.gray(`  └─ Severity: ${severityColor(metadata.severity)}`));
        }
      } catch {
        // Ignore parse errors
      }
    }

    console.log(""); // Empty line between entries
  }
}
