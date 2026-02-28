#!/usr/bin/env node

import { Command } from "commander";
import { loadEnv } from "../lib/env";
import { runInitCommand } from "./commands/init";
import { runStartCommand, runServeCommand } from "./commands/start";
import { runStatusCommand } from "./commands/status";
import { runHealthCommand } from "./commands/health";
import { runAllSkillsCommand, runSkillCommand } from "./commands/run";
import { runStopCommand } from "./commands/stop";
import { runDoctorCommand } from "./commands/doctor";
import { runLogsCommand } from "./commands/logs";
import { runBackfillCommand } from "./commands/backfill";
import { runConfigCommand } from "./commands/config";
import {
  runActionsApproveCommand,
  runActionsListCommand,
  runActionsRejectCommand,
} from "./commands/actions";
import {
  runShopifyConnectCommand,
  runShopifyOAuthConnectCommand,
} from "./commands/shopify";

loadEnv();

const program = new Command();

program
  .name("rexipt-ai")
  .description("Rexipt AI Employee CLI")
  .version("0.1.0")
  .addHelpText("after", `
Examples:
  npm i -g @rexipt/ai-employee
  rexipt-ai init
  rexipt-ai config set integrations.shopify.storeUrl your-store.myshopify.com
  rexipt-ai config set-secret integrations.shopify.accessToken SHOPIFY_ACCESS_TOKEN
  rexipt-ai start --daemon
  rexipt-ai run dailyBriefing
  rexipt-ai run-all
  rexipt-ai logs --status failed --since-days 7
  rexipt-ai actions list --status pending
  rexipt-ai actions approve 12 --note "verified"

Advanced (without global install):
  npx @rexipt/ai-employee <command>
`);

program
  .command("init")
  .alias("i")
  .description("Initialize local config for @rexipt/ai-employee")
  .action(runInitCommand);

program
  .command("start")
  .alias("s")
  .description("Start AI Employee runtime")
  .option("--once", "Run enabled skills once and exit")
  .option("--daemon", "Run scheduler as a background daemon")
  .action(runStartCommand);

program
  .command("stop")
  .alias("x")
  .description("Stop background daemon process")
  .action(runStopCommand);

program
  .command("run")
  .alias("r")
  .description("Run a single skill immediately")
  .argument("<skillId>", "Skill identifier")
  .action(runSkillCommand);

program
  .command("run-all")
  .alias("ra")
  .description("Run all enabled skills immediately")
  .action(runAllSkillsCommand);

program
  .command("doctor")
  .alias("d")
  .description("Run environment/config diagnostics")
  .action(runDoctorCommand);

program
  .command("logs")
  .alias("l")
  .description("Query run logs")
  .option("--skill <skillId>", "Filter by skill")
  .option("--status <status>", "Filter by status: success|failed")
  .option("--since-days <days>", "Only include logs newer than N days")
  .option("--limit <n>", "Max rows")
  .action(runLogsCommand);

program
  .command("backfill")
  .alias("bf")
  .description("Compute baseline metrics from historical runs")
  .option("--days <n>", "Baseline window in days", "30")
  .action(runBackfillCommand);

program
  .command("config")
  .alias("cfg")
  .description("Inspect and validate local configuration")
  .argument(
    "[action]",
    "Action shortcut: validate|path|list-secrets|list-keys|reset-secret|set-secret|set",
  )
  .argument(
    "[secretArgs...]",
    "Args: reset-secret <path...> | set-secret <path> <ENV_VAR> | set <path> <value>",
  )
  .option("--path", "Print config file path only")
  .option("--validate", "Validate config file and show status")
  .option("--list-secrets", "List supported secret paths")
  .option("--list-keys", "List all editable config keys (marks secret keys)")
  .option(
    "--reset-secret <paths...>",
    "Reset one or more encrypted secret paths (set to empty string)",
  )
  .option("--set-secret-key <path>", "Set one secret path from env var")
  .option("--set-secret-value-env <envVar>", "Env var name to read for secret value")
  .action((action, secretArgs, options) => {
    const shortcut = typeof action === "string" ? action.toLowerCase() : "";
    const nextOptions = { ...options };

    if (shortcut) {
      if (shortcut === "path") {
        nextOptions.path = true;
      } else if (shortcut === "validate") {
        nextOptions.validate = true;
      } else if (shortcut === "list-secrets") {
        nextOptions.listSecrets = true;
      } else if (shortcut === "list-keys") {
        nextOptions.listKeys = true;
      } else if (shortcut === "reset-secret") {
        nextOptions.resetSecret = Array.isArray(secretArgs) ? secretArgs : [];
      } else if (shortcut === "set-secret") {
        const args = Array.isArray(secretArgs) ? secretArgs : [];
        nextOptions.setSecretKey = args[0];
        nextOptions.setSecretValueEnv = args[1];
      } else if (shortcut === "set") {
        const args = Array.isArray(secretArgs) ? secretArgs : [];
        nextOptions.setKey = args[0];
        nextOptions.setValue = args.slice(1).join(" ");
      } else {
        console.error(
          `Unknown config action: ${shortcut}. Use 'validate', 'path', 'list-secrets', 'list-keys', 'reset-secret', 'set-secret', or 'set'.`,
        );
        process.exitCode = 1;
        return;
      }
    }

    void runConfigCommand(nextOptions);
  });

const actions = program
  .command("actions")
  .alias("a")
  .description("Action center queue operations");

actions
  .command("list")
  .alias("ls")
  .option("--status <status>", "pending|approved|rejected")
  .option("--limit <n>", "Max rows", "50")
  .action(runActionsListCommand);

actions
  .command("approve")
  .alias("ap")
  .argument("<id>", "Action id")
  .option("--note <note>", "Approval note")
  .action(runActionsApproveCommand);

actions
  .command("reject")
  .alias("rj")
  .argument("<id>", "Action id")
  .option("--note <note>", "Rejection note")
  .action(runActionsRejectCommand);

const shopify = program
  .command("shopify")
  .alias("shop")
  .description("Shopify integration commands");

shopify
  .command("connect")
  .alias("c")
  .description("Connect using client credentials (short-lived 24h token, use oauth-connect instead)")
  .option("--shop <shop>", "Shop name (e.g., mystore.myshopify.com)")
  .option("--client-id <id>", "Shopify App Client ID")
  .option("--client-secret <secret>", "Shopify App Client Secret")
  .action((options) => {
    void runShopifyConnectCommand(options);
  });

shopify
  .command("oauth-connect")
  .alias("oc")
  .description("Connect using OAuth authorization code flow (RECOMMENDED - gets offline token)")
  .option("--shop <shop>", "Shop name (e.g., mystore.myshopify.com)")
  .option("--client-id <id>", "Shopify App Client ID")
  .option("--client-secret <secret>", "Shopify App Client Secret")
  .option(
    "--scopes <scopes>",
    "Comma-separated scopes (default: read_orders,read_products,read_customers,read_discounts)",
  )
  .option("--port <port>", "Local callback port (default: 3456)")
  .action((options) => {
    void runShopifyOAuthConnectCommand(options);
  });

program
  .command("serve")
  .description("Internal command: run scheduler in service mode")
  .action(runServeCommand);

program
  .command("status")
  .alias("st")
  .description("Show current CLI runtime and config status")
  .action(runStatusCommand);

program
  .command("health")
  .alias("h")
  .description("Run health checks and return status")
  .action(() => {
    void runHealthCommand();
  });

program.parse(process.argv);
