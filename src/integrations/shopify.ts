import { DateRange, ShopifyMetrics } from "../types/index";
import { toDateOnly, toIsoDate } from "../utils/date-range";
import { HttpClientConfig, requestWithPolicy } from "../utils/http-client";

interface ShopifyOrder {
  id: number;
  created_at: string;
  total_price: string;
  financial_status: string;
  currency?: string;
  cancelled_at?: string | null;
  customer?: {
    id?: number;
    email?: string;
    first_name?: string;
    last_name?: string;
  };
  line_items?: ShopifyLineItem[];
}

interface ShopifyLineItem {
  id: number;
  product_id: number;
  title: string;
  quantity: number;
  price: string;
}

export interface TopSellingProduct {
  productId: number;
  title: string;
  totalRevenue: number;
  totalQuantity: number;
  orderCount: number;
}

export interface ShopifyCustomerOrderStat {
  customerId: string;
  email: string;
  firstName: string;
  lastName: string;
  orderCount: number;
  totalSpend: number;
  lastOrderDate: string | null;
}

function parseNumber(value: string | number | undefined | null): number {
  const n = Number.parseFloat(String(value ?? 0));
  return Number.isFinite(n) ? n : 0;
}

export class ShopifyIntegration {
  constructor(
    private readonly config: {
      enabled: boolean;
      storeUrl: string;
      accessToken: string;
      apiVersion: string;
    },
    private readonly httpConfig: HttpClientConfig,
  ) {}

  private getAuthToken(): string {
    return this.config.accessToken || "";
  }

  isReady(): boolean {
    return Boolean(
      this.config?.enabled && this.config?.storeUrl && this.getAuthToken(),
    );
  }

