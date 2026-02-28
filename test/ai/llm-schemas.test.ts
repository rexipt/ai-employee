import assert from "node:assert/strict";
import test from "node:test";
import { RemediationActionsSchema, DailyBriefingInsightsSchema } from "../../src/ai/llm-schemas";

test("RemediationActionsSchema validates correct input", () => {
  const valid = {
    actions: ["Action 1", "Action 2", "Action 3", "Action 4"],
  };
  assert.doesNotThrow(() => RemediationActionsSchema.parse(valid));
});

test("RemediationActionsSchema rejects empty actions list", () => {
  const invalid = {
    actions: [],
  };
  assert.throws(() => RemediationActionsSchema.parse(invalid));
});

test("DailyBriefingInsightsSchema validates correct input", () => {
  const valid = {
    insights: ["Insight 1", "Insight 2", "Insight 3", "Insight 4"],
  };
  assert.doesNotThrow(() => DailyBriefingInsightsSchema.parse(valid));
});

test("DailyBriefingInsightsSchema rejects empty insights list", () => {
  const invalid = {
    insights: [],
  };
  assert.throws(() => DailyBriefingInsightsSchema.parse(invalid));
});
