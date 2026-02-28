import assert from "node:assert/strict";
import test from "node:test";
import { getHttpCache, clearHttpCache } from "../../src/utils/http-cache";

test("http cache stores and retrieves responses", async () => {
  clearHttpCache();
  const cache = getHttpCache(1000); // 1 second TTL
  
  const response = new Response("test body", { status: 200 });
  await cache.set("http://example.com", { method: "GET" }, response);
  
  const cached = await cache.get("http://example.com", { method: "GET" });
  assert.ok(cached !== null);
  assert.equal(cached.status, 200);
  
  const body = await cached.text();
  assert.equal(body, "test body");
});

test("http cache expires entries", async () => {
  clearHttpCache();
  const cache = getHttpCache(100); // 100ms TTL
  
  const response = new Response("test", { status: 200 });
  await cache.set("http://example.com", { method: "GET" }, response);
  
  // Wait for expiration
  await new Promise((resolve) => setTimeout(resolve, 150));
  
  const cached = await cache.get("http://example.com", { method: "GET" });
  assert.equal(cached, null);
});

test("http cache only caches GET requests", async () => {
  clearHttpCache();
  const cache = getHttpCache(1000);
  
  const response = new Response("test", { status: 200 });
  await cache.set("http://example.com", { method: "POST", body: "data" }, response);
  
  const cached = await cache.get("http://example.com", { method: "POST", body: "data" });
  assert.equal(cached, null); // POST should not be cached
});

test("http cache cleanup removes expired entries", async () => {
  clearHttpCache();
  const cache = getHttpCache(50);
  
  const response = new Response("test", { status: 200 });
  await cache.set("http://example.com/1", { method: "GET" }, response);
  await cache.set("http://example.com/2", { method: "GET" }, response);
  
  assert.equal(cache.size(), 2);
  
  // Wait for expiration
  await new Promise((resolve) => setTimeout(resolve, 100));
  
  cache.cleanup();
  assert.equal(cache.size(), 0);
});
