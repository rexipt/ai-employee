import { RunHistoryStore } from "../../storage/run-history";
import { logInfo, logSuccess } from "../../lib/logger";

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export async function runBackfillCommand(options: { days?: string }): Promise<void> {
  const days = options.days ? Number.parseInt(options.days, 10) : 30;
  const store = new RunHistoryStore();
  const rows = store.queryRuns({ status: "success", sinceDays: days, limit: 1000 });

  const buckets: Record<string, number[]> = {
    totalRevenue: [],
    totalSpend: [],
    blendedMer: [],
    orders: [],
  };

  for (const row of rows) {
    try {
      const metadata = JSON.parse(row.metadataJson || "{}");
      const m = metadata.metrics || {};
      for (const key of Object.keys(buckets)) {
        const val = Number(m[key]);
        if (Number.isFinite(val)) buckets[key].push(val);
      }
    } catch {
      // ignore malformed row metadata
    }
  }

  const now = new Date().toISOString();
  for (const key of Object.keys(buckets)) {
    const avg = mean(buckets[key]);
    store.upsertBaseline({
      metricKey: key,
      windowDays: days,
      value: avg,
      computedAt: now,
    });
  }

  const baselines = store.listBaselines();
  logSuccess(`Backfill complete for ${days}-day window.`);
  for (const b of baselines) {
    if (b.windowDays === days) {
      logInfo(`${b.metricKey}: ${b.value.toFixed(4)} (${b.windowDays}d)`);
    }
  }
}
