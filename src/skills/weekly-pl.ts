import { AppConfig, SkillResult } from "../types";
import { SlackNotifier } from "../notifications/slack";
import { ShopifyIntegration } from "../integrations/shopify";
import { GoogleAdsIntegration } from "../integrations/google-ads";
import { MetaAdsIntegration } from "../integrations/meta-ads";
import { KlaviyoIntegration } from "../integrations/klaviyo";
import { updateGoogleAdsAccessToken } from "../lib/config-manager";
import { DateRange } from "../types";
import { LlmClient } from "../ai/llm-client";

function getLast7DaysRangeUtc(): DateRange {
  const end = new Date();
  const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
  return { start, end };
}

export class WeeklyPLSkill {
  readonly id = "weeklyPL" as const;
  private readonly llm: LlmClient;

  constructor(
    private readonly config: AppConfig,
    private readonly notifier: SlackNotifier,
  ) {
    this.llm = new LlmClient(config.llm, config.runtime.http);
  }

  async execute(): Promise<SkillResult> {
    const range = getLast7DaysRangeUtc();

    const shopify = new ShopifyIntegration(this.config.integrations.shopify, this.config.runtime.http);
    const google = new GoogleAdsIntegration(this.config.integrations.googleAds, this.config.runtime.http, {
      onTokenRefreshed: updateGoogleAdsAccessToken,
    });
    const meta = new MetaAdsIntegration(this.config.integrations.metaAds, this.config.runtime.http);
    const klaviyo = new KlaviyoIntegration(this.config.integrations.klaviyo, this.config.runtime.http);

    const [s, g, m, k] = await Promise.all([
      shopify.getMetricsForRange(range),
      google.getMetricsForRange(range),
      meta.getMetricsForRange(range),
      klaviyo.getMetricsForRange(range),
    ]);

    const revenue = s.revenue + k.campaignRevenue + k.flowRevenue;
    const spend = g.spend + m.spend;
    const cogs = revenue * this.config.runtime.finance.defaultCogsRate;
    const contribution = revenue - spend - cogs;

    const summaryHeader = [
      "Weekly P&L",
      `Revenue: $${revenue.toFixed(2)}`,
      `Ad Spend: $${spend.toFixed(2)}`,
      `Estimated COGS: $${cogs.toFixed(2)} (rate ${(this.config.runtime.finance.defaultCogsRate * 100).toFixed(1)}%)`,
      `Estimated Contribution: $${contribution.toFixed(2)}`,
    ].join("\n");
    const llmNarrative = await this.llm.complete({
      systemPrompt:
        "You are a CFO advisor for ecommerce operators. Provide a concise interpretation with 3 actions to improve contribution next week.",
      userPrompt: summaryHeader,
    });
    const summary = `${summaryHeader}\n\nAI Commentary\n${llmNarrative}`;

    const delivery = await this.notifier.send(summary, {
      channel: this.config.notifications.slack.financeChannel,
      title: "💰 Weekly P&L Report",
    });

    return {
      skillId: this.id,
      summary,
      delivery,
      metrics: { revenue, spend, cogs, contribution },
      severity: contribution < 0 ? "warn" : "info",
    };
  }
}
