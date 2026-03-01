import { updateGoogleAdsAccessToken } from "../lib/config-manager";
import { GoogleAdsIntegration } from "../integrations/google-ads";
import { MetaAdsIntegration } from "../integrations/meta-ads";
import { TikTokAdsIntegration } from "../integrations/tiktok-ads";
import { ShopifyIntegration } from "../integrations/shopify";
import { loadAnomalyState, saveAnomalyState } from "../lib/config-manager";
import { SlackNotifier } from "../notifications/slack";
import { TelegramNotifier } from "../notifications/telegram";
import { AppConfig, DateRange, Severity, SkillResult } from "../types";
import { getLast24HoursRangeUtc, getYesterdayRangeUtc } from "../utils/date-range";
import { RunHistoryStore } from "../storage/run-history";
import { LlmClient } from "../ai/llm-client";
import { RemediationActionsSchema } from "../ai/llm-schemas";

function buildAnomalyKey(anomalies: string[]): string {
  return anomalies.join(" | ").toLowerCase();
}

function pickSeverity(
  anomalies: string[],
  totalSpend: number,
  mer: number,
  criticalSpend: number,
  criticalMer: number,
): Severity {
  if (totalSpend >= criticalSpend || mer <= criticalMer) {
    return "critical";
  }
  if (anomalies.length > 0) {
    return "warn";
  }
  return "info";
}

export class AnomalyDetectionSkill {
  readonly id = "anomalyDetection" as const;

  private readonly shopify: ShopifyIntegration;
  private readonly googleAds: GoogleAdsIntegration;
  private readonly metaAds: MetaAdsIntegration;
  private readonly tiktokAds: TikTokAdsIntegration;
  private readonly actionStore = new RunHistoryStore();
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

    const [shopify, googleAds, metaAds, tiktokAds] = await Promise.all([
      this.shopify.getMetricsForRange(range),
      this.googleAds.getMetricsForRange(range),
      this.metaAds.getMetricsForRange(range),
      this.tiktokAds.getMetricsForRange(range),
    ]);

    const totalSpend = googleAds.spend + metaAds.spend + tiktokAds.spend;
    const totalRevenue = shopify.revenue;
    const mer = totalSpend > 0 ? totalRevenue / totalSpend : 0;

    const thresholds = {
      maxDailySpend:
        this.config.skills.anomalyDetection.thresholds?.maxDailySpend ?? 15000,
      minMer: this.config.skills.anomalyDetection.thresholds?.minMer ?? 1.2,
      minOrdersIfSpendPositive:
        this.config.skills.anomalyDetection.thresholds?.minOrdersIfSpendPositive ?? 1,
      cooldownMinutes:
        this.config.skills.anomalyDetection.thresholds?.cooldownMinutes ?? 240,
      criticalSpend:
        this.config.skills.anomalyDetection.thresholds?.criticalSpend ?? 25000,
      criticalMer:
        this.config.skills.anomalyDetection.thresholds?.criticalMer ?? 0.8,
    };

    const anomalies: string[] = [];
    if (totalSpend > thresholds.maxDailySpend) {
      anomalies.push(
        `Ad spend exceeded threshold: $${totalSpend.toFixed(2)} > $${thresholds.maxDailySpend.toFixed(2)}`,
      );
    }

    if (totalSpend > 0 && mer < thresholds.minMer) {
      anomalies.push(
        `Blended MER below threshold: ${mer.toFixed(2)}x < ${thresholds.minMer.toFixed(2)}x`,
      );
    }

    if (totalSpend > 0 && shopify.orders < thresholds.minOrdersIfSpendPositive) {
      anomalies.push(`Paid spend detected with low order count: ${shopify.orders} orders`);
    }

    const baselines = this.actionStore.listBaselines();
    const spendBaseline = baselines.find((b) => b.metricKey === "totalSpend");
    const merBaseline = baselines.find((b) => b.metricKey === "blendedMer");

    if (spendBaseline && totalSpend > spendBaseline.value * 1.5) {
      anomalies.push(
        `Ad spend significantly above baseline: $${totalSpend.toFixed(2)} > $${(spendBaseline.value * 1.5).toFixed(2)} (150% of baseline)`,
      );
    }

