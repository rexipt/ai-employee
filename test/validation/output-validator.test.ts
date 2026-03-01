import assert from "node:assert/strict";
import test from "node:test";
import { validateDailyBriefingOutput } from "../../src/validation/output-validator";

test("validateDailyBriefingOutput passes for exact computed lines", () => {
  const message = [
    "Daily Briefing",
    "Revenue: $100.00",
    "Spend: $50.00",
    "Blended MER: 2.00x",
    "Orders: 4",
    "AOV: $25.00",
    "Attribution: Google $30.00 | Meta $20.00",
    "Email/SMS Revenue: Campaigns $10.00 | Flows $5.00",
  ].join("\n");

  assert.doesNotThrow(() =>
    validateDailyBriefingOutput(message, {
      totalRevenue: 100,
      totalSpend: 50,
      blendedMer: 2,
      orders: 4,
      avgOrderValue: 25,
      googleAttributedRevenue: 30,
      metaAttributedRevenue: 20,
      campaignRevenue: 10,
      flowRevenue: 5,
    }),
  );
});

test("validateDailyBriefingOutput throws with clear missing-line message", () => {
  const message = [
    "Daily Briefing",
    "Revenue: $999.00",
    "Spend: $50.00",
    "Blended MER: 2.00x",
    "Orders: 4",
    "AOV: $25.00",
    "Attribution: Google $30.00 | Meta $20.00",
    "Email/SMS Revenue: Campaigns $10.00 | Flows $5.00",
  ].join("\n");

  assert.throws(
    () =>
      validateDailyBriefingOutput(message, {
        totalRevenue: 100,
        totalSpend: 50,
        blendedMer: 2,
        orders: 4,
        avgOrderValue: 25,
        googleAttributedRevenue: 30,
        metaAttributedRevenue: 20,
        campaignRevenue: 10,
        flowRevenue: 5,
      }),
    /Missing line: Revenue: \$100\.00/,
  );
});
