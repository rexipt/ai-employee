import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AnomalyState, AppConfig, RuntimeState } from "../types";
import { decryptString, encryptString, isEncryptedValue } from "./secret-manager";
import { validateConfig } from "./config-schema";

const CURRENT_CONFIG_VERSION = "0.1.0";

const configDir = path.join(os.homedir(), ".rexipt", "ai-employee");
const configPath = path.join(configDir, "config.json");
const runtimePath = path.join(configDir, "runtime.json");
const anomalyStatePath = path.join(configDir, "anomaly-state.json");

export const CONFIG_SECRET_PATHS = [
  "llm.apiKey",
  "integrations.shopify.accessToken",
  "integrations.googleAds.customerId",
  "integrations.googleAds.loginCustomerId",
  "integrations.googleAds.developerToken",
  "integrations.googleAds.accessToken",
  "integrations.googleAds.refreshToken",
  "integrations.googleAds.clientId",
  "integrations.googleAds.clientSecret",
  "integrations.metaAds.adAccountId",
  "integrations.metaAds.accessToken",
  "integrations.klaviyo.apiKey",
  "integrations.tiktokAds.advertiserId",
  "integrations.tiktokAds.accessToken",
  "integrations.tiktokShop.appKey",
  "integrations.tiktokShop.appSecret",
  "integrations.tiktokShop.accessToken",
  "integrations.tiktokShop.shopId",
  "notifications.slack.webhookUrl",
  "notifications.telegram.chatId",
  "notifications.telegram.botToken",
] as const;

const REQUIRED_CONFIG_PATHS = [
  "llm",
  "integrations.tiktokAds",
  "integrations.tiktokShop",
  "notifications.telegram",
  "runtime.http.cacheTtlMs",
] as const;

function getAtPath(obj: Record<string, unknown>, pathValue: string): unknown {
  return pathValue.split(".").reduce<unknown>((acc, k) => {
    if (!acc || typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[k];
  }, obj);
}

function setAtPath(obj: Record<string, unknown>, pathValue: string, value: unknown): void {
  const parts = pathValue.split(".");
  let cursor: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const k = parts[i];
    if (!cursor[k] || typeof cursor[k] !== "object") {
      cursor[k] = {};
    }
    cursor = cursor[k] as Record<string, unknown>;
  }
  cursor[parts[parts.length - 1]] = value;
}

function hasAllRequiredPaths(obj: Record<string, unknown>): boolean {
  return REQUIRED_CONFIG_PATHS.every((pathValue) => getAtPath(obj, pathValue) !== undefined);
}

function hasUnencryptedSecrets(obj: Record<string, unknown>): boolean {
  return CONFIG_SECRET_PATHS.some((pathValue) => {
    const value = getAtPath(obj, pathValue);
    return typeof value === "string" && value.length > 0 && !isEncryptedValue(value);
  });
}

async function encryptSecrets(config: AppConfig): Promise<AppConfig> {
  const clone = JSON.parse(JSON.stringify(config)) as Record<string, unknown>;
  for (const secretPath of CONFIG_SECRET_PATHS) {
    const current = getAtPath(clone, secretPath);
    if (typeof current === "string" && current) {
      setAtPath(clone, secretPath, await encryptString(current));
    }
  }
  return clone as unknown as AppConfig;
}

async function decryptSecrets(config: AppConfig): Promise<AppConfig> {
  const clone = JSON.parse(JSON.stringify(config)) as Record<string, unknown>;
  for (const secretPath of CONFIG_SECRET_PATHS) {
    const current = getAtPath(clone, secretPath);
    if (typeof current === "string" && current) {
      try {
        setAtPath(clone, secretPath, await decryptString(current));
      } catch (error) {
        if (isEncryptedValue(current)) {
          throw new Error(
            `Unable to decrypt secret at "${secretPath}". This usually means ${path.join(
              configDir,
              "secrets.key",
            )} was rotated, missing, or copied from another machine. Restore the original key file or replace this secret with a new raw value and run \`rexipt-ai config --validate\` again.`,
          );
        }
        throw error;
      }
    }
  }
  return clone as unknown as AppConfig;
}