    if (merBaseline && mer < merBaseline.value * 0.7) {
      anomalies.push(
        `MER significantly below baseline: ${mer.toFixed(2)}x < ${(merBaseline.value * 0.7).toFixed(2)}x (70% of baseline)`,
      );
    }

    if (anomalies.length === 0) {
      return {
        skillId: this.id,
        anomalyDetected: false,
        anomalies: [],
        metrics: { totalSpend, totalRevenue, mer, orders: shopify.orders },
        severity: "info",
      };
    }

    const severity = pickSeverity(
      anomalies,
      totalSpend,
      mer,
      thresholds.criticalSpend,
      thresholds.criticalMer,
    );

    const anomalyKey = buildAnomalyKey(anomalies);
    const state = await loadAnomalyState();
    const lastAlertAt = state.lastAlertAtByKey[anomalyKey];
    const now = new Date();

    if (lastAlertAt) {
      const elapsedMs = now.getTime() - new Date(lastAlertAt).getTime();
      const cooldownMs = thresholds.cooldownMinutes * 60 * 1000;
      if (elapsedMs < cooldownMs) {
        const llmResponse = await this.llm.completeStructured<{ actions: string[] }>({
          schema: RemediationActionsSchema,
          systemPrompt:
            "You are an ecommerce incident analyst. Analyze the anomalies and return a JSON object with an 'actions' array of concise, prioritized remediation actions.",
          userPrompt: [
            `Anomalies: ${anomalies.join(" | ")}`,
            `Revenue: ${totalRevenue.toFixed(2)}`,
            `Spend: ${totalSpend.toFixed(2)}`,
            `MER: ${mer.toFixed(2)}`,
            `Orders: ${shopify.orders}`,
          ].join("\n"),
        });
        const parsedActions = llmResponse.actions;
        return {
          skillId: this.id,
          anomalyDetected: true,
          alertSuppressed: true,
          anomalies,
          metrics: { totalSpend, totalRevenue, mer, orders: shopify.orders },
          severity,
          recommendedActions: parsedActions,
        };
      }
    }

    const llmResponse = await this.llm.completeStructured<{ actions: string[] }>({
      schema: RemediationActionsSchema,
      systemPrompt:
        "You are an ecommerce incident analyst. Analyze the anomalies and return a JSON object with an 'actions' array of concise, prioritized remediation actions.",
      userPrompt: [
        `Anomalies: ${anomalies.join(" | ")}`,
        `Revenue: ${totalRevenue.toFixed(2)}`,
        `Spend: ${totalSpend.toFixed(2)}`,
        `MER: ${mer.toFixed(2)}`,
        `Orders: ${shopify.orders}`,
      ].join("\n"),
    });
    const parsedActions = llmResponse.actions;

    const message = [
      `${severity.toUpperCase()} Anomaly Alert`,
      ...anomalies.map((a, idx) => `${idx + 1}. ${a}`),
      `Context: revenue=$${totalRevenue.toFixed(2)} spend=$${totalSpend.toFixed(2)} MER=${mer.toFixed(2)}x orders=${shopify.orders}`,
      `Recommended actions: ${parsedActions.join(" | ")}`,
    ].join("\n");

    // Send to Slack
    const slackDelivery = await this.notifier.send(message, {
      channel: this.config.notifications.slack.alertsChannel,
      title: "🚨 Anomaly Alert",
    });

    // Send to Telegram if enabled
    if (this.telegramNotifier) {
      try {
        await this.telegramNotifier.send(message, {
          channel: "alerts",
        });
      } catch (error) {
        // Log but don't fail the skill if Telegram fails
        console.error("Telegram delivery failed:", error);
      }
    }

    state.lastAlertAtByKey[anomalyKey] = now.toISOString();
    await saveAnomalyState(state);

    if (parsedActions.length > 0) {
      for (const action of parsedActions) {
        this.actionStore.enqueueAction({
          createdAt: now.toISOString(),
          sourceSkillId: this.id,
          title: "Anomaly remediation",
          details: action,
          severity,
          status: "pending",
        });
      }
    }

    return {
      skillId: this.id,
      anomalyDetected: true,
      alertSuppressed: false,
      anomalies,
      metrics: { totalSpend, totalRevenue, mer, orders: shopify.orders },
      delivery: slackDelivery,
      severity,
      recommendedActions: parsedActions,
    };
  }
}
