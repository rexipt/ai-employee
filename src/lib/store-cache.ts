import { ShopifyIntegration, ShopifyCustomerOrderStat, TopSellingProduct } from "../integrations/shopify";
import { RunHistoryStore } from "../storage/run-history";
import { AppConfig, ShopifyMetrics } from "../types";
import { getYesterdayRangeUtc, getLast24HoursRangeUtc } from "../utils/date-range";

export interface TopProduct {
  name: string;
  revenue: number;
  orderCount: number;
}

export interface CachedStoreData {
  // Computed metrics
  recentMetrics: ShopifyMetrics;
  calculatedAOV: number;
  topProducts: TopProduct[];
  customerStats: ShopifyCustomerOrderStat[];
  
  // Derived from config
  storeName: string;
  storeUrl: string;
  activePlatforms: string[];
  
  // User-configured (from storeProfile in config)
  niche: string;
  targetMargin: number;
  constraints: string[];
  
  // Cache metadata
  fetchedAt: Date;
  ttlMs: number;
}

export interface StoreProfile {
  niche?: string;
  targetMargin?: number;
  constraints?: string[];
}

const DEFAULT_TTL_MS = 15 * 60 * 1000; // 15 minutes
const CACHE_KEY = "store_data";

// Singleton store instance for SQLite persistence
let storeInstance: RunHistoryStore | null = null;

function getStore(): RunHistoryStore {
  if (!storeInstance) {
    storeInstance = new RunHistoryStore();
  }
  return storeInstance;
}

function getActivePlatforms(config: AppConfig): string[] {
  const platforms: string[] = [];
  
  if (config.integrations.shopify.enabled) platforms.push("Shopify");
  if (config.integrations.googleAds.enabled) platforms.push("Google Ads");
  if (config.integrations.metaAds.enabled) platforms.push("Meta Ads");
  if (config.integrations.tiktokAds.enabled) platforms.push("TikTok Ads");
  if (config.integrations.tiktokShop.enabled) platforms.push("TikTok Shop");
  if (config.integrations.klaviyo.enabled) platforms.push("Klaviyo");
  
  return platforms;
}

function mapToTopProducts(products: TopSellingProduct[]): TopProduct[] {
  return products.map(p => ({
    name: p.title,
    revenue: p.totalRevenue,
    orderCount: p.orderCount,
  }));
}

export async function getStoreData(
  shopify: ShopifyIntegration,
  config: AppConfig,
  options: { force?: boolean; ttlMs?: number } = {},
): Promise<CachedStoreData> {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const store = getStore();
  
  // Check SQLite cache first (unless forced refresh)
  if (!options.force) {
    const cached = store.getCache<CachedStoreData>(CACHE_KEY);
    if (cached) {
      // Restore Date object (JSON serialization converts to string)
      cached.data.fetchedAt = new Date(cached.data.fetchedAt);
      return cached.data;
    }
  }
  
  // Determine reporting range
  const range = config.runtime.defaultReportingWindow === "last24h"
    ? getLast24HoursRangeUtc()
    : getYesterdayRangeUtc();
  
  // Fetch data from Shopify (only if ready)
  let metrics: ShopifyMetrics = {
    revenue: 0,
    orders: 0,
    avgOrderValue: 0,
    source: "shopify-not-configured",
  };
  let customerStats: ShopifyCustomerOrderStat[] = [];
  let topProducts: TopProduct[] = [];
  
  if (shopify.isReady()) {
    const [metricsResult, customerResult, productsResult] = await Promise.all([
      shopify.getMetricsForRange(range),
      shopify.getCustomerOrderStats({ lookbackDays: 30 }),
      shopify.getTopSellingProducts({ lookbackDays: 30, limit: 10 }),
    ]);
    
    metrics = metricsResult;
    customerStats = customerResult.customers;
    topProducts = mapToTopProducts(productsResult.products);
  }
  
  // Get store profile from config (user-configured values)
  const storeProfile = (config as AppConfig & { storeProfile?: StoreProfile }).storeProfile;
  
  // Build cached data
  const storeData: CachedStoreData = {
    recentMetrics: metrics,
    calculatedAOV: metrics.avgOrderValue,
    topProducts,
    customerStats,
    
    storeName: config.organization.name || "Your Store",
    storeUrl: config.integrations.shopify.storeUrl,
    activePlatforms: getActivePlatforms(config),
    
    niche: storeProfile?.niche ?? "ecommerce",
    targetMargin: storeProfile?.targetMargin ?? 0.40,
    constraints: storeProfile?.constraints ?? [],
    
    fetchedAt: new Date(),
    ttlMs,
  };
  
  // Persist to SQLite
  store.setCache(CACHE_KEY, storeData, ttlMs);
  
  return storeData;
}

export function invalidateStoreCache(): void {
  const store = getStore();
  store.invalidateCache(CACHE_KEY);
}

export function getStoreCacheStatus(): { cached: boolean; age: number | null; ttl: number | null } {
  const store = getStore();
  const cached = store.getCache<CachedStoreData>(CACHE_KEY);
  
  if (!cached) {
    return { cached: false, age: null, ttl: null };
  }
  
  const age = Date.now() - cached.fetchedAt.getTime();
  return {
    cached: true,
    age,
    ttl: cached.ttlMs,
  };
}
