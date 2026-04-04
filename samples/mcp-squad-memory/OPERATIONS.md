# SRE Operations Runbook — MCP Squad Memory

This runbook is for production operation of `samples/mcp-squad-memory`.

## Readiness Checklist

- [ ] Running on persistent storage (not `SQUAD_MEMORY_BACKEND=memory`).
- [ ] SQLite file path points to durable disk with backup policy.
- [ ] Process supervision configured (systemd, PM2, container restart policy).
- [ ] Structured logs are collected and retained.
- [ ] `squad_health` tool checked after deployment.
- [ ] Dependency and OS patch cadence established.

## Recommended Production Settings

- `SQUAD_MEMORY_BACKEND=sqlite`
- `SQUAD_MEMORY_DB=/var/lib/squad/squad-memory.db` (or equivalent persistent path)
- Run with non-root user and least-privilege filesystem access.
- Restrict network egress if running behind a remote MCP transport.

## Health & Monitoring

Use tool `squad_health` regularly.

Monitor:

- health status (`ok` vs `degraded`)
- SQLite integrity (`quick_check`)
- message and memory row growth rate
- tool failure log rate (`tool.failure`)
- latency p95 by tool (`durationMs`)

## Alerting

Trigger alerts when:

- `squad_health.status == degraded`
- repeated `SQLITE_BUSY`/`SQLITE_ERROR` failures
- sudden growth in memory/message row counts
- tool failure rate spikes above baseline

## Backup & Recovery

- Snapshot SQLite file on schedule.
- Keep at least one recent restore-tested backup.
- Validate restore by running `squad_health` and test tool calls.

## Incident Response

1. Check `squad_health`.
2. Inspect logs for `tool.failure` and `server.fatal` events.
3. If SQLite contention appears, reduce load and verify filesystem performance.
4. Restore from backup if DB corruption is suspected.
5. Re-run synthetic smoke calls (`squad_store_memory`, `squad_query_memories`).

## Capacity Planning

- Review growth trends weekly.
- Archive or expire stale memories.
- Keep query limits bounded.
- Evaluate migration from SQLite if write concurrency materially increases.
