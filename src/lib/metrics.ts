interface MetricPoint {
  name: string;
  value: number;
  timestamp: string;
  tags?: Record<string, string>;
}

interface SkillMetrics {
  skillId: string;
  executionTimeMs: number;
  success: boolean;
  apiCalls: number;
  cacheHits: number;
  cacheMisses: number;
  errors: number;
}

class MetricsCollector {
  private metrics: MetricPoint[] = [];
  private skillMetrics: Map<string, SkillMetrics[]> = new Map();
  private readonly maxMetrics = 1000; // Keep last 1000 metrics

  recordMetric(name: string, value: number, tags?: Record<string, string>): void {
    this.metrics.push({
      name,
      value,
      timestamp: new Date().toISOString(),
      tags,
    });

    // Keep only recent metrics
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics);
    }
  }

  recordSkillExecution(metrics: SkillMetrics): void {
    const existing = this.skillMetrics.get(metrics.skillId) || [];
    existing.push(metrics);
    if (existing.length > 100) {
      // Keep only last 100 executions per skill
      existing.shift();
    }
    this.skillMetrics.set(metrics.skillId, existing);
  }

  getMetrics(since?: Date): MetricPoint[] {
    if (!since) {
      return [...this.metrics];
    }
    return this.metrics.filter((m) => new Date(m.timestamp) >= since);
  }

  getSkillMetrics(skillId: string): SkillMetrics[] {
    return [...(this.skillMetrics.get(skillId) || [])];
  }

  getSummary(): {
    totalMetrics: number;
    skillsTracked: number;
    recentExecutions: number;
  } {
    const recentExecutions = Array.from(this.skillMetrics.values()).reduce(
      (sum, executions) => sum + executions.length,
      0,
    );

    return {
      totalMetrics: this.metrics.length,
      skillsTracked: this.skillMetrics.size,
      recentExecutions,
    };
  }

  clear(): void {
    this.metrics = [];
    this.skillMetrics.clear();
  }
}

// Global metrics collector
export const metrics = new MetricsCollector();
export type { MetricPoint, SkillMetrics };
