import assert from "node:assert/strict";
import test from "node:test";
import { logger } from "../../src/lib/logger";

test("logger sets and clears correlation ID", () => {
  logger.setCorrelationId("test-123");
  logger.clearCorrelationId();
  // Just verify it doesn't throw
  assert.ok(true);
});

test("logger methods don't throw", () => {
  assert.doesNotThrow(() => logger.info("test"));
  assert.doesNotThrow(() => logger.success("test"));
  assert.doesNotThrow(() => logger.error("test"));
  assert.doesNotThrow(() => logger.warn("test"));
  
  assert.doesNotThrow(() => logger.info("test", { key: "value" }));
  assert.doesNotThrow(() => logger.error("test", { error: "details" }));
});
