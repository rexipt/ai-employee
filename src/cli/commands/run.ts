import { Scheduler } from "../../core/scheduler";
import { SkillRunner } from "../../core/skill-runner";
import { getConfigPath, loadConfig } from "../../lib/config-manager";
import { SkillId } from "../../types";
import { createBox, success, error } from "../utils/format";
import chalk from "chalk";

const validSkillIds: SkillId[] = [
  "dailyBriefing",
  "anomalyDetection",
  "customerSegmentation",
  "competitorIntel",
  "creativeStrategy",
  "weeklyPL",
];

export async function runSkillCommand(skillId: string): Promise<void> {
  if (!validSkillIds.includes(skillId as SkillId)) {
    console.log(
      "\n" +
        createBox(
          "Error",
          error(`Invalid skill id: ${skillId}\n\nValid skills: ${validSkillIds.join(", ")}`),
        ),
    );
    process.exitCode = 1;
    return;
  }

  const config = await loadConfig();
  if (!config) {
    console.log(
      "\n" +
        createBox(
          "Error",
          error(`No config found.\n\nRun \`rexipt-ai init\` first. Expected config at ${getConfigPath()}`),
        ),
    );
    process.exitCode = 1;
    return;
  }

  console.log("\n" + createBox("Running Skill", `Executing ${chalk.cyan(skillId)}...\n`));

  const runner = new SkillRunner(config);
  const scheduler = new Scheduler(config, runner);
  const result = await scheduler.executeSkill(skillId as SkillId);

  if (!result) {
    console.log("\n" + createBox("Skill Execution", error(`Skill ${skillId} failed.`)));
    process.exitCode = 1;
    return;
  }

  const output = [
    success(`Skill ${skillId} executed successfully.`),
    "",
    result.message ? chalk.gray(result.message.substring(0, 200)) : "",
  ].filter(Boolean);

  console.log("\n" + createBox("Skill Execution", output.join("\n")));
}

export async function runAllSkillsCommand(): Promise<void> {
  const config = await loadConfig();
  if (!config) {
    console.log(
      "\n" +
        createBox(
          "Error",
          error(`No config found.\n\nRun \`rexipt-ai init\` first. Expected config at ${getConfigPath()}`),
        ),
    );
    process.exitCode = 1;
    return;
  }

  const enabledSkills = Object.keys(config.skills).filter(
    (id) => config.skills[id as keyof typeof config.skills]?.enabled,
  );

  console.log(
    "\n" + createBox("Running All Skills", `Executing ${enabledSkills.length} enabled skill(s)...\n`),
  );

  const runner = new SkillRunner(config);
  const scheduler = new Scheduler(config, runner);
  const result = await scheduler.runOnceEnabledSkills();

  if (result.failures > 0) {
    const output = [
      error("run-all completed with failures."),
      "",
      `${success(`Success: ${result.successes}`)}`,
      `${chalk.red(`Failed: ${result.failures}`)}`,
      result.failedSkillIds.length > 0
        ? chalk.yellow(`Failed skills: ${result.failedSkillIds.join(", ")}`)
        : "",
    ].filter(Boolean);
    console.log("\n" + createBox("Run Results", output.join("\n")));
    process.exitCode = 1;
    return;
  }

  const output = [
    success("All enabled skills executed successfully!"),
    "",
    `${success(`Total: ${result.total}`)}`,
    `${success(`Success: ${result.successes}`)}`,
  ];
  console.log("\n" + createBox("Run Results", output.join("\n")));
}
