# Changelog

## 0.1.0

Initial public release.

### Added

- TypeScript CLI with commands:
  - `init`, `doctor`, `start`, `stop`, `run`, `run-all`, `logs`, `backfill`, `actions`, `status`
- Daemon scheduler mode with PID management.
- Core skills:
  - `dailyBriefing`
  - `anomalyDetection`
  - `customerSegmentation`
  - `competitorIntel`
  - `creativeStrategy`
  - `weeklyPL`
- Shared HTTP policy (retry/backoff/rate-limit/timeout).
- Google Ads OAuth refresh flow with persisted token updates.
- SQLite storage with migrations for:
  - run history
  - baseline metrics
  - action queue
- Output validation for computed briefing metrics.
- Secret encryption at rest for sensitive config values.
- `.env` and `.env.local` support with config overrides.
- Release automation scripts and package dry-run verification.
