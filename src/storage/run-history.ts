import Database from "better-sqlite3";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { ActionItem, ActionStatus, BaselineMetric, SkillId, SkillRunLog } from "../types";

const defaultDataDir = path.join(os.homedir(), ".rexipt", "ai-employee");
const defaultDbPath = path.join(defaultDataDir, "runtime.db");
const DB_SCHEMA_VERSION = 5;

function ensureDataDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export interface RunHistoryStoreOptions {
  dbPath?: string;
}

export class RunHistoryStore {
  private db: Database.Database;

  constructor(options: RunHistoryStoreOptions = {}) {
    const resolvedDbPath = options.dbPath || defaultDbPath;
    ensureDataDir(path.dirname(resolvedDbPath));
    this.db = new Database(resolvedDbPath);
    this.db.pragma("journal_mode = WAL");
    this.migrate();
  }

  private migrate(): void {
    const currentVersion = Number(this.db.pragma("user_version", { simple: true }) || 0);

    if (currentVersion < 1) {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS skill_runs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          skill_id TEXT NOT NULL,
          status TEXT NOT NULL,
          started_at TEXT NOT NULL,
          completed_at TEXT NOT NULL,
          duration_ms INTEGER NOT NULL,
          message TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_skill_runs_completed_at
        ON skill_runs(completed_at DESC);
        CREATE INDEX IF NOT EXISTS idx_skill_runs_skill_id
        ON skill_runs(skill_id);
      `);
      this.db.pragma("user_version = 1");
    }

    if (currentVersion < 2) {
      this.db.exec(`
        ALTER TABLE skill_runs ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}';
      `);
      this.db.pragma("user_version = 2");
    }

    if (currentVersion < 3) {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS baseline_metrics (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          metric_key TEXT NOT NULL,
          window_days INTEGER NOT NULL,
          value REAL NOT NULL,
          computed_at TEXT NOT NULL,
          UNIQUE(metric_key, window_days)
        );
      `);
      this.db.pragma("user_version = 3");
    }

    if (currentVersion < 4) {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS action_queue (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          created_at TEXT NOT NULL,
          source_skill_id TEXT NOT NULL,
          title TEXT NOT NULL,
          details TEXT NOT NULL,
          severity TEXT NOT NULL,
          status TEXT NOT NULL,
          resolved_at TEXT,
          resolution_note TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_action_queue_status ON action_queue(status);
        CREATE INDEX IF NOT EXISTS idx_action_queue_created_at ON action_queue(created_at DESC);
      `);
      this.db.pragma("user_version = 4");
    }

    if (currentVersion < 5) {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS store_cache (
          cache_key TEXT PRIMARY KEY,
          data_json TEXT NOT NULL,
          fetched_at TEXT NOT NULL,
          ttl_ms INTEGER NOT NULL
        );
      `);
      this.db.pragma("user_version = 5");
    }

    const finalVersion = Number(this.db.pragma("user_version", { simple: true }) || 0);
    if (finalVersion !== DB_SCHEMA_VERSION) {
      this.db.pragma(`user_version = ${DB_SCHEMA_VERSION}`);
    }
  }

  insert(run: SkillRunLog): void {
    const stmt = this.db.prepare(`
      INSERT INTO skill_runs (skill_id, status, started_at, completed_at, duration_ms, message, metadata_json)
      VALUES (@skillId, @status, @startedAt, @completedAt, @durationMs, @message, @metadataJson)
    `);
    stmt.run({ ...run, metadataJson: run.metadataJson || "{}" });
  }

  listRecent(limit = 10): SkillRunLog[] {
    const stmt = this.db.prepare(`
      SELECT id, skill_id as skillId, status, started_at as startedAt,
             completed_at as completedAt, duration_ms as durationMs, message,
             metadata_json as metadataJson
      FROM skill_runs
      ORDER BY completed_at DESC
      LIMIT ?
    `);
    return stmt.all(limit) as SkillRunLog[];
  }

  queryRuns(filters: {
    skillId?: SkillId;
    status?: "success" | "failed";
    sinceDays?: number;
    limit?: number;
  }): SkillRunLog[] {
    const clauses: string[] = [];
    const values: unknown[] = [];

    if (filters.skillId) {
      clauses.push("skill_id = ?");
      values.push(filters.skillId);
    }

    if (filters.status) {
      clauses.push("status = ?");
      values.push(filters.status);
    }

    if (filters.sinceDays && filters.sinceDays > 0) {
      clauses.push("completed_at >= datetime('now', ?)");
      values.push(`-${filters.sinceDays} days`);
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const limit = filters.limit ?? 50;

    const stmt = this.db.prepare(`
      SELECT id, skill_id as skillId, status, started_at as startedAt,
             completed_at as completedAt, duration_ms as durationMs, message,
             metadata_json as metadataJson
      FROM skill_runs
      ${where}
      ORDER BY completed_at DESC
      LIMIT ?
    `);

    return stmt.all(...values, limit) as SkillRunLog[];
  }

  upsertBaseline(metric: BaselineMetric): void {
    const stmt = this.db.prepare(`
      INSERT INTO baseline_metrics (metric_key, window_days, value, computed_at)
      VALUES (@metricKey, @windowDays, @value, @computedAt)
      ON CONFLICT(metric_key, window_days)
      DO UPDATE SET value=excluded.value, computed_at=excluded.computed_at
    `);
    stmt.run(metric);
  }

  listBaselines(): BaselineMetric[] {
    const stmt = this.db.prepare(`
      SELECT id, metric_key as metricKey, window_days as windowDays,
             value, computed_at as computedAt
      FROM baseline_metrics
      ORDER BY metric_key ASC, window_days ASC
    `);
    return stmt.all() as BaselineMetric[];
  }

  enqueueAction(action: ActionItem): number {
    const stmt = this.db.prepare(`
      INSERT INTO action_queue (created_at, source_skill_id, title, details, severity, status, resolved_at, resolution_note)
      VALUES (@createdAt, @sourceSkillId, @title, @details, @severity, @status, @resolvedAt, @resolutionNote)
    `);
    const result = stmt.run({
      ...action,
      resolvedAt: action.resolvedAt || null,
      resolutionNote: action.resolutionNote || null,
    });
    return Number(result.lastInsertRowid);
  }

  listActions(status?: ActionStatus, limit = 50): ActionItem[] {
    const stmt = status
      ? this.db.prepare(`
          SELECT id, created_at as createdAt, source_skill_id as sourceSkillId,
                 title, details, severity, status, resolved_at as resolvedAt,
                 resolution_note as resolutionNote
          FROM action_queue
          WHERE status = ?
          ORDER BY created_at DESC
          LIMIT ?
        `)
      : this.db.prepare(`
          SELECT id, created_at as createdAt, source_skill_id as sourceSkillId,
                 title, details, severity, status, resolved_at as resolvedAt,
                 resolution_note as resolutionNote
          FROM action_queue
          ORDER BY created_at DESC
          LIMIT ?
        `);

    return (status ? stmt.all(status, limit) : stmt.all(limit)) as ActionItem[];
  }

  updateActionStatus(id: number, status: ActionStatus, note?: string): boolean {
    const stmt = this.db.prepare(`
      UPDATE action_queue
      SET status = ?, resolved_at = ?, resolution_note = ?
      WHERE id = ?
    `);

    const result = stmt.run(
      status,
      status === "pending" ? null : new Date().toISOString(),
      note || null,
      id,
    );

    return result.changes > 0;
  }

  // Store cache methods
  setCache<T>(key: string, data: T, ttlMs: number): void {
    const stmt = this.db.prepare(`
      INSERT INTO store_cache (cache_key, data_json, fetched_at, ttl_ms)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(cache_key) DO UPDATE SET
        data_json = excluded.data_json,
        fetched_at = excluded.fetched_at,
        ttl_ms = excluded.ttl_ms
    `);
    stmt.run(key, JSON.stringify(data), new Date().toISOString(), ttlMs);
  }

  getCache<T>(key: string): { data: T; fetchedAt: Date; ttlMs: number } | null {
    const stmt = this.db.prepare(`
      SELECT data_json, fetched_at as fetchedAt, ttl_ms as ttlMs
      FROM store_cache
      WHERE cache_key = ?
    `);
    const row = stmt.get(key) as { data_json: string; fetchedAt: string; ttlMs: number } | undefined;
    
    if (!row) return null;

    const fetchedAt = new Date(row.fetchedAt);
    const age = Date.now() - fetchedAt.getTime();
    
    // Return null if expired
    if (age >= row.ttlMs) return null;

    return {
      data: JSON.parse(row.data_json) as T,
      fetchedAt,
      ttlMs: row.ttlMs,
    };
  }

  invalidateCache(key: string): void {
    const stmt = this.db.prepare(`DELETE FROM store_cache WHERE cache_key = ?`);
    stmt.run(key);
  }

  invalidateAllCache(): void {
    this.db.exec(`DELETE FROM store_cache`);
  }
}
