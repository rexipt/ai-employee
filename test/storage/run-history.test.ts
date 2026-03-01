import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { RunHistoryStore } from "../../src/storage/run-history";

function makeTempDbPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rexipt-ai-employee-test-"));
  return path.join(dir, "runtime.db");
}

test("run history supports insert/query filters", () => {
  const store = new RunHistoryStore({ dbPath: makeTempDbPath() });
  const now = new Date().toISOString();

  store.insert({
    skillId: "dailyBriefing",
    status: "success",
    startedAt: now,
    completedAt: now,
    durationMs: 100,
    message: "ok",
    metadataJson: "{\"channel\":\"slack\"}",
  });

  store.insert({
    skillId: "anomalyDetection",
    status: "failed",
    startedAt: now,
    completedAt: now,
    durationMs: 200,
    message: "failed",
    metadataJson: "{}",
  });

  const all = store.queryRuns({ limit: 10 });
  assert.equal(all.length, 2);

  const successOnly = store.queryRuns({ status: "success", limit: 10 });
  assert.equal(successOnly.length, 1);
  assert.equal(successOnly[0].skillId, "dailyBriefing");

  const skillOnly = store.queryRuns({ skillId: "anomalyDetection", limit: 10 });
  assert.equal(skillOnly.length, 1);
  assert.equal(skillOnly[0].status, "failed");
});

test("run history supports baseline upsert and action queue", () => {
  const store = new RunHistoryStore({ dbPath: makeTempDbPath() });

  store.upsertBaseline({
    metricKey: "blendedMer",
    windowDays: 30,
    value: 2.5,
    computedAt: new Date().toISOString(),
  });

  store.upsertBaseline({
    metricKey: "blendedMer",
    windowDays: 30,
    value: 2.7,
    computedAt: new Date().toISOString(),
  });

  const baselines = store.listBaselines();
  assert.equal(baselines.length, 1);
  assert.equal(baselines[0].value, 2.7);

  const id = store.enqueueAction({
    createdAt: new Date().toISOString(),
    sourceSkillId: "anomalyDetection",
    title: "Test action",
    details: "Do something",
    severity: "warn",
    status: "pending",
  });

  assert.ok(id > 0);
  assert.equal(store.updateActionStatus(id, "approved", "verified"), true);
  assert.equal(store.updateActionStatus(999999, "rejected", "missing"), false);
});
