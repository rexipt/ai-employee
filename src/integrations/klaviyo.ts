import { DateRange, KlaviyoMetrics } from "../types/index";
import { toIsoDate } from "../utils/date-range";
import { HttpClientConfig, requestWithPolicy } from "../utils/http-client";

interface KlaviyoMetric {
  id: string;
  type: "metric";
  attributes: {
    name: string;
  };
}

interface KlaviyoEvent {
  id: string;
  type: "event";
  attributes: {
    datetime: string;
    value?: number;
  };
  relationships?: {
    metric?: {
      data?: { id: string; type: "metric" };
    };
  };
}

interface KlaviyoListResponse<T> {
  data: T[];
  included?: KlaviyoMetric[];
}

export class KlaviyoIntegration {
  private readonly baseUrl = "https://a.klaviyo.com/api";

  constructor(
    private readonly config: {
      enabled: boolean;
      apiKey: string;
      apiRevision: string;
      flowRevenueMetricName: string;
      campaignRevenueMetricName: string;
    },
    private readonly httpConfig: HttpClientConfig,
  ) {}

  private isReady(): boolean {
    return Boolean(this.config?.enabled && this.config?.apiKey);
  }

  private async request<T>(path: string, params: URLSearchParams): Promise<T> {
    const url = `${this.baseUrl}${path}?${params.toString()}`;
    const response = await requestWithPolicy(url, this.httpConfig, {
      method: "GET",
      headers: {
        Authorization: `Klaviyo-API-Key ${this.config.apiKey}`,
        Revision: this.config.apiRevision || "2024-07-15",
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Klaviyo API error ${response.status}: ${body}`);
    }

    return (await response.json()) as T;
  }

  async getMetricsForRange(range: DateRange): Promise<KlaviyoMetrics> {
    if (!this.config?.enabled) {
      return {
        campaignRevenue: 0,
        flowRevenue: 0,
        source: "klaviyo-disabled",
      };
    }

    if (!this.isReady()) {
      return {
        campaignRevenue: 0,
        flowRevenue: 0,
        source: "klaviyo-config-missing",
      };
    }

    const params = new URLSearchParams({
      include: "metric",
      "page[size]": "200",
      filter: `and(greater-or-equal(datetime,${toIsoDate(range.start)}),less-than(datetime,${toIsoDate(range.end)}))`,
    });

    const response = await this.request<KlaviyoListResponse<KlaviyoEvent>>(
      "/events",
      params,
    );

    const metricNameById = new Map<string, string>();
    for (const metric of response.included ?? []) {
      if (metric.type === "metric") {
        metricNameById.set(metric.id, metric.attributes?.name || "");
      }
    }

    let campaignRevenue = 0;
    let flowRevenue = 0;

    for (const event of response.data ?? []) {
      const metricId = event.relationships?.metric?.data?.id;
      const metricName = metricId ? metricNameById.get(metricId) || "" : "";
      const value = Number(event.attributes?.value ?? 0);
      if (!Number.isFinite(value) || value <= 0) {
        continue;
      }

      if (metricName.toLowerCase().includes(this.config.flowRevenueMetricName.toLowerCase())) {
        flowRevenue += value;
      } else if (
        metricName
          .toLowerCase()
          .includes(this.config.campaignRevenueMetricName.toLowerCase())
      ) {
        campaignRevenue += value;
      }
    }

    return {
      campaignRevenue,
      flowRevenue,
      source: "klaviyo-api",
    };
  }

  async getProfileByEmail(email: string): Promise<{ id: string; email: string } | null> {
    if (!this.isReady()) {
      return null;
    }

    const filter = `equals(email,\"${email}\")`;
    const params = new URLSearchParams({
      filter,
      "page[size]": "1",
    });

    const response = await this.request<KlaviyoListResponse<{ id: string; attributes: { email: string } }>>(
      "/profiles",
      params,
    );

    const profile = response.data?.[0];
    if (!profile) {
      return null;
    }

    return {
      id: profile.id,
      email: profile.attributes.email,
    };
  }
}
