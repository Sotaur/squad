# MCP Squad Memory Server (SQLite + Pluggable Storage)

A self-contained MCP server that provides squad communication and durable memory tools.

## Features

- MCP tools:
  - `squad_health`
  - `squad_send_message`
  - `squad_list_inbox`
  - `squad_ack_message`
  - `squad_store_memory`
  - `squad_query_memories`
  - `squad_handoff`
- Durable SQLite backend by default.
- Pluggable storage abstraction (`SquadStorage`) with:
  - `SQLiteSquadStorage`
  - `InMemorySquadStorage`
- Basic secret redaction on persisted text fields.
- Tiered memory model:
  - `hot` (compact, frequently used),
  - `cold` (moderate detail),
  - `long_term` (most detailed + highest accuracy).
- Structured JSON logging for tool success/failure + request IDs.
- SQLite production defaults: WAL mode, busy timeout, prepared statements, retry on `SQLITE_BUSY`.
- Graceful shutdown hooks (`SIGINT`, `SIGTERM`) and explicit storage close.

## Quick Start

```bash
cd samples/mcp-squad-memory
npm install
npm run start
```

## Bootstrap Scripts (repo root)

Use these from the repository root to bootstrap quickly:

```bash
./scripts/bootstrap-mcp-squad-memory.sh
./scripts/bootstrap-skill-tool-hook.sh
```

### Environment Variables

- `SQUAD_MEMORY_BACKEND=sqlite|memory` (default: `sqlite`)
- `SQUAD_MEMORY_DB=.squad/squad-memory.db` (used when backend is `sqlite`)
- `SQUAD_MEMORY_AUTHZ_JSON` optional authz config, example:
  ```json
  {"defaultRateLimitPerMinute":120,"tokens":{"dev-token":{"squads":["demo-squad"],"rateLimitPerMinute":60}}}
  ```
- `SQUAD_MEMORY_MAX_MESSAGES_PER_SQUAD` optional quota (default: `50000`)
- `SQUAD_MEMORY_MAX_MEMORIES_PER_SQUAD` optional quota (default: `200000`)

> In `NODE_ENV=production`, `SQUAD_MEMORY_BACKEND=memory` is rejected at startup.

## Example MCP config entry

```json
{
  "mcpServers": {
    "squad-memory": {
      "command": "node",
      "args": ["samples/mcp-squad-memory/node_modules/tsx/dist/cli.mjs", "samples/mcp-squad-memory/src/index.ts"],
      "env": {
        "SQUAD_MEMORY_BACKEND": "sqlite",
        "SQUAD_MEMORY_DB": ".squad/squad-memory.db"
      }
    }
  }
}
```

## Codex CLI setup

Codex CLI and Codex IDE extension share `~/.codex/config.toml`.

1) Bootstrap from repo root:

```bash
./scripts/bootstrap-mcp-squad-memory.sh
```

2) Add a server entry to `~/.codex/config.toml`:

```toml
[mcp_servers.squad_memory]
command = "node"
args = ["/absolute/path/to/samples/mcp-squad-memory/node_modules/tsx/dist/cli.mjs", "/absolute/path/to/samples/mcp-squad-memory/src/index.ts"]

[mcp_servers.squad_memory.env]
SQUAD_MEMORY_BACKEND = "sqlite"
SQUAD_MEMORY_DB = ".squad/squad-memory.db"
```

3) Verify in Codex CLI:

```bash
codex mcp list
```

## Codex Web setup

Codex Web uses remote MCP connections (not local stdio processes).

1) Deploy this MCP sample behind a remote MCP transport (SSE or streamable HTTP).
2) In Codex Web (or ChatGPT Developer Mode), open Apps/Connectors settings and add your remote MCP URL.
3) Enable the app/tool in a session and verify by calling `squad_list_inbox` or `squad_query_memories`.

> Tip: keep local development on Codex CLI (stdio), and use a remotely hosted wrapper for Codex Web.

## Architecture

- `src/index.ts`: MCP tool registrations and server startup (stdio transport).
- `src/storage.ts`: storage abstraction + SQLite/in-memory implementations.
- `OPERATIONS.md`: SRE runbook (readiness, monitoring, alerting, backup/recovery).
- `../../docs/security/mcp-squad-memory-security-review.md`: security findings + prioritized remediation roadmap.

## Tiered memory behavior

- `squad_store_memory` accepts optional `tier` and `accuracy`.
- Query scoring blends confidence, accuracy, recency, usage, and tier weight.
- Access updates usage count and can evolve memories across tiers:
  - frequently accessed recent memories become/remain `hot`,
  - mid-frequency memories settle in `cold`,
  - old/infrequent memories drift to `long_term`.

## Notes

This sample is intentionally minimal and ready to extend with auth, encryption, and multi-tenant policy controls.
