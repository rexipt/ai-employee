import assert from "node:assert/strict";
import test from "node:test";
import { validateConfig, AppConfigSchema } from "../../src/lib/config-schema";
import { createDefaultConfig } from "../../src/lib/config-manager";

test("validateConfig accepts valid config", () => {
  const config = createDefaultConfig();
  assert.doesNotThrow(() => validateConfig(config));
});

test("validateConfig rejects invalid LLM provider", () => {
  const config = createDefaultConfig();
  (config.llm as any).provider = "invalid";
  assert.throws(() => validateConfig(config), /provider/);
});

test("validateConfig rejects invalid URL", () => {
  const config = createDefaultConfig();
  config.llm.baseUrl = "not-a-url";
  assert.throws(() => validateConfig(config), /url/);
});

test("validateConfig rejects invalid temperature", () => {
  const config = createDefaultConfig();
  config.llm.temperature = 3; // > 2
  assert.throws(() => validateConfig(config), /temperature/);
});

test("validateConfig rejects invalid currency length", () => {
  const config = createDefaultConfig();
  config.organization.currency = "US"; // Should be 3 chars
  assert.throws(() => validateConfig(config), /currency/);
});
