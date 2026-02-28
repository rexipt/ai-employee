import { getHttpCache } from "./http-cache";

export interface HttpClientConfig {
  minIntervalMs: number;
  maxRetries: number;
  retryBaseDelayMs: number;
  timeoutMs: number;
  cacheTtlMs?: number; // Optional cache TTL, undefined means no caching
}

export interface HttpRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
}

const hostNextAllowedAt = new Map<string, number>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetry(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status <= 599);
}

function parseRetryAfter(headers: Headers): number | null {
  const raw = headers.get("retry-after");
  if (!raw) {
    return null;
  }
  const asInt = Number.parseInt(raw, 10);
  if (Number.isFinite(asInt)) {
    return Math.max(0, asInt * 1000);
  }
  const dateValue = Date.parse(raw);
  if (Number.isFinite(dateValue)) {
    return Math.max(0, dateValue - Date.now());
  }
  return null;
}

async function applyHostRateLimit(url: URL, cfg: HttpClientConfig): Promise<void> {
  const key = url.host;
  const now = Date.now();
  const nextAllowed = hostNextAllowedAt.get(key) ?? 0;
  if (nextAllowed > now) {
    await sleep(nextAllowed - now);
  }
  hostNextAllowedAt.set(key, Date.now() + cfg.minIntervalMs);
}

export async function requestWithPolicy(
  url: string,
  cfg: HttpClientConfig,
  options: HttpRequestOptions = {},
): Promise<Response> {
  const parsed = new URL(url);
  
  // Check cache first (only for GET requests)
  if (cfg.cacheTtlMs && (options.method || "GET") === "GET") {
    const cache = getHttpCache(cfg.cacheTtlMs);
    const cached = await cache.get(url, options);
    if (cached) {
      return cached;
    }
  }

  let attempt = 0;
  let lastError: unknown = null;

  while (attempt <= cfg.maxRetries) {
    attempt += 1;

    try {
      await applyHostRateLimit(parsed, cfg);

      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        options.timeoutMs ?? cfg.timeoutMs,
      );

      const response = await fetch(url, {
        method: options.method ?? "GET",
        headers: options.headers,
        body: options.body,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!shouldRetry(response.status) || attempt > cfg.maxRetries) {
        // Cache successful GET responses
        if (cfg.cacheTtlMs && (options.method || "GET") === "GET" && response.ok) {
          const cache = getHttpCache(cfg.cacheTtlMs);
          await cache.set(url, options, response, cfg.cacheTtlMs);
        }
        return response;
      }

      const retryAfter = parseRetryAfter(response.headers);
      // Enhanced backoff: respect Retry-After header, use exponential backoff with jitter
      const baseBackoff = retryAfter ?? cfg.retryBaseDelayMs * 2 ** (attempt - 1);
      const jitter = Math.random() * 0.3 * baseBackoff; // Add up to 30% jitter
      await sleep(baseBackoff + jitter);
      continue;
    } catch (error) {
      lastError = error;
      if (attempt > cfg.maxRetries) {
        break;
      }
      const backoff = cfg.retryBaseDelayMs * 2 ** (attempt - 1);
      const jitter = Math.random() * 0.3 * backoff;
      await sleep(backoff + jitter);
    }
  }

  // Provide more detailed error message
  if (lastError instanceof Error) {
    // Check for common fetch errors
    if (lastError.message.includes("fetch failed") || lastError.message.includes("ECONNREFUSED")) {
      const url = new URL(parsed.toString());
      throw new Error(
        `Network error: Unable to connect to ${url.host}. ${lastError.message}. ` +
        `Check your internet connection and verify the URL is correct.`,
      );
    }
    if (lastError.message.includes("ENOTFOUND") || lastError.message.includes("getaddrinfo")) {
      const url = new URL(parsed.toString());
      throw new Error(
        `DNS error: Could not resolve hostname ${url.host}. ${lastError.message}. ` +
        `Check your DNS settings and verify the domain is correct.`,
      );
    }
    if (lastError.message.includes("CERT") || lastError.message.includes("SSL") || lastError.message.includes("TLS")) {
      throw new Error(
        `SSL/TLS error: ${lastError.message}. ` +
        `This may indicate a certificate issue or network security problem.`,
      );
    }
    if (lastError.name === "AbortError" || lastError.message.includes("timeout")) {
      throw new Error(
        `Request timeout: The request to ${parsed.host} exceeded ${options.timeoutMs ?? cfg.timeoutMs}ms. ` +
        `The server may be slow or unreachable.`,
      );
    }
    throw lastError;
  }
  throw new Error(`HTTP request failed: ${String(lastError)}`);
}
