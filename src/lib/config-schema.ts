import { z, type ZodIssue } from "zod";

export const SkillConfigSchema = z.object({
  enabled: z.boolean(),
  schedule: z.string(),
  thresholds: z
    .object({
      maxDailySpend: z.number().optional(),
      minMer: z.number().optional(),
      minOrdersIfSpendPositive: z.number().optional(),
      cooldownMinutes: z.number().optional(),
      criticalSpend: z.number().optional(),
      criticalMer: z.number().optional(),
    })
    .optional(),
});

export const AppConfigSchema = z.object({
  version: z.string(),
  project: z.string(),
  llm: z.object({
    provider: z.enum(["openai", "anthropic"]),
    model: z.string().min(1),
    apiKey: z.string(),
    baseUrl: z.string().url(),
    temperature: z.number().min(0).max(2),
    maxTokens: z.number().int().positive(),
  }),
  organization: z.object({
    name: z.string(),
    timezone: z.string(),
    currency: z.string().length(3),
  }),
  integrations: z.object({
    shopify: z.object({
      enabled: z.boolean(),
      storeUrl: z.string(),
      accessToken: z.string().default(""),
      apiVersion: z.string(),
    }),
    googleAds: z.object({
      enabled: z.boolean(),
      customerId: z.string(),
      loginCustomerId: z.string(),
      developerToken: z.string(),
      accessToken: z.string(),
      accessTokenExpiresAt: z.string(),
      refreshToken: z.string(),
      clientId: z.string(),
      clientSecret: z.string(),
      tokenEndpoint: z.string().url(),
      apiVersion: z.string(),
    }),
    metaAds: z.object({
      enabled: z.boolean(),
      adAccountId: z.string(),
      accessToken: z.string(),
      apiVersion: z.string(),
    }),
    klaviyo: z.object({
      enabled: z.boolean(),
      apiKey: z.string(),
      apiRevision: z.string(),
      flowRevenueMetricName: z.string(),
      campaignRevenueMetricName: z.string(),
    }),
    tiktokAds: z.object({
      enabled: z.boolean(),
      advertiserId: z.string(),
      accessToken: z.string(),
      apiVersion: z.string(),
    }),
    tiktokShop: z.object({
      enabled: z.boolean(),
      appKey: z.string(),
      appSecret: z.string(),
      accessToken: z.string(),
      shopId: z.string(),
      apiVersion: z.string(),
    }),
  }),
  skills: z.record(z.string(), SkillConfigSchema),
  notifications: z.object({
    slack: z.object({
      enabled: z.boolean(),
      webhookUrl: z.string(),
      channel: z.string(),
      alertsChannel: z.string(),
      segmentationChannel: z.string(),
      competitorChannel: z.string(),
      creativeChannel: z.string(),
      financeChannel: z.string(),
    }),
    telegram: z.object({
      enabled: z.boolean(),
      botToken: z.string(),
      chatId: z.string(),
      channel: z.string().optional(),
      alertsChannel: z.string().optional(),
      segmentationChannel: z.string().optional(),
      competitorChannel: z.string().optional(),
      creativeChannel: z.string().optional(),
      financeChannel: z.string().optional(),
    }),
  }),
  runtime: z.object({
    defaultReportingWindow: z.enum(["yesterday", "last24h"]),
    http: z.object({
      minIntervalMs: z.number().int().nonnegative(),
      maxRetries: z.number().int().nonnegative(),
      retryBaseDelayMs: z.number().int().nonnegative(),
      timeoutMs: z.number().int().positive(),
      cacheTtlMs: z.number().int().nonnegative().optional(),
    }),
    finance: z.object({
      defaultCogsRate: z.number().min(0).max(1),
    }),
  }),
});

export type ValidatedAppConfig = z.infer<typeof AppConfigSchema>;

export function validateConfig(config: unknown): ValidatedAppConfig {
  try {
    return AppConfigSchema.parse(config);
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      const errors = err.errors.map((e: ZodIssue) => {
        const path = e.path.join(".");
        return path ? `${path}: ${e.message}` : e.message;
      });
      throw new Error(`Configuration validation failed:\n${errors.join("\n")}`);
    }
    throw err;
  }
}
