import assert from "node:assert/strict";
import test from "node:test";
import { metrics } from "../../src/lib/metrics";

test("metrics records and retrieves metric points", () => {
  metrics.clear();
  
  metrics.recordMetric("test.metric", 42, { tag: "value" });
  metrics.recordMetric("test.metric", 43);
  
  const all = metrics.getMetrics();
  assert.equal(all.length, 2);
  assert.equal(all[0].value, 42);
  assert.equal(all[1].value, 43);
});

test("metrics records skill executions", () => {
  metrics.clear();
  
  metrics.recordSkillExecution({
    skillId: "dailyBriefing",
    executionTimeMs: 1000,
    success: true,
    apiCalls: 5,
    cacheHits: 2,
    cacheMisses: 3,
    errors: 0,
  });
  
  const skillMetrics = metrics.getSkillMetrics("dailyBriefing");
  assert.equal(skillMetrics.length, 1);
  assert.equal(skillMetrics[0].executionTimeMs, 1000);
  assert.equal(skillMetrics[0].success, true);
});

test("metrics provides summary", () => {
  metrics.clear();
  
  metrics.recordMetric("test", 1);
  metrics.recordSkillExecution({
    skillId: "test",
    executionTimeMs: 100,
    success: true,
    apiCalls: 0,
    cacheHits: 0,
    cacheMisses: 0,
    errors: 0,
  });
  
  const summary = metrics.getSummary();
  assert.equal(summary.totalMetrics, 1);
  assert.equal(summary.skillsTracked, 1);
  assert.equal(summary.recentExecutions, 1);
});

test("metrics limits stored metrics", () => {
  metrics.clear();
  
  // Add more than max
  for (let i = 0; i < 1500; i++) {
    metrics.recordMetric("test", i);
  }
  
  const all = metrics.getMetrics();
  assert.ok(all.length <= 1000); // Should be capped
});
