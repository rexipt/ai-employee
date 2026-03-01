import { AdsMetrics, DateRange } from "../types/index";
import { toDateOnly } from "../utils/date-range";
import { HttpClientConfig, requestWithPolicy } from "../utils/http-client";

interface GoogleAdsSearchRow {
  metrics?: {
    costMicros?: string;
    conversions?: string;
    conversionsValue?: string;
  };
}

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

function parseNumber(value: string | number | undefined): number {
  const n = Number.parseFloat(String(value ?? 0));
  return Number.isFinite(n) ? n : 0;
}

function isTokenExpired(expiresAt: string): boolean {
  if (!expiresAt) {
    return true;
  }
  return Date.now() >= new Date(expiresAt).getTime() - 60_000;
}

export class GoogleAdsIntegration {
  constructor(
    private readonly config: {
      enabled: boolean;
      customerId: string;
      loginCustomerId: string;
      developerToken: string;
      accessToken: string;
      accessTokenExpiresAt: string;
      refreshToken: string;
      clientId: string;
      clientSecret: string;
      tokenEndpoint: string;
      apiVersion: string;
    },
    private readonly httpConfig: HttpClientConfig,
    private readonly hooks: {
      onTokenRefreshed?: (token: { accessToken: string; accessTokenExpiresAt: string }) => Promise<void>;
    } = {},
  ) {}

  private isReady(): boolean {
    return Boolean(
      this.config.enabled &&
        this.config.customerId &&
        this.config.developerToken &&
        (this.config.accessToken || this.config.refreshToken),
    );
  }

  private async ensureAccessToken(): Promise<string> {
    if (this.config.accessToken && !isTokenExpired(this.config.accessTokenExpiresAt)) {
      return this.config.accessToken;
    }

    if (
      !this.config.refreshToken ||
      !this.config.clientId ||
      !this.config.clientSecret
    ) {
      throw new Error("Google Ads access token expired and refresh credentials are missing");
    }

    const token = await this.refreshAccessToken();
    this.config.accessToken = token.accessToken;
    this.config.accessTokenExpiresAt = token.accessTokenExpiresAt;

    if (this.hooks.onTokenRefreshed) {
      await this.hooks.onTokenRefreshed(token);
    }

    return token.accessToken;
  }

  private async refreshAccessToken(): Promise<{ accessToken: string; accessTokenExpiresAt: string }> {
    const endpoint = this.config.tokenEndpoint || "https://oauth2.googleapis.com/token";
    const body = new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      refresh_token: this.config.refreshToken,
      grant_type: "refresh_token",
    }).toString();

    const response = await requestWithPolicy(endpoint, this.httpConfig, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    if (!response.ok) {
      const raw = await response.text();
      throw new Error(`Google OAuth token refresh failed ${response.status}: ${raw}`);
    }

    const payload = (await response.json()) as GoogleTokenResponse;
    const expiresAt = new Date(Date.now() + payload.expires_in * 1000).toISOString();

    return {
      accessToken: payload.access_token,
      accessTokenExpiresAt: expiresAt,
    };
  }

  private async queryMetrics(range: DateRange, accessToken: string): Promise<AdsMetrics> {
    const version = this.config.apiVersion || "v17";
    const customerId = this.config.customerId.replace(/-/g, "");
    const endpoint = `https://googleads.googleapis.com/${version}/customers/${customerId}/googleAds:searchStream`;

    const query = `
      SELECT
        metrics.cost_micros,
        metrics.conversions,
        metrics.conversions_value
      FROM customer
      WHERE segments.date BETWEEN '${toDateOnly(range.start)}' AND '${toDateOnly(range.end)}'
    `;

    const response = await requestWithPolicy(endpoint, this.httpConfig, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "developer-token": this.config.developerToken,
        ...(this.config.loginCustomerId
          ? { "login-customer-id": this.config.loginCustomerId.replace(/-/g, "") }
          : {}),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Google Ads API error ${response.status}: ${body}`);
    }

    const chunks = (await response.json()) as Array<{ results?: GoogleAdsSearchRow[] }>;

    let costMicros = 0;
    let conversions = 0;
    let conversionsValue = 0;

    for (const chunk of chunks || []) {
      for (const row of chunk.results || []) {
        costMicros += parseNumber(row.metrics?.costMicros);
        conversions += parseNumber(row.metrics?.conversions);
        conversionsValue += parseNumber(row.metrics?.conversionsValue);
      }
    }

    return {
      spend: costMicros / 1_000_000,
      conversions,
      attributedRevenue: conversionsValue,
      source: "google-ads-api",
    };
  }

  async getMetricsForRange(range: DateRange): Promise<AdsMetrics> {
    if (!this.config?.enabled) {
      return {
        spend: 0,
        conversions: 0,
        attributedRevenue: 0,
        source: "google-ads-disabled",
      };
    }

    if (!this.isReady()) {
      return {
        spend: 0,
        conversions: 0,
        attributedRevenue: 0,
        source: "google-ads-config-missing",
      };
    }

    let accessToken = await this.ensureAccessToken();

    try {
      return await this.queryMetrics(range, accessToken);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (!msg.includes("401")) {
        throw error;
      }

      accessToken = await this.ensureAccessToken();
      return this.queryMetrics(range, accessToken);
    }
  }
}
