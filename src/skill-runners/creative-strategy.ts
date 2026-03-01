import { AppConfig, SkillResult } from "../types";
import { SlackNotifier } from "../notifications/slack";
import { GoogleAdsIntegration } from "../integrations/google-ads";
import { MetaAdsIntegration } from "../integrations/meta-ads";
import { getYesterdayRangeUtc } from "../utils/date-range";
import { updateGoogleAdsAccessToken } from "../lib/config-manager";
import { LlmClient } from "../ai/llm-client";

export class CreativeStrategySkill {
  readonly id = "creativeStrategy" as const;
  private readonly llm: LlmClient;

  constructor(
    private readonly config: AppConfig,
    private readonly notifier: SlackNotifier,
  ) {
    this.llm = new LlmClient(config.llm, config.runtime.http);
  }

  async execute(): Promise<SkillResult> {
    const range = getYesterdayRangeUtc();
    const google = new GoogleAdsIntegration(this.config.integrations.googleAds, this.config.runtime.http, {
      onTokenRefreshed: updateGoogleAdsAccessToken,
    });
    const meta = new MetaAdsIntegration(this.config.integrations.metaAds, this.config.runtime.http);

    const [g, m] = await Promise.all([
      google.getMetricsForRange(range),
      meta.getMetricsForRange(range),
    ]);

    const summary = await this.llm.complete({
      systemPrompt:
        "You are a direct-response creative strategist. Produce a concise creative brief with: 3 angles, 3 hooks, and 3 test ideas.",
      userPrompt: [
        "Creative Strategy Brief",
        `Google conversions: ${g.conversions} | spend: $${g.spend.toFixed(2)} | attributed revenue: $${g.attributedRevenue.toFixed(2)}`,
        `Meta conversions: ${m.conversions} | spend: $${m.spend.toFixed(2)} | attributed revenue: $${m.attributedRevenue.toFixed(2)}`,
      ].join("\n"),
    });

    const delivery = await this.notifier.send(summary, {
      channel: this.config.notifications.slack.creativeChannel,
      title: "🎨 Creative Strategy Brief",
    });

    return {
      skillId: this.id,
      summary,
      delivery,
      metrics: {
        googleConversions: g.conversions,
        metaConversions: m.conversions,
      },
      severity: "info",
    };
  }
}
