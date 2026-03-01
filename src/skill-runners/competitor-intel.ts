import { AppConfig, SkillResult } from "../types";
import { SlackNotifier } from "../notifications/slack";
import { LlmClient } from "../ai/llm-client";

export class CompetitorIntelSkill {
  readonly id = "competitorIntel" as const;
  private readonly llm: LlmClient;

  constructor(
    private readonly config: AppConfig,
    private readonly notifier: SlackNotifier,
  ) {
    this.llm = new LlmClient(config.llm, config.runtime.http);
  }

  async execute(): Promise<SkillResult> {
    const summary = await this.llm.complete({
      systemPrompt:
        "You are an ecommerce competitor analyst. Provide a concise weekly watchlist with: market moves, pricing risks, messaging themes, and 3 response actions.",
      userPrompt: [
        `Organization: ${this.config.organization.name || "Unknown"}`,
        "No dedicated competitor feed configured yet.",
        "Create an actionable intelligence brief based on general ecommerce competitive dynamics.",
      ].join("\n"),
    });

    const delivery = await this.notifier.send(summary, {
      channel: this.config.notifications.slack.competitorChannel,
      title: "🔍 Weekly Competitor Watch",
    });

    return {
      skillId: this.id,
      summary,
      delivery,
      severity: "info",
    };
  }
}
