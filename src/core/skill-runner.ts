import { AppConfig, SkillId, SkillResult } from "../types";
import { AnomalyDetectionSkill } from "../skills/anomaly-detection";
import { CompetitorIntelSkill } from "../skills/competitor-intel";
import { CreativeStrategySkill } from "../skills/creative-strategy";
import { CustomerSegmentationSkill } from "../skills/customer-segmentation";
import { DailyBriefingSkill } from "../skills/daily-briefing";
import { WeeklyPLSkill } from "../skills/weekly-pl";
import { SlackNotifier } from "../notifications/slack";

export class SkillRunner {
  private readonly notifier: SlackNotifier;

  constructor(private readonly config: AppConfig) {
    this.notifier = new SlackNotifier(config.notifications.slack, config.runtime.http);
  }

  async run(skillId: SkillId): Promise<SkillResult> {
    switch (skillId) {
      case "dailyBriefing":
        return new DailyBriefingSkill(this.config, this.notifier).execute();
      case "anomalyDetection":
        return new AnomalyDetectionSkill(this.config, this.notifier).execute();
      case "customerSegmentation":
        return new CustomerSegmentationSkill(this.config, this.notifier).execute();
      case "competitorIntel":
        return new CompetitorIntelSkill(this.config, this.notifier).execute();
      case "creativeStrategy":
        return new CreativeStrategySkill(this.config, this.notifier).execute();
      case "weeklyPL":
        return new WeeklyPLSkill(this.config, this.notifier).execute();
      default:
        throw new Error(`Unknown skill: ${skillId}`);
    }
  }
}