export function getConfigPath(): string {
  return configPath;
}

export function getRuntimeStatePath(): string {
  return runtimePath;
}

export function createDefaultConfig(): AppConfig {
  return {
    version: CURRENT_CONFIG_VERSION,
    project: "@rexipt/ai-employee",
    llm: {
      provider: "openai",
      model: "gpt-4o-mini",
      apiKey: "",
      baseUrl: "https://api.openai.com/v1",
      temperature: 0.2,
      maxTokens: 500,
    },
    organization: {
      name: "",
      timezone: "UTC",
      currency: "USD",
    },
    integrations: {
      shopify: {
        enabled: false,
        storeUrl: "",
        accessToken: "",
        apiVersion: "2024-01",
      },
      googleAds: {
        enabled: false,
        customerId: "",
        loginCustomerId: "",
        developerToken: "",
        accessToken: "",
        accessTokenExpiresAt: "",
        refreshToken: "",
        clientId: "",
        clientSecret: "",
        tokenEndpoint: "https://oauth2.googleapis.com/token",
        apiVersion: "v17",
      },
      metaAds: {
        enabled: false,
        adAccountId: "",
        accessToken: "",
        apiVersion: "v20.0",
      },
      klaviyo: {
        enabled: false,
        apiKey: "",
        apiRevision: "2024-07-15",
        flowRevenueMetricName: "Fulfilled Order",
        campaignRevenueMetricName: "Placed Order",
      },
      tiktokAds: {
        enabled: false,
        advertiserId: "",
        accessToken: "",
        apiVersion: "v1.3",
      },
      tiktokShop: {
        enabled: false,
        appKey: "",
        appSecret: "",
        accessToken: "",
        shopId: "",
        apiVersion: "202312",
      },
    },
    storeProfile: {
      niche: "ecommerce",
      targetMargin: 0.40,
      constraints: [],
    },
    skills: {
      dailyBriefing: { enabled: true, schedule: "0 7 * * *" },
      anomalyDetection: {
        enabled: true,
        schedule: "0 */4 * * *",
        thresholds: {
          maxDailySpend: 15000,
          minMer: 1.2,
          minOrdersIfSpendPositive: 1,
          cooldownMinutes: 240,
          criticalSpend: 25000,
          criticalMer: 0.8,
        },
      },
      customerSegmentation: {
        enabled: true,
        schedule: "0 8 * * 1",
      },
      competitorIntel: {
        enabled: false,
        schedule: "0 9 * * 6",
      },
      creativeStrategy: {
        enabled: false,
        schedule: "0 8 * * 3",
      },
      weeklyPL: {
        enabled: false,
        schedule: "0 6 * * 1",
      },
    },
    notifications: {
      slack: {
        enabled: false,
        webhookUrl: "",
        channel: "#rexipt-employee",
        alertsChannel: "#rexipt-employee",
        segmentationChannel: "#rexipt-employee",
        competitorChannel: "#rexipt-employee",
        creativeChannel: "#rexipt-employee",
        financeChannel: "#rexipt-employee",
      },
      telegram: {
        enabled: false,
        botToken: "",
        chatId: "",
        channel: "",
        alertsChannel: "",
        segmentationChannel: "",
        competitorChannel: "",
        creativeChannel: "",
        financeChannel: "",
      },
    },
    runtime: {
      defaultReportingWindow: "yesterday",
      http: {
        minIntervalMs: 150,
        maxRetries: 3,
        retryBaseDelayMs: 500,
        timeoutMs: 15000,
        cacheTtlMs: 5 * 60 * 1000, // 5 minutes default cache
      },
      finance: {
        defaultCogsRate: 0.35,
      },
    },
  };
}

function deepMerge<T extends Record<string, unknown>>(
  base: T,
  incoming: Record<string, unknown>,
): T {
  const output = { ...base } as Record<string, unknown>;

  for (const [key, incomingValue] of Object.entries(incoming || {})) {
    const baseValue = output[key];

    if (
      baseValue &&
      incomingValue &&
      typeof baseValue === "object" &&
      !Array.isArray(baseValue) &&
      typeof incomingValue === "object" &&
      !Array.isArray(incomingValue)
    ) {
      output[key] = deepMerge(
        baseValue as Record<string, unknown>,
        incomingValue as Record<string, unknown>,
      );
      continue;
    }

    output[key] = incomingValue;
  }

  return output as T;
}

