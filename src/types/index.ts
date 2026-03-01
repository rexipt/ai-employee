export type SkillId =
  | "dailyBriefing"
  | "anomalyDetection"
  | "customerSegmentation"
  | "competitorIntel"
  | "creativeStrategy"
  | "weeklyPL";

export type Severity = "info" | "warn" | "critical";
export type ActionStatus = "pending" | "approved" | "rejected";

export interface DateRange {
  start: Date;
  end: Date;
}

export interface SkillConfig {
  enabled: boolean;
  schedule: string;
  thresholds?: {
    maxDailySpend?: number;
    minMer?: number;
    minOrdersIfSpendPositive?: number;
    cooldownMinutes?: number;
    criticalSpend?: number;
    criticalMer?: number;
  };
}

export interface AppConfig {
  version: string;
  project: string;
  llm: {
    provider: "openai" | "anthropic";
    model: string;
    apiKey: string;
    baseUrl: string;
    temperature: number;
    maxTokens: number;
  };
  organization: {
    name: string;
    timezone: string;
    currency: string;
  };
  integrations: {
    shopify: {
      enabled: boolean;
      storeUrl: string;
      accessToken: string;
      apiVersion: string;
    };
    googleAds: {
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
    };
    metaAds: {
      enabled: boolean;
      adAccountId: string;
      accessToken: string;
      apiVersion: string;
    };
    klaviyo: {
      enabled: boolean;
      apiKey: string;
      apiRevision: string;
      flowRevenueMetricName: string;
      campaignRevenueMetricName: string;
    };
    tiktokAds: {
      enabled: boolean;
      advertiserId: string;
      accessToken: string;
      apiVersion: string;
    };
    tiktokShop: {
      enabled: boolean;
      appKey: string;
      appSecret: string;
      accessToken: string;
      shopId: string;
      apiVersion: string;
    };
  };
  skills: Record<SkillId, SkillConfig>;
  notifications: {
    slack: {
      enabled: boolean;
      webhookUrl: string;
      channel: string;
      alertsChannel: string;
      segmentationChannel: string;
      competitorChannel: string;
      creativeChannel: string;
      financeChannel: string;
    };
    telegram: {
      enabled: boolean;
      botToken: string;
      chatId: string;
      channel?: string;
      alertsChannel?: string;
      segmentationChannel?: string;
      competitorChannel?: string;
      creativeChannel?: string;
      financeChannel?: string;
    };
  };
  runtime: {
    defaultReportingWindow: "yesterday" | "last24h";
    http: {
      minIntervalMs: number;
      maxRetries: number;
      retryBaseDelayMs: number;
      timeoutMs: number;
      cacheTtlMs?: number;
    };
    finance: {
      defaultCogsRate: number;
    };
  };
  storeProfile?: {
    niche?: string;
    targetMargin?: number;
    constraints?: string[];
  };
}

export interface RuntimeState {
  startedAt: string;
  status: "running" | "ran-once" | "stopped";
  mode: "scheduled" | "once";
  enabledSkills: SkillId[];
}

export interface AnomalyState {
  lastAlertAtByKey: Record<string, string>;
}

export interface ShopifyMetrics {
  revenue: number;
  orders: number;
  avgOrderValue: number;
  source: string;
  currency?: string;
}

export interface AdsMetrics {
  spend: number;
  conversions: number;
  attributedRevenue: number;
  source: string;
}

export interface KlaviyoMetrics {
  campaignRevenue: number;
  flowRevenue: number;
  source: string;
}

export interface SkillResult {
  skillId: SkillId;
  message?: string;
  summary?: string;
  metrics?: Record<string, number>;
  delivery?: {
    delivered: boolean;
    transport: string;
  };
  severity?: Severity;
  anomalyDetected?: boolean;
  alertSuppressed?: boolean;
  anomalies?: string[];
  recommendedActions?: string[];
  segments?: {
    highValue: unknown[];
    atRisk: unknown[];
    churned: unknown[];
  };
}

export interface SkillRunLog {
  id?: number;
  skillId: SkillId;
  status: "success" | "failed";
  startedAt: string;
  completedAt: string;
  durationMs: number;
  message: string;
  metadataJson?: string;
}

export interface BaselineMetric {
  id?: number;
  metricKey: string;
  windowDays: number;
  value: number;
  computedAt: string;
}

export interface ActionItem {
  id?: number;
  createdAt: string;
  sourceSkillId: SkillId;
  title: string;
  details: string;
  severity: Severity;
  status: ActionStatus;
  resolvedAt?: string | null;
  resolutionNote?: string | null;
}
