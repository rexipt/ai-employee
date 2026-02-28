import assert from "node:assert/strict";
import test from "node:test";
import {
  daysSince,
  getLast24HoursRangeUtc,
  getYesterdayRangeUtc,
  toDateOnly,
  toIsoDate,
} from "../../src/utils/date-range";

test("toIsoDate and toDateOnly return stable UTC values", () => {
  const input = new Date("2026-02-28T12:34:56.789Z");
  assert.equal(toIsoDate(input), "2026-02-28T12:34:56.789Z");
  assert.equal(toDateOnly(input), "2026-02-28");
});

test("getYesterdayRangeUtc returns a full UTC day", () => {
  const { start, end } = getYesterdayRangeUtc();
  assert.equal(start.getUTCHours(), 0);
  assert.equal(start.getUTCMinutes(), 0);
  assert.equal(start.getUTCSeconds(), 0);
  assert.equal(end.getUTCHours(), 23);
  assert.equal(end.getUTCMinutes(), 59);
  assert.equal(end.getUTCSeconds(), 59);
  assert.equal(toDateOnly(start), toDateOnly(end));
});

test("getLast24HoursRangeUtc returns roughly a 24h window", () => {
  const { start, end } = getLast24HoursRangeUtc();
  const delta = end.getTime() - start.getTime();
  assert.ok(delta >= 24 * 60 * 60 * 1000 - 2000);
  assert.ok(delta <= 24 * 60 * 60 * 1000 + 2000);
});

test("daysSince handles null and valid dates", () => {
  assert.equal(daysSince(null), Number.POSITIVE_INFINITY);
  assert.equal(daysSince("2030-01-01"), Math.floor((Date.now() - new Date("2030-01-01").getTime()) / 86400000));
});
