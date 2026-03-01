import cron, { ScheduledTask } from "node-cron";
import { logError, logInfo, logSuccess, logger } from "../lib/logger";
import { metrics } from "../lib/metrics";
import { AppConfig, SkillId, SkillResult } from "../types";
import { SkillRunner } from "./skill-runner";
import { RunHistoryStore } from "../storage/run-history";

export interface RunBatchResult {
  total: number;
  successes: number;
  failures: number;
  failedSkillIds: SkillId[];
}

export class Scheduler {
  private jobs: ScheduledTask[] = [];
  private runHistory = new RunHistoryStore();

  constructor(
    private readonly config: AppConfig,
    private readonly runner: SkillRunner,
  ) {}

  async runOnceEnabledSkills(): Promise<RunBatchResult> {
    const enabledIds = this.getEnabledSkills();
    let successes = 0;
    const failedSkillIds: SkillId[] = [];

    for (const skillId of enabledIds) {
      const result = await this.executeSkill(skillId);
      if (result) {
        successes += 1;
      } else {
        failedSkillIds.push(skillId);
      }
    }

    return {
      total: enabledIds.length,
      successes,
      failures: failedSkillIds.length,
      failedSkillIds,
    };
  }

  start(): void {
    const enabledIds = this.getEnabledSkills();

    if (enabledIds.length === 0) {
      logInfo("No enabled skills found. Update config to enable skills.");
      return;
    }

    for (const skillId of enabledIds) {
      const schedule = this.config.skills[skillId].schedule;
      if (!schedule) {
        logInfo(`No schedule configured for ${skillId}; skipping schedule registration.`);
        continue;
      }

      const job = cron.schedule(schedule, () => {
        void this.executeSkill(skillId);
      });

      this.jobs.push(job);
      logSuccess(`Scheduled ${skillId} with cron '${schedule}'`);
    }
  }

  stop(): void {
    this.jobs.forEach((job) => job.stop());
    this.jobs = [];
  }

  async executeSkill(skillId: SkillId): Promise<SkillResult | null> {
    const startedAt = new Date();
    const correlationId = `skill-${skillId}-${Date.now()}`;
    logger.setCorrelationId(correlationId);
    
    try {
      logInfo(`Running skill: ${skillId}`);
      const result = await this.runner.run(skillId);
      const durationMs = Date.now() - startedAt.getTime();
      
      this.logSkillOutcome(skillId, result);

      // Record metrics
      metrics.recordSkillExecution({
        skillId,
        executionTimeMs: durationMs,
        success: true,
        apiCalls: 0, // TODO: track API calls in integrations
        cacheHits: 0, // TODO: track cache hits
        cacheMisses: 0, // TODO: track cache misses
        errors: 0,
      });
      metrics.recordMetric("skill.execution.time", durationMs, { skillId, status: "success" });

      this.runHistory.insert({
        skillId,
        status: "success",
        startedAt: startedAt.toISOString(),
        completedAt: new Date().toISOString(),
        durationMs,
        message: this.buildRunMessage(result),
        metadataJson: JSON.stringify({
          metrics: result.metrics || {},
          severity: result.severity || "info",
          anomalies: result.anomalies || [],
          recommendedActions: result.recommendedActions || [],
          correlationId,
        }),
      });

      logger.info(`Skill ${skillId} completed successfully`, {
        skillId,
        durationMs,
        correlationId,
      });

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const durationMs = Date.now() - startedAt.getTime();
      
      logError(`Skill ${skillId} failed: ${message}`);

      // Record error metrics
      metrics.recordSkillExecution({
        skillId,
        executionTimeMs: durationMs,
        success: false,
        apiCalls: 0,
        cacheHits: 0,
        cacheMisses: 0,
        errors: 1,
      });
      metrics.recordMetric("skill.execution.time", durationMs, { skillId, status: "failed" });
      metrics.recordMetric("skill.execution.error", 1, { skillId, error: message });

      this.runHistory.insert({
        skillId,
        status: "failed",
        startedAt: startedAt.toISOString(),
        completedAt: new Date().toISOString(),
        durationMs,
        message,
        metadataJson: JSON.stringify({ error: message, correlationId }),
      });

      logger.error(`Skill ${skillId} failed`, {
        skillId,
        durationMs,
        error: message,
        correlationId,
      });

      return null;
    } finally {
      logger.clearCorrelationId();
    }
  }

  private getEnabledSkills(): SkillId[] {
    return (Object.keys(this.config.skills) as SkillId[]).filter(
      (id) => this.config.skills[id]?.enabled,
    );
  }

  private buildRunMessage(result: SkillResult): string {
    if (result.summary) {
      return result.summary;
    }
    if (result.message) {
      return result.message;
    }
    if (result.anomalyDetected === false) {
      return "No anomalies detected";
    }
    if (result.alertSuppressed) {
      return "Anomaly alert suppressed by cooldown";
    }
    if (result.anomalies?.length) {
      return result.anomalies.join(" | ");
    }
    return "Completed";
  }

  private logSkillOutcome(skillId: SkillId, result: SkillResult): void {
    if (result.metrics && typeof result.metrics.blendedMer === "number") {
      logSuccess(`Skill ${skillId} completed. MER=${result.metrics.blendedMer.toFixed(2)}x`);
      return;
    }

    if (result.anomalyDetected === false) {
      logSuccess(`Skill ${skillId} completed. No anomalies detected.`);
      return;
    }

    if (result.anomalyDetected && result.alertSuppressed) {
      logSuccess(
        `Skill ${skillId} completed. Duplicate anomaly alert suppressed by cooldown policy.`,
      );
      return;
    }

    if (result.anomalyDetected) {
      logSuccess(
        `Skill ${skillId} completed (${result.severity || "warn"}). ${result.anomalies?.length || 0} anomaly signal(s) detected.`,
      );
      return;
    }

    if (result.segments) {
      logSuccess(
        `Skill ${skillId} completed. Segments: highValue=${result.segments.highValue.length}, atRisk=${result.segments.atRisk.length}, churned=${result.segments.churned.length}`,
      );
      return;
    }

    logSuccess(`Skill ${skillId} completed.`);
  }
}
