function parseField(value: string): number | null {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseCron(cronExpr: string): {
  minute: string;
  hour: string;
  dayOfMonth: string;
  month: string;
  dayOfWeek: string;
} | null {
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length !== 5) {
    return null;
  }
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  return { minute, hour, dayOfMonth, month, dayOfWeek };
}

export function describeNextRun(cronExpr: string, now: Date = new Date()): string {
  const parsed = parseCron(cronExpr);
  if (!parsed) {
    return cronExpr;
  }

  // Pattern: m */n * * *
  if (
    parsed.dayOfMonth === "*" &&
    parsed.month === "*" &&
    parsed.dayOfWeek === "*" &&
    parsed.hour.startsWith("*/")
  ) {
    const intervalHours = parseField(parsed.hour.slice(2));
    if (intervalHours && intervalHours > 0) {
      const currentHour = now.getHours();
      const nextHour = Math.floor(currentHour / intervalHours) * intervalHours + intervalHours;
      if (nextHour < 24) {
        return `today ${nextHour.toString().padStart(2, "0")}:${parsed.minute.padStart(2, "0")}`;
      }
      return `tomorrow 00:${parsed.minute.padStart(2, "0")}`;
    }
  }

  // Pattern: m h * * *
  if (parsed.dayOfMonth === "*" && parsed.month === "*" && parsed.dayOfWeek === "*") {
    const minute = parseField(parsed.minute);
    const hour = parseField(parsed.hour);
    if (minute !== null && hour !== null) {
      const next = new Date(now);
      next.setHours(hour, minute, 0, 0);
      const label = next <= now ? "tomorrow" : "today";
      return `${label} ${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
    }
  }

  // Pattern: m h * * d
  if (parsed.dayOfMonth === "*" && parsed.month === "*" && /^[0-6]$/.test(parsed.dayOfWeek)) {
    const minute = parseField(parsed.minute);
    const hour = parseField(parsed.hour);
    const dow = parseField(parsed.dayOfWeek);
    if (minute !== null && hour !== null && dow !== null) {
      const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const currentDow = now.getDay();
      let deltaDays = dow - currentDow;
      if (deltaDays < 0) {
        deltaDays += 7;
      }
      if (deltaDays === 0) {
        const runToday = new Date(now);
        runToday.setHours(hour, minute, 0, 0);
        if (runToday <= now) {
          deltaDays = 7;
        }
      }
      const label = deltaDays === 0 ? "today" : `next ${dayNames[dow]}`;
      return `${label} ${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
    }
  }

  return cronExpr;
}
