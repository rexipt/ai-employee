import { KlaviyoIntegration } from "../integrations/klaviyo";
import {
  ShopifyCustomerOrderStat,
  ShopifyIntegration,
} from "../integrations/shopify";
import { SlackNotifier } from "../notifications/slack";
import { AppConfig, SkillResult } from "../types/index";
import { daysSince, getYesterdayRangeUtc } from "../utils/date-range";
import { LlmClient } from "../ai/llm-client";

export class CustomerSegmentationSkill {
  readonly id = "customerSegmentation" as const;
  private readonly llm: LlmClient;

  private readonly shopify: ShopifyIntegration;
  private readonly klaviyo: KlaviyoIntegration;

  constructor(
    private readonly config: AppConfig,
    private readonly notifier: SlackNotifier,
  ) {
    this.shopify = new ShopifyIntegration(config.integrations.shopify, config.runtime.http);
    this.klaviyo = new KlaviyoIntegration(config.integrations.klaviyo, config.runtime.http);
    this.llm = new LlmClient(config.llm, config.runtime.http);
  }

  async execute(): Promise<SkillResult> {
    const [{ customers }, klaviyoMetrics] = await Promise.all([
      this.shopify.getCustomerOrderStats({ lookbackDays: 180 }),
      this.klaviyo.getMetricsForRange(getYesterdayRangeUtc()),
    ]);

    if (customers.length === 0) {
      return {
        skillId: this.id,
        segments: {
          highValue: [],
          atRisk: [],
          churned: [],
        },
        summary: "No customer data available for segmentation.",
      };
    }

    const sortedBySpend = [...customers].sort((a, b) => b.totalSpend - a.totalSpend);
    const highValueCount = Math.max(1, Math.ceil(sortedBySpend.length * 0.2));
    const highValue = sortedBySpend.slice(0, highValueCount);

    const atRisk = customers.filter((c) => {
      const d = daysSince(c.lastOrderDate);
      return d >= 30 && d < 90;
    });

    const churned = customers.filter((c) => daysSince(c.lastOrderDate) >= 90);

    const topPreview = (list: ShopifyCustomerOrderStat[]): string =>
      list
        .slice(0, 3)
        .map(
          (c) =>
            `${c.firstName || "Customer"} ${c.lastName || ""}`.trim() ||
            c.email ||
            c.customerId,
        )
        .join(", ");

    const segmentationData = [
      "Customer Segmentation",
      `Total Customers: ${customers.length}`,
      `High Value (top 20%): ${highValue.length}`,
      `At Risk (30-89 days inactive): ${atRisk.length}`,
      `Churned (90+ days inactive): ${churned.length}`,
      `Top Customers: ${topPreview(highValue) || "n/a"}`,
      `Klaviyo Revenue Signals: campaign=$${klaviyoMetrics.campaignRevenue.toFixed(2)} flow=$${klaviyoMetrics.flowRevenue.toFixed(2)}`,
    ].join("\n");
    const llmSummary = await this.llm.complete({
      systemPrompt:
        "You are a CRM strategist. Generate a concise segmentation playbook with one tactic per segment and one campaign idea.",
      userPrompt: segmentationData,
    });
    const summary = `${segmentationData}\n\nAI Actions\n${llmSummary}`;

    const delivery = await this.notifier.send(summary, {
      channel: this.config.notifications.slack.segmentationChannel,
      title: "👥 Customer Segmentation",
    });

    return {
      skillId: this.id,
      segments: {
        highValue,
        atRisk,
        churned,
      },
      summary,
      delivery,
    };
  }
}