  private getBaseUrl(): string {
    let store = this.config.storeUrl
      .replace(/^https?:\/\//, "")
      .replace(/\/$/, "");
    
    // Ensure .myshopify.com is included if it's missing
    if (!store.includes(".")) {
      store = `${store}.myshopify.com`;
    } else if (!store.endsWith(".myshopify.com")) {
      // If it has a domain but not .myshopify.com, assume it's just the shop name
      const shopName = store.split(".")[0];
      store = `${shopName}.myshopify.com`;
    }
    
    const version = this.config.apiVersion || "2024-01";
    return `https://${store}/admin/api/${version}`;
  }

  private async fetchOrders(params: {
    createdAtMin: string;
    createdAtMax: string;
    limit?: number;
    includeCustomer?: boolean; // Only include customer data if explicitly needed
    includeLineItems?: boolean; // Include line items for product analysis
  }): Promise<ShopifyOrder[]> {
    if (!this.isReady()) {
      return [];
    }

    // Build fields list based on what data is needed
    let fields = "id,created_at,total_price,financial_status,currency,cancelled_at";
    if (params.includeCustomer) {
      fields += ",customer";
    }
    if (params.includeLineItems) {
      fields += ",line_items";
    }

    const qs = new URLSearchParams({
      status: "any",
      limit: String(params.limit ?? 250),
      order: "created_at asc",
      created_at_min: params.createdAtMin,
      created_at_max: params.createdAtMax,
      fields,
    });

    const baseUrl = this.getBaseUrl();
    const url = `${baseUrl}/orders.json?${qs.toString()}`;
    const token = this.getAuthToken();
    
    if (!token) {
      throw new Error(
        "Shopify access token is missing. Set it with `rexipt-ai config set-secret integrations.shopify.accessToken SHOPIFY_ACCESS_TOKEN` and ensure SHOPIFY_ACCESS_TOKEN is exported.",
      );
    }

    // Validate URL format
    if (!baseUrl.includes(".myshopify.com")) {
      throw new Error(
        `Invalid Shopify store URL: ${this.config.storeUrl}. ` +
        `Expected format: 'your-store.myshopify.com' or 'your-store'. ` +
        `Current value: '${this.config.storeUrl}'. ` +
        `Set it with: \`rexipt-ai config set integrations.shopify.storeUrl your-store.myshopify.com\`.`,
      );
    }

    let response: Response;
    try {
      response = await requestWithPolicy(
        url,
        this.httpConfig,
        {
          method: "GET",
          headers: {
            "X-Shopify-Access-Token": token,
            "Content-Type": "application/json",
          },
        },
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      // Provide more context about the error
      throw new Error(
        `Failed to fetch from Shopify API. ` +
        `URL: ${url}, ` +
        `Store URL config: ${this.config.storeUrl}, ` +
        `Error: ${errorMessage}. ` +
        `Check your network connection and verify the store URL is correct.`,
      );
    }

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Shopify API error ${response.status}: ${body}`);
    }

    const data = (await response.json()) as { orders?: ShopifyOrder[] };
    return data.orders ?? [];
  }

  async getMetricsForRange(range: DateRange): Promise<ShopifyMetrics> {
    if (!this.config?.enabled) {
      return {
        revenue: 0,
        orders: 0,
        avgOrderValue: 0,
        source: "shopify-disabled",
      };
    }

    if (!this.isReady()) {
      return {
        revenue: 0,
        orders: 0,
        avgOrderValue: 0,
        source: "shopify-config-missing",
      };
    }

    const orders = await this.fetchOrders({
      createdAtMin: toIsoDate(range.start),
      createdAtMax: toIsoDate(range.end),
    });

    const validOrders = orders.filter(
      (o) => !o.cancelled_at && o.financial_status !== "voided",
    );

    const revenue = validOrders.reduce(
      (sum, order) => sum + parseNumber(order.total_price),
      0,
    );
    const count = validOrders.length;

    return {
      revenue,
      orders: count,
      avgOrderValue: count > 0 ? revenue / count : 0,
      source: "shopify-api",
      currency: validOrders[0]?.currency || "USD",
    };
  }

  async getCustomerOrderStats(params: {
    lookbackDays?: number;
  } = {}): Promise<{ customers: ShopifyCustomerOrderStat[]; source: string }> {
    if (!this.config?.enabled) {
      return {
        customers: [],
        source: "shopify-disabled",
      };
    }

    if (!this.isReady()) {
      return {
        customers: [],
        source: "shopify-config-missing",
      };
    }

    const lookbackDays = params.lookbackDays ?? 180;
    const now = new Date();
    const start = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);

    const orders = await this.fetchOrders({
      createdAtMin: toIsoDate(start),
      createdAtMax: toIsoDate(now),
      includeCustomer: true, // Customer segmentation needs customer data
    });

    const map = new Map<string, ShopifyCustomerOrderStat>();

    for (const order of orders) {
      if (order.cancelled_at || order.financial_status === "voided") {
        continue;
      }
      if (!order.customer?.id) {
        continue;
      }

      const customerKey = String(order.customer.id);
      const existing = map.get(customerKey) ?? {
        customerId: customerKey,
        email: order.customer.email || "",
        firstName: order.customer.first_name || "",
        lastName: order.customer.last_name || "",
        orderCount: 0,
        totalSpend: 0,
        lastOrderDate: null,
      };

      existing.orderCount += 1;
      existing.totalSpend += parseNumber(order.total_price);

      const orderDate = toDateOnly(new Date(order.created_at));
      if (!existing.lastOrderDate || orderDate > existing.lastOrderDate) {
        existing.lastOrderDate = orderDate;
      }

      map.set(customerKey, existing);
    }

    return {
      customers: [...map.values()],
      source: "shopify-api",
    };
  }

  async getTopSellingProducts(options: {
    lookbackDays?: number;
    limit?: number;
  } = {}): Promise<{ products: TopSellingProduct[]; source: string }> {
    const lookbackDays = options.lookbackDays ?? 30;
    const limit = options.limit ?? 10;

    if (!this.isReady()) {
      return { products: [], source: "shopify-not-configured" };
    }

    const now = new Date();
    const pastDate = new Date(now);
    pastDate.setDate(pastDate.getDate() - lookbackDays);

    const orders = await this.fetchOrders({
      createdAtMin: toIsoDate(pastDate),
      createdAtMax: toIsoDate(now),
      limit: 250,
      includeLineItems: true,
    });

    // Aggregate product sales from line items
    const productMap = new Map<number, {
      productId: number;
      title: string;
      totalRevenue: number;
      totalQuantity: number;
      orderIds: Set<number>;
    }>();

    for (const order of orders) {
      // Skip cancelled orders
      if (order.cancelled_at) continue;
      // Skip non-paid orders
      if (!["paid", "partially_paid"].includes(order.financial_status)) continue;

      const lineItems = order.line_items || [];
      for (const item of lineItems) {
        if (!item.product_id) continue;

        const existing = productMap.get(item.product_id);
        const itemRevenue = parseNumber(item.price) * item.quantity;

        if (existing) {
          existing.totalRevenue += itemRevenue;
          existing.totalQuantity += item.quantity;
          existing.orderIds.add(order.id);
        } else {
          productMap.set(item.product_id, {
            productId: item.product_id,
            title: item.title,
            totalRevenue: itemRevenue,
            totalQuantity: item.quantity,
            orderIds: new Set([order.id]),
          });
        }
      }
    }

    // Sort by revenue and limit
    const sortedProducts = [...productMap.values()]
      .map(p => ({
        productId: p.productId,
        title: p.title,
        totalRevenue: p.totalRevenue,
        totalQuantity: p.totalQuantity,
        orderCount: p.orderIds.size,
      }))
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, limit);

    return {
      products: sortedProducts,
      source: "shopify-api",
    };
  }
}
