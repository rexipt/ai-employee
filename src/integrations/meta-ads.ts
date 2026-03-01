import { AdsMetrics, DateRange } from "../types/index";
import { toDateOnly } from "../utils/date-range";
import { HttpClientConfig, requestWithPolicy } from "../utils/http-client";

interface MetaInsightsResponse {
  data?: Array<{
    spend?: string;
    actions?: Array<{ action_type?: string; value?: string }>;
    purchase_roas?: Array<{ value?: string }>;
  }>;
}

function parseNumber(value: string | number | undefined): number {
  const n = Number.parseFloat(String(value ?? 0));
  return Number.isFinite(n) ? n : 0;
}

export class MetaAdsIntegration {
  constructor(
    private readonly config: {
      enabled: boolean;
      adAccountId: string;
      accessToken: string;
      apiVersion: string;
    },
    private readonly httpConfig: HttpClientConfig,
  ) {}

  private isReady(): boolean {
    return Boolean(
      this.config.enabled && this.config.adAccountId && this.config.accessToken,
    );
  }

  async getMetricsForRange(range: DateRange): Promise<AdsMetrics> {
    if (!this.config?.enabled) {
      return {
        spend: 0,
        conversions: 0,
        attributedRevenue: 0,
        source: "meta-ads-disabled",
      };
    }

    if (!this.isReady()) {
      return {
        spend: 0,
        conversions: 0,
        attributedRevenue: 0,
        source: "meta-ads-config-missing",
      };
    }

    const version = this.config.apiVersion || "v20.0";
    const accountId = this.config.adAccountId.startsWith("act_")
      ? this.config.adAccountId
      : `act_${this.config.adAccountId}`;

    const params = new URLSearchParams({
      access_token: this.config.accessToken,
      level: "account",
      fields: "spend,actions,purchase_roas",
      time_range: JSON.stringify({
        since: toDateOnly(range.start),
        until: toDateOnly(range.end),
      }),
    });

    const response = await requestWithPolicy(
      `https://graph.facebook.com/${version}/${accountId}/insights?${params.toString()}`,
      this.httpConfig,
      { method: "GET" },
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Meta Ads API error ${response.status}: ${body}`);
    }

    const payload = (await response.json()) as MetaInsightsResponse;
    const row = payload.data?.[0];

    if (!row) {
      return {
        spend: 0,
        conversions: 0,
        attributedRevenue: 0,
        source: "meta-ads-api",
      };
    }

    const spend = parseNumber(row.spend);

    const conversionsFromActions = (row.actions || [])
      .filter((a) => a.action_type === "purchase")
      .reduce((sum, a) => sum + parseNumber(a.value), 0);

    const attributedRevenueFromRoas = (row.purchase_roas || []).reduce(
      (sum, item) => sum + parseNumber(item.value) * spend,
      0,
    );

    return {
      spend,
      conversions: conversionsFromActions,
      attributedRevenue: attributedRevenueFromRoas,
      source: "meta-ads-api",
    };
  }
}
