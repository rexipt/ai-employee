import {
  getConfigPath,
  loadConfig,
  saveRuntimeState,
} from "../../lib/config-manager";
import { logError, logInfo, logSuccess } from "../../lib/logger";
import { loadDaemonState, startDaemon, isProcessRunning, clearDaemonState } from "../../lib/process-manager";
import { Scheduler } from "../../core/scheduler";
import { SkillRunner } from "../../core/skill-runner";
import { RuntimeState } from "../../types";
import { createBox, success, info } from "../utils/format";
import chalk from "chalk";

async function runScheduledRuntime(interactive: boolean): Promise<void> {
  const config = await loadConfig();

  if (!config) {
    logError("No config found.");
    logInfo(`Run \`rexipt-ai init\` first. Expected config at ${getConfigPath()}`);
    process.exitCode = 1;
    return;
  }

  const runner = new SkillRunner(config);
  const scheduler = new Scheduler(config, runner);

  scheduler.start();
  const state: RuntimeState = {
    startedAt: new Date().toISOString(),
    status: "running",
    mode: "scheduled",
    enabledSkills: (Object.keys(config.skills) as RuntimeState["enabledSkills"]).filter(
      (id) => config.skills[id]?.enabled,
    ),
  };
  await saveRuntimeState(state);

  if (interactive) {
    const enabledSkills = (Object.keys(config.skills) as RuntimeState["enabledSkills"]).filter(
      (id) => config.skills[id]?.enabled,
    );
    
    const output = [
      success("AI Employee runtime started in scheduled mode."),
      "",
      `Skills running: ${enabledSkills.length}/${Object.keys(config.skills).length}`,
      "",
      ...enabledSkills.map((skillId) => {
        const schedule = config.skills[skillId]?.schedule || "not scheduled";
        return `  ${success("•")} ${skillId} (${schedule})`;
      }),
      "",
      info("Press Ctrl+C to stop."),
    ];
    
    console.log("\n" + createBox("AI Employee Running", output.join("\n")));
  }

  const onTerminate = async () => {
    scheduler.stop();
    await saveRuntimeState({
      startedAt: new Date().toISOString(),
      status: "stopped",
      mode: "scheduled",
      enabledSkills: state.enabledSkills,
    });
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void onTerminate();
  });
  process.on("SIGTERM", () => {
    void onTerminate();
  });
}

export async function runServeCommand(): Promise<void> {
  await runScheduledRuntime(false);
}

export async function runStartCommand(options: { once?: boolean; daemon?: boolean } = {}): Promise<void> {
  const config = await loadConfig();

  if (!config) {
    logError("No config found.");
    logInfo(`Run \`rexipt-ai init\` first. Expected config at ${getConfigPath()}`);
    process.exitCode = 1;
    return;
  }

  const runner = new SkillRunner(config);
  const scheduler = new Scheduler(config, runner);

  if (options.once) {
    const enabledSkills = (Object.keys(config.skills) as RuntimeState["enabledSkills"]).filter(
      (id) => config.skills[id]?.enabled,
    );

    console.log("\n" + createBox("Running Skills", `Executing ${enabledSkills.length} enabled skill(s)...\n`));

    const result = await scheduler.runOnceEnabledSkills();
    const state: RuntimeState = {
      startedAt: new Date().toISOString(),
      status: "ran-once",
      mode: "once",
      enabledSkills,
    };
    await saveRuntimeState(state);
    
    if (result.failures > 0) {
      process.exitCode = 1;
      const output = [
        chalk.red("One-time run completed with failures."),
        "",
        `${success(`Success: ${result.successes}`)}`,
        `${chalk.red(`Failed: ${result.failures}`)}`,
        result.failedSkillIds.length > 0
          ? chalk.yellow(`Failed skills: ${result.failedSkillIds.join(", ")}`)
          : "",
      ].filter(Boolean);
      console.log("\n" + createBox("Run Results", output.join("\n")));
      return;
    }
    
    const output = [
      success("All skills executed successfully!"),
      "",
      `${success(`Total: ${result.total}`)}`,
      `${success(`Success: ${result.successes}`)}`,
    ];
    console.log("\n" + createBox("Run Results", output.join("\n")));
    return;
  }

  if (options.daemon) {
    const existing = await loadDaemonState();
    if (existing && isProcessRunning(existing.pid)) {
      console.log("\n" + createBox("Daemon Status", chalk.yellow(`Daemon already running with pid ${existing.pid}.`)));
      return;
    }

    if (existing && !isProcessRunning(existing.pid)) {
      await clearDaemonState();
    }

    const enabledSkills = (Object.keys(config.skills) as RuntimeState["enabledSkills"]).filter(
      (id) => config.skills[id]?.enabled,
    );

    const entryScript = process.argv[1];
    const state = await startDaemon(entryScript);
    
    const output = [
      success(`AI Employee started`),
      "",
      `Daemon PID: ${chalk.cyan(state.pid)}`,
      `Enabled skills: ${enabledSkills.length}`,
      "",
      ...enabledSkills.map((skillId) => {
        const schedule = config.skills[skillId]?.schedule || "not scheduled";
        return `  ${success("•")} ${skillId} (${schedule})`;
      }),
      "",
      info("Use `rexipt-ai stop` to terminate"),
      info("Use `rexipt-ai status` to inspect state"),
    ];
    
    console.log("\n" + createBox("AI Employee Started", output.join("\n")));
    return;
  }

  await runScheduledRuntime(true);
}
