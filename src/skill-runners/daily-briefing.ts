import { updateGoogleAdsAccessToken } from "../lib/config-manager";
import { GoogleAdsIntegration } from "../integrations/google-ads";
import { KlaviyoIntegration } from "../integrations/klaviyo";
import { MetaAdsIntegration } from "../integrations/meta-ads";
import { ShopifyIntegration } from "../integrations/shopify";
import { TikTokAdsIntegration } from "../integrations/tiktok-ads";
import { TikTokShopIntegration } from "../integrations/tiktok-shop";
import { SlackNotifier } from "../notifications/slack";
import { TelegramNotifier } from "../notifications/telegram";
import { AppConfig, DateRange, SkillResult } from "../types/index";
import { getLast24HoursRangeUtc, getYesterdayRangeUtc } from "../utils/date-range";
import { validateDailyBriefingOutput } from "../validation/output-validator";
import { LlmClient } from "../ai/llm-client";
import { DailyBriefingInsightsSchema } from "../ai/llm-schemas";
import { getStoreData } from "../lib/store-cache";
import { loadSkillPrompt } from "../lib/skill-loader";

export class DailyBriefingSkill {
  readonly id = "dailyBriefing" as const;

  private readonly shopify: ShopifyIntegration;
  private readonly googleAds: GoogleAdsIntegration;
  private readonly metaAds: MetaAdsIntegration;
  private readonly tiktokAds: TikTokAdsIntegration;
  private readonly tiktokShop: TikTokShopIntegration;
  private readonly klaviyo: KlaviyoIntegration;
  private readonly llm: LlmClient;
  private readonly telegramNotifier?: TelegramNotifier;

  constructor(
    private readonly config: AppConfig,
    private readonly notifier: SlackNotifier,
  ) {
    this.shopify = new ShopifyIntegration(config.integrations.shopify, config.runtime.http);
    this.googleAds = new GoogleAdsIntegration(
      config.integrations.googleAds,
      config.runtime.http,
      { onTokenRefreshed: updateGoogleAdsAccessToken },
    );
    this.metaAds = new MetaAdsIntegration(config.integrations.metaAds, config.runtime.http);
    this.tiktokAds = new TikTokAdsIntegration(config.integrations.tiktokAds, config.runtime.http);
    this.tiktokShop = new TikTokShopIntegration(config.integrations.tiktokShop, config.runtime.http);
    this.klaviyo = new KlaviyoIntegration(config.integrations.klaviyo, config.runtime.http);
    this.llm = new LlmClient(config.llm, config.runtime.http);
    if (config.notifications.telegram.enabled) {
      this.telegramNotifier = new TelegramNotifier(config.notifications.telegram, config.runtime.http);
    }
  }

  private resolveRange(): DateRange {
    return this.config.runtime.defaultReportingWindow === "last24h"
      ? getLast24HoursRangeUtc()
      : getYesterdayRangeUtc();
  }

  async execute(): Promise<SkillResult> {
    const range = this.resolveRange();

    const [shopify, googleAds, metaAds, tiktokAds, tiktokShop, klaviyo] = await Promise.all([
      this.shopify.getMetricsForRange(range),
      this.googleAds.getMetricsForRange(range),
      this.metaAds.getMetricsForRange(range),
      this.tiktokAds.getMetricsForRange(range),
      this.tiktokShop.getMetricsForRange(range),
      this.klaviyo.getMetricsForRange(range),
    ]);

    const totalRevenue =
      shopify.revenue + tiktokShop.revenue + klaviyo.campaignRevenue + klaviyo.flowRevenue;
    const totalSpend = googleAds.spend + metaAds.spend + tiktokAds.spend;
    const blendedMer = totalSpend > 0 ? totalRevenue / totalSpend : 0;
    const totalOrders = shopify.orders + tiktokShop.orders;
    const blendedAov = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    const baseMessage = [
      "Daily Briefing",
      `Revenue: $${totalRevenue.toFixed(2)}`,
      `Spend: $${totalSpend.toFixed(2)}`,
      `Blended MER: ${blendedMer.toFixed(2)}x`,
      `Orders: ${totalOrders}`,
      `AOV: $${blendedAov.toFixed(2)}`,
      `Attribution: Google $${googleAds.attributedRevenue.toFixed(2)} | Meta $${metaAds.attributedRevenue.toFixed(2)}`,
      `TikTok Attribution: $${tiktokAds.attributedRevenue.toFixed(2)}`,
      `Store Revenue: Shopify $${shopify.revenue.toFixed(2)} | TikTok Shop $${tiktokShop.revenue.toFixed(2)}`,
      `Email/SMS Revenue: Campaigns $${klaviyo.campaignRevenue.toFixed(2)} | Flows $${klaviyo.flowRevenue.toFixed(2)}`,
    ].join("\n");

    validateDailyBriefingOutput(baseMessage, {
      totalRevenue,
      totalSpend,
      blendedMer,
      orders: totalOrders,
      avgOrderValue: blendedAov,
      googleAttributedRevenue: googleAds.attributedRevenue,
      metaAttributedRevenue: metaAds.attributedRevenue,
      campaignRevenue: klaviyo.campaignRevenue,
      flowRevenue: klaviyo.flowRevenue,
    });

    // Load store context and skill template - MD templates are required, no hardcoded fallbacks
    const storeData = await getStoreData(this.shopify, this.config);
    const systemPrompt = await loadSkillPrompt(this.id, storeData, this.config);

    const llmResponse = await this.llm.completeStructured<{ insights: string[] }>({
      schema: DailyBriefingInsightsSchema,
      systemPrompt,
      userPrompt: [
        `Organization: ${this.config.organization.name || "Unknown"}`,
        `Revenue: ${totalRevenue.toFixed(2)}`,
        `Spend: ${totalSpend.toFixed(2)}`,
        `MER: ${blendedMer.toFixed(2)}`,
        `Orders: ${shopify.orders}`,
        `AOV: ${shopify.avgOrderValue.toFixed(2)}`,
        `Google attributed revenue: ${googleAds.attributedRevenue.toFixed(2)}`,
        `Meta attributed revenue: ${metaAds.attributedRevenue.toFixed(2)}`,
        `Campaign revenue: ${klaviyo.campaignRevenue.toFixed(2)}`,
        `Flow revenue: ${klaviyo.flowRevenue.toFixed(2)}`,
      ].join("\n"),
    });

    const message = `${baseMessage}\n\nAI Recommendations\n${llmResponse.insights.map((insight: string, idx: number) => `${idx + 1}. ${insight}`).join("\n")}`;

    // Send to Slack
    const slackDelivery = await this.notifier.send(message, {
      channel: this.config.notifications.slack.channel,
      title: "📊 Daily Briefing",
    });

    // Send to Telegram if enabled
    let telegramDelivery = { delivered: false, transport: "telegram" };
    if (this.telegramNotifier) {
      try {
        telegramDelivery = await this.telegramNotifier.send(message, {
          channel: this.config.notifications.telegram.channel,
        });
      } catch (error) {
        // Log but don't fail the skill if Telegram fails
        console.error("Telegram delivery failed:", error);
      }
    }

    return {
      skillId: this.id,
      message,
      metrics: {
        totalRevenue,
        totalSpend,
        blendedMer,
        orders: totalOrders,
      },
      delivery: slackDelivery.delivered || telegramDelivery.delivered ? slackDelivery : telegramDelivery,
    };
  }
}
