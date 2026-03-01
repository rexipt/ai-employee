import { DateRange } from "../types/index";

export function toIsoDate(date: Date): string {
  return date.toISOString();
}

export function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function getYesterdayRangeUtc(): DateRange {
  const now = new Date();
  const start = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - 1,
      0,
      0,
      0,
    ),
  );
  const end = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - 1,
      23,
      59,
      59,
    ),
  );
  return { start, end };
}

export function getLast24HoursRangeUtc(): DateRange {
  const end = new Date();
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  return { start, end };
}

export function daysSince(yyyyMmDd: string | null): number {
  if (!yyyyMmDd) {
    return Number.POSITIVE_INFINITY;
  }
  const d = new Date(yyyyMmDd);
  const now = new Date();
  const ms = now.getTime() - d.getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}
