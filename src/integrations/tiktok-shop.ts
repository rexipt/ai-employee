import { DateRange, ShopifyMetrics } from "../types/index";
import { HttpClientConfig, requestWithPolicy } from "../utils/http-client";

interface TikTokShopOrder {
  order_id?: string;
  create_time?: number;
  order_status?: number;
  payment_info?: {
    total_amount?: {
      amount?: string;
      currency?: string;
    };
  };
  item_list?: Array<{
    item_id?: string;
    item_name?: string;
    quantity?: number;
    item_price?: {
      amount?: string;
      currency?: string;
    };
  }>;
}

interface TikTokShopResponse {
  code?: number;
  message?: string;
  data?: {
    order_list?: TikTokShopOrder[];
    total?: number;
    page_size?: number;
    page?: number;
  };
}

function parseNumber(value: string | number | undefined | null): number {
  const n = Number.parseFloat(String(value ?? 0));
  return Number.isFinite(n) ? n : 0;
}

export class TikTokShopIntegration {
  constructor(
    private readonly config: {
      enabled: boolean;
      appKey: string;
      appSecret: string;
      accessToken: string;
      shopId: string;
      apiVersion: string;
    },
    private readonly httpConfig: HttpClientConfig,
  ) {}

  isReady(): boolean {
    return Boolean(
      this.config?.enabled &&
        this.config?.appKey &&
        this.config?.appSecret &&
        this.config?.accessToken &&
        this.config?.shopId,
    );
  }

  private getBaseUrl(): string {
    const version = this.config.apiVersion || "202312";
    return `https://open-api.tiktokglobalshop.com/order/${version}`;
  }

  private async fetchOrders(params: {
    createTimeFrom: number;
    createTimeTo: number;
    pageSize?: number;
    page?: number;
  }): Promise<TikTokShopOrder[]> {
    if (!this.isReady()) {
      return [];
    }

    const url = `${this.getBaseUrl()}/orders/search`;
    const payload = {
      shop_id: this.config.shopId,
      create_time_from: params.createTimeFrom,
      create_time_to: params.createTimeTo,
      page_size: params.pageSize ?? 20,
      page: params.page ?? 1,
    };

    const response = await requestWithPolicy(url, this.httpConfig, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Access-Token": this.config.accessToken,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`TikTok Shop API error ${response.status}: ${body}`);
    }

    const data = (await response.json()) as TikTokShopResponse;

    if (data.code !== 0 || !data.data?.order_list) {
      return [];
    }

    return data.data.order_list;
  }

  async getMetricsForRange(range: DateRange): Promise<ShopifyMetrics> {
    if (!this.config?.enabled) {
      return {
        revenue: 0,
        orders: 0,
        avgOrderValue: 0,
        source: "tiktok-shop-disabled",
      };
    }

    if (!this.isReady()) {
      return {
        revenue: 0,
        orders: 0,
        avgOrderValue: 0,
        source: "tiktok-shop-config-missing",
      };
    }

    // Convert dates to Unix timestamps (seconds)
    const createTimeFrom = Math.floor(range.start.getTime() / 1000);
    const createTimeTo = Math.floor(range.end.getTime() / 1000);

    let allOrders: TikTokShopOrder[] = [];
    let page = 1;
    const pageSize = 20;

    // Paginate through all orders
    while (true) {
      const orders = await this.fetchOrders({
        createTimeFrom,
        createTimeTo,
        pageSize,
        page,
      });

      if (orders.length === 0) {
        break;
      }

      allOrders = allOrders.concat(orders);

      // If we got fewer than pageSize, we're done
      if (orders.length < pageSize) {
        break;
      }

      page += 1;
    }

    // Filter to only paid/fulfilled orders (status 100 = paid, 105 = shipped, 111 = delivered)
    const validOrders = allOrders.filter(
      (order) => order.order_status && [100, 105, 111].includes(order.order_status),
    );

    const revenue = validOrders.reduce((sum, order) => {
      const amount = order.payment_info?.total_amount?.amount;
      return sum + parseNumber(amount);
    }, 0);

    const orders = validOrders.length;
    const avgOrderValue = orders > 0 ? revenue / orders : 0;

    return {
      revenue,
      orders,
      avgOrderValue,
      source: "tiktok-shop-api",
      currency: validOrders[0]?.payment_info?.total_amount?.currency || "USD",
    };
  }
}
