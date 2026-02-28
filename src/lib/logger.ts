interface LogEntry {
  level: "info" | "success" | "error" | "warn";
  message: string;
  timestamp: string;
  correlationId?: string;
  metadata?: Record<string, unknown>;
}

class StructuredLogger {
  private correlationId: string | null = null;

  setCorrelationId(id: string): void {
    this.correlationId = id;
  }

  clearCorrelationId(): void {
    this.correlationId = null;
  }

  private log(level: LogEntry["level"], message: string, metadata?: Record<string, unknown>): void {
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      ...(this.correlationId && { correlationId: this.correlationId }),
      ...(metadata && { metadata }),
    };

    // Output as JSON for structured logging, but also maintain human-readable format
    const jsonOutput = JSON.stringify(entry);
    const humanReadable = `[${entry.level.toUpperCase()}] ${entry.message}${metadata ? ` ${JSON.stringify(metadata)}` : ""}`;

    // Use stderr for errors, stdout for others
    const stream = level === "error" ? process.stderr : process.stdout;
    stream.write(`${humanReadable}\n`);

    // Also write JSON to a log file if needed (optional)
    // For now, we'll just use stdout/stderr
  }

  info(message: string, metadata?: Record<string, unknown>): void {
    this.log("info", message, metadata);
  }

  success(message: string, metadata?: Record<string, unknown>): void {
    this.log("success", message, metadata);
  }

  error(message: string, metadata?: Record<string, unknown>): void {
    this.log("error", message, metadata);
  }

  warn(message: string, metadata?: Record<string, unknown>): void {
    this.log("warn", message, metadata);
  }
}

// Global logger instance
const logger = new StructuredLogger();

// Legacy functions for backward compatibility
export function logInfo(message: string): void {
  logger.info(message);
}

export function logSuccess(message: string): void {
  logger.success(message);
}

export function logError(message: string): void {
  logger.error(message);
}

// Export structured logger
export { logger };
export type { LogEntry };
