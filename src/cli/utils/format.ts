import boxen from "boxen";
import chalk from "chalk";

export function createBox(title: string, content: string): string {
  return boxen(content, {
    title,
    titleAlignment: "center",
    padding: 1,
    borderStyle: "round",
    borderColor: "cyan",
  });
}

export function success(message: string): string {
  return chalk.green(`✓ ${message}`);
}

export function error(message: string): string {
  return chalk.red(`✗ ${message}`);
}

export function warning(message: string): string {
  return chalk.yellow(`⚠ ${message}`);
}

export function info(message: string): string {
  return chalk.blue(`ℹ ${message}`);
}

export function tip(message: string): string {
  return chalk.cyan(`💡 ${message}`);
}

export function formatStatus(status: "running" | "stopped" | "error"): string {
  switch (status) {
    case "running":
      return chalk.green("✅ Running");
    case "stopped":
      return chalk.gray("⏸️  Stopped");
    case "error":
      return chalk.red("❌ Error");
    default:
      return status;
  }
}

export function formatEnabled(enabled: boolean): string {
  return enabled ? chalk.green("✅") : chalk.gray("⏸️ ");
}

export function formatIntegrationStatus(enabled: boolean, configured: boolean): string {
  if (!enabled) {
    return chalk.gray("⚪ Disabled");
  }
  return configured ? chalk.green("✅") : chalk.yellow("⚠️  Not configured");
}