function migrateConfig(raw: Record<string, unknown>): AppConfig {
  const merged = deepMerge(createDefaultConfig() as unknown as Record<string, unknown>, raw);
  const config = merged as unknown as AppConfig;
  config.version = CURRENT_CONFIG_VERSION;
  return config;
}

function applyEnvOverrides(config: AppConfig): AppConfig {
  const next = JSON.parse(JSON.stringify(config)) as AppConfig;

  if (process.env.LLM_PROVIDER === "openai" || process.env.LLM_PROVIDER === "anthropic") {
    next.llm.provider = process.env.LLM_PROVIDER;
  }
  if (process.env.LLM_MODEL) next.llm.model = process.env.LLM_MODEL;
  if (process.env.LLM_BASE_URL) next.llm.baseUrl = process.env.LLM_BASE_URL;
  if (process.env.LLM_API_KEY) next.llm.apiKey = process.env.LLM_API_KEY;
  if (process.env.OPENAI_API_KEY && next.llm.provider === "openai") {
    next.llm.apiKey = process.env.OPENAI_API_KEY;
  }
  if (process.env.ANTHROPIC_API_KEY && next.llm.provider === "anthropic") {
    next.llm.apiKey = process.env.ANTHROPIC_API_KEY;
  }

  if (process.env.REXIPT_ORG_NAME) next.organization.name = process.env.REXIPT_ORG_NAME;
  if (process.env.REXIPT_ORG_TIMEZONE) next.organization.timezone = process.env.REXIPT_ORG_TIMEZONE;

  if (process.env.SHOPIFY_STORE_URL) next.integrations.shopify.storeUrl = process.env.SHOPIFY_STORE_URL;
  if (process.env.SHOPIFY_ACCESS_TOKEN) next.integrations.shopify.accessToken = process.env.SHOPIFY_ACCESS_TOKEN;
  if (process.env.SHOPIFY_ENABLED) next.integrations.shopify.enabled = process.env.SHOPIFY_ENABLED === "true";

  if (process.env.GOOGLE_ADS_CUSTOMER_ID) next.integrations.googleAds.customerId = process.env.GOOGLE_ADS_CUSTOMER_ID;
  if (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID) next.integrations.googleAds.loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID;
  if (process.env.GOOGLE_ADS_DEVELOPER_TOKEN) next.integrations.googleAds.developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (process.env.GOOGLE_ADS_ACCESS_TOKEN) next.integrations.googleAds.accessToken = process.env.GOOGLE_ADS_ACCESS_TOKEN;
  if (process.env.GOOGLE_ADS_REFRESH_TOKEN) next.integrations.googleAds.refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
  if (process.env.GOOGLE_ADS_CLIENT_ID) next.integrations.googleAds.clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  if (process.env.GOOGLE_ADS_CLIENT_SECRET) next.integrations.googleAds.clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
  if (process.env.GOOGLE_ADS_ENABLED) next.integrations.googleAds.enabled = process.env.GOOGLE_ADS_ENABLED === "true";

  if (process.env.META_ADS_ACCOUNT_ID) next.integrations.metaAds.adAccountId = process.env.META_ADS_ACCOUNT_ID;
  if (process.env.META_ADS_ACCESS_TOKEN) next.integrations.metaAds.accessToken = process.env.META_ADS_ACCESS_TOKEN;
  if (process.env.META_ADS_ENABLED) next.integrations.metaAds.enabled = process.env.META_ADS_ENABLED === "true";

  if (process.env.KLAVIYO_API_KEY) next.integrations.klaviyo.apiKey = process.env.KLAVIYO_API_KEY;
  if (process.env.KLAVIYO_ENABLED) next.integrations.klaviyo.enabled = process.env.KLAVIYO_ENABLED === "true";

  if (process.env.TIKTOK_ADS_ADVERTISER_ID) next.integrations.tiktokAds.advertiserId = process.env.TIKTOK_ADS_ADVERTISER_ID;
  if (process.env.TIKTOK_ADS_ACCESS_TOKEN) next.integrations.tiktokAds.accessToken = process.env.TIKTOK_ADS_ACCESS_TOKEN;
  if (process.env.TIKTOK_ADS_ENABLED) next.integrations.tiktokAds.enabled = process.env.TIKTOK_ADS_ENABLED === "true";

  if (process.env.TIKTOK_SHOP_APP_KEY) next.integrations.tiktokShop.appKey = process.env.TIKTOK_SHOP_APP_KEY;
  if (process.env.TIKTOK_SHOP_APP_SECRET) next.integrations.tiktokShop.appSecret = process.env.TIKTOK_SHOP_APP_SECRET;
  if (process.env.TIKTOK_SHOP_ACCESS_TOKEN) next.integrations.tiktokShop.accessToken = process.env.TIKTOK_SHOP_ACCESS_TOKEN;
  if (process.env.TIKTOK_SHOP_SHOP_ID) next.integrations.tiktokShop.shopId = process.env.TIKTOK_SHOP_SHOP_ID;
  if (process.env.TIKTOK_SHOP_ENABLED) next.integrations.tiktokShop.enabled = process.env.TIKTOK_SHOP_ENABLED === "true";

  if (process.env.SLACK_WEBHOOK_URL) next.notifications.slack.webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (process.env.SLACK_CHANNEL) next.notifications.slack.channel = process.env.SLACK_CHANNEL;
  if (process.env.SLACK_ALERTS_CHANNEL) next.notifications.slack.alertsChannel = process.env.SLACK_ALERTS_CHANNEL;
  if (process.env.SLACK_ENABLED) next.notifications.slack.enabled = process.env.SLACK_ENABLED === "true";

  if (process.env.TELEGRAM_BOT_TOKEN) next.notifications.telegram.botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (process.env.TELEGRAM_CHAT_ID) next.notifications.telegram.chatId = process.env.TELEGRAM_CHAT_ID;
  if (process.env.TELEGRAM_CHANNEL) next.notifications.telegram.channel = process.env.TELEGRAM_CHANNEL;
  if (process.env.TELEGRAM_ALERTS_CHANNEL) next.notifications.telegram.alertsChannel = process.env.TELEGRAM_ALERTS_CHANNEL;
  if (process.env.TELEGRAM_ENABLED) next.notifications.telegram.enabled = process.env.TELEGRAM_ENABLED === "true";

  return next;
}

