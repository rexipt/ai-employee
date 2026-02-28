import { AdsMetrics, DateRange } from "../types/index";
import { toDateOnly } from "../utils/date-range";
import { HttpClientConfig, requestWithPolicy } from "../utils/http-client";

interface TikTokAdsResponse {
  code?: number;
  message?: string;
  request_id?: string;
  data?: {
    list?: Array<{
      stat_datetime?: string;
      spend?: string;
      conversions?: string;
      conversion_value?: string;
    }>;
  };
}

function parseNumber(value: string | number | undefined): number {
  const n = Number.parseFloat(String(value ?? 0));
  return Number.isFinite(n) ? n : 0;
}

export class TikTokAdsIntegration {
  constructor(
    private readonly config: {
      enabled: boolean;
      advertiserId: string;
      accessToken: string;
      apiVersion: string;
    },
    private readonly httpConfig: HttpClientConfig,
  ) {}

  private isReady(): boolean {
    return Boolean(
      this.config.enabled && this.config.advertiserId && this.config.accessToken,
    );
  }

  async getMetricsForRange(range: DateRange): Promise<AdsMetrics> {
    if (!this.config?.enabled) {
      return {
        spend: 0,
        conversions: 0,
        attributedRevenue: 0,
        source: "tiktok-ads-disabled",
      };
    }

    if (!this.isReady()) {
      return {
        spend: 0,
        conversions: 0,
        attributedRevenue: 0,
        source: "tiktok-ads-config-missing",
      };
    }

    const version = this.config.apiVersion || "v1.3";
    const startDate = toDateOnly(range.start);
    const endDate = toDateOnly(range.end);

    // TikTok Ads API endpoint for reporting
    const url = `https://business-api.tiktok.com/open_api/${version}/report/integrated/get/`;

    const payload = {
      advertiser_id: this.config.advertiserId,
      service_type: "AUCTION",
      report_type: "BASIC",
      data_level: "AUCTION_ADVERTISER",
      dimensions: ["stat_time_day"],
      metrics: ["spend", "conversions", "conversion_value"],
      start_date: startDate,
      end_date: endDate,
      page: 1,
      page_size: 1000,
    };

    const response = await requestWithPolicy(url, this.httpConfig, {
      method: "POST",
      headers: {
        "Access-Token": this.config.accessToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`TikTok Ads API error ${response.status}: ${body}`);
    }

    const data = (await response.json()) as TikTokAdsResponse;

    if (data.code !== 0 || !data.data?.list) {
      return {
        spend: 0,
        conversions: 0,
        attributedRevenue: 0,
        source: "tiktok-ads-api",
      };
    }

    // Aggregate metrics across all days in the range
    const totalSpend = data.data.list.reduce((sum, row) => sum + parseNumber(row.spend), 0);
    const totalConversions = data.data.list.reduce(
      (sum, row) => sum + parseNumber(row.conversions),
      0,
    );
    const totalRevenue = data.data.list.reduce(
      (sum, row) => sum + parseNumber(row.conversion_value),
      0,
    );

    return {
      spend: totalSpend,
      conversions: totalConversions,
      attributedRevenue: totalRevenue,
      source: "tiktok-ads-api",
    };
  }
}
