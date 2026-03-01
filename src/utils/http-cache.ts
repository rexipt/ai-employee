interface CacheEntry {
  body: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  cachedAt: number;
  expiresAt: number;
}

class HttpCache {
  private cache = new Map<string, CacheEntry>();
  private readonly defaultTtlMs: number;

  constructor(defaultTtlMs: number = 5 * 60 * 1000) {
    // Default 5 minutes
    this.defaultTtlMs = defaultTtlMs;
  }

  private getCacheKey(url: string, options: { method?: string; body?: string }): string {
    return `${options.method || "GET"}:${url}:${options.body || ""}`;
  }

  async get(url: string, options: { method?: string; body?: string }): Promise<Response | null> {
    const key = this.getCacheKey(url, options);
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    const now = Date.now();
    if (now >= entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    // Reconstruct response from cache
    const headers = new Headers();
    for (const [k, v] of Object.entries(entry.headers)) {
      headers.set(k, v);
    }
    
    return new Response(entry.body, {
      status: entry.status,
      statusText: entry.statusText,
      headers,
    });
  }

  async set(
    url: string,
    options: { method?: string; body?: string },
    response: Response,
    ttlMs?: number,
  ): Promise<void> {
    const key = this.getCacheKey(url, options);
    const now = Date.now();
    const ttl = ttlMs ?? this.defaultTtlMs;

    // Only cache GET requests and successful responses
    if ((options.method || "GET") === "GET" && response.ok && response.status === 200) {
      const body = await response.clone().text();
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });

      this.cache.set(key, {
        body,
        status: response.status,
        statusText: response.statusText,
        headers,
        cachedAt: now,
        expiresAt: now + ttl,
      });
    }
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }

  // Clean up expired entries
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now >= entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }
}

// Global cache instance
let globalCache: HttpCache | null = null;
let globalTtl: number | undefined = undefined;

export function getHttpCache(defaultTtlMs?: number): HttpCache {
  // If TTL changed or cache doesn't exist, create new instance
  if (!globalCache || (defaultTtlMs !== undefined && globalTtl !== defaultTtlMs)) {
    globalCache = new HttpCache(defaultTtlMs);
    globalTtl = defaultTtlMs;
  }
  return globalCache;
}

export function clearHttpCache(): void {
  if (globalCache) {
    globalCache.clear();
    globalCache = null;
    globalTtl = undefined;
  }
}