async function ensureDir(): Promise<void> {
  await fs.mkdir(configDir, { recursive: true });
}

export async function saveConfig(config: AppConfig): Promise<string> {
  // Validate before saving
  validateConfig(config);
  await ensureDir();
  const encrypted = await encryptSecrets(config);
  await fs.writeFile(configPath, `${JSON.stringify(encrypted, null, 2)}\n`, "utf8");
  return configPath;
}

export async function loadConfig(): Promise<AppConfig | null> {
  try {
    const raw = await fs.readFile(configPath, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const needsVersionMigration = (parsed.version as string | undefined) !== CURRENT_CONFIG_VERSION;
    const needsStructureMigration = !hasAllRequiredPaths(parsed);
    const needsSecretReseal = hasUnencryptedSecrets(parsed);

    const migrated = migrateConfig(parsed);
    const decrypted = await decryptSecrets(migrated);
    const validatedForDisk = validateConfig(decrypted);

    if (needsVersionMigration || needsStructureMigration || needsSecretReseal) {
      await saveConfig(validatedForDisk);
    }

    const runtimeConfig = validateConfig(applyEnvOverrides(validatedForDisk));
    return runtimeConfig;
  } catch (error) {
    const ioError = error as NodeJS.ErrnoException;
    if (ioError?.code === "ENOENT") {
      return null;
    }
    if (error instanceof SyntaxError) {
      throw new Error(`Configuration file is not valid JSON at ${configPath}.`);
    }
    if (error instanceof Error && error.message.includes("Configuration validation failed")) {
      throw error;
    }
    if (error instanceof Error && error.message.includes('Unable to decrypt secret at "')) {
      throw error;
    }
    throw new Error(
      `Failed to load configuration at ${configPath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

export async function updateGoogleAdsAccessToken(token: {
  accessToken: string;
  accessTokenExpiresAt: string;
}): Promise<void> {
  const cfg = await loadConfig();
  if (!cfg) {
    return;
  }
  cfg.integrations.googleAds.accessToken = token.accessToken;
  cfg.integrations.googleAds.accessTokenExpiresAt = token.accessTokenExpiresAt;
  await saveConfig(cfg);
}

export async function resetConfigSecrets(secretPaths: string[]): Promise<{
  reset: string[];
  invalid: string[];
}> {
  await ensureDir();
  const raw = await fs.readFile(configPath, "utf8");
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const allowed = new Set<string>(CONFIG_SECRET_PATHS);
  const reset: string[] = [];
  const invalid: string[] = [];

  for (const secretPath of secretPaths) {
    if (!allowed.has(secretPath)) {
      invalid.push(secretPath);
      continue;
    }
    setAtPath(parsed, secretPath, "");
    reset.push(secretPath);
  }

  await fs.writeFile(configPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  return { reset, invalid };
}

export async function setConfigSecrets(
  entries: Array<{ path: string; value: string }>,
): Promise<{ set: string[]; invalid: string[] }> {
  await ensureDir();
  const raw = await fs.readFile(configPath, "utf8");
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const allowed = new Set<string>(CONFIG_SECRET_PATHS);
  const set: string[] = [];
  const invalid: string[] = [];

  for (const entry of entries) {
    if (!allowed.has(entry.path)) {
      invalid.push(entry.path);
      continue;
    }
    // Encrypt the value before storing
    const encryptedValue = await encryptString(entry.value);
    setAtPath(parsed, entry.path, encryptedValue);
    set.push(entry.path);
  }

  await fs.writeFile(configPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  return { set, invalid };
}

export function isConfigSecretPath(pathValue: string): boolean {
  return CONFIG_SECRET_PATHS.includes(pathValue as (typeof CONFIG_SECRET_PATHS)[number]);
}

export async function setConfigValue(pathValue: string, value: unknown): Promise<void> {
  await ensureDir();
  const raw = await fs.readFile(configPath, "utf8");
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  setAtPath(parsed, pathValue, value);
  await fs.writeFile(configPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
}

export function listConfigLeafPaths(config: Record<string, unknown>): string[] {
  const result: string[] = [];

  function walk(node: unknown, prefix: string): void {
    if (Array.isArray(node)) {
      result.push(prefix);
      return;
    }
    if (node && typeof node === "object") {
      const entries = Object.entries(node as Record<string, unknown>);
      if (entries.length === 0) {
        result.push(prefix);
        return;
      }
      for (const [key, value] of entries) {
        const next = prefix ? `${prefix}.${key}` : key;
        walk(value, next);
      }
      return;
    }
    if (prefix) {
      result.push(prefix);
    }
  }

  walk(config, "");
  return result.sort((a, b) => a.localeCompare(b));
}

export async function saveRuntimeState(state: RuntimeState): Promise<string> {
  await ensureDir();
  await fs.writeFile(runtimePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  return runtimePath;
}

export async function loadRuntimeState(): Promise<RuntimeState | null> {
  try {
    const raw = await fs.readFile(runtimePath, "utf8");
    return JSON.parse(raw) as RuntimeState;
  } catch {
    return null;
  }
}

export async function loadAnomalyState(): Promise<AnomalyState> {
  try {
    const raw = await fs.readFile(anomalyStatePath, "utf8");
    const parsed = JSON.parse(raw) as AnomalyState;
    return parsed?.lastAlertAtByKey ? parsed : { lastAlertAtByKey: {} };
  } catch {
    return { lastAlertAtByKey: {} };
  }
}

export async function saveAnomalyState(state: AnomalyState): Promise<void> {
  await ensureDir();
  await fs.writeFile(anomalyStatePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}
