# MCP Design for Squad Communication + Memory

This design provides an MCP service that gives squads a shared communication bus and durable memory layer.

## Goals

- Enable agent-to-agent handoffs without relying on implicit context.
- Provide searchable, structured memories with ownership and freshness metadata.
- Support cross-squad communication in mono-repo or multi-repo setups.
- Keep policy enforcement deterministic (ACLs, retention, tool restrictions).

## Service Components

1. **Comms Channel**
   - inbox/outbox per squad member
   - threaded messages with correlation IDs
   - ack + status transitions (`queued`, `read`, `resolved`)

2. **Memory Store**
   - durable entries keyed by `squadId`, `agentName`, tags
   - supports `fact`, `decision`, `risk`, `handoff`, `retro` memory types
   - tiered memory classes: `hot`, `cold`, `long_term`
   - metadata: confidence, source, createdAt, expiresAt

3. **Policy Layer**
   - role-based write/read controls
   - tool-level rate limiting
   - retention and redaction rules (PII/secret handling)

4. **Index + Retrieval Layer**
   - exact filters (`agentName`, `tags`, `type`)
   - text search fallback
   - recency and confidence scoring

## MCP Tool Contract

Expose these tools:

- `squad_send_message`
- `squad_list_inbox`
- `squad_ack_message`
- `squad_store_memory`
- `squad_query_memories`
- `squad_handoff`
- `squad_health`

### Tool Responsibilities

- `squad_send_message`: route a message to one or more members.
- `squad_list_inbox`: fetch unresolved messages for a member.
- `squad_ack_message`: mark a message as read/resolved.
- `squad_store_memory`: upsert durable memory entries.
- `squad_query_memories`: return top relevant memories.
- `squad_handoff`: atomic operation to send handoff + store memory record.
- `squad_health`: report backend health and key storage stats for operations.

## Data Model

```text
Message {
  id, squadId, from, to[], subject, body,
  tags[], correlationId?, status, createdAt, ackedAt?
}

Memory {
  id, squadId, agentName, type, summary, details,
  tags[], confidence, source, createdAt, expiresAt?
}
```

## Recommended Guardrails

- **MUST** require `squadId` on every request.
- **MUST** reject writes missing `agentName` and `type`.
- **MUST** enforce max payload sizes to prevent context flooding.
- **MUST** redact obvious secret patterns before persistence.
- **SHOULD** expire low-confidence memories quickly.
- **SHOULD** prioritize recent + high-confidence memories during retrieval.
- **SHOULD** keep hot memories compact, cold memories medium-detail, and long-term memories high-accuracy + rich detail.

## Integration Pattern

1. Coordinator activates skill.
2. Agent sends message/handoff through MCP instead of ad-hoc notes.
3. Agent writes memory after completing a meaningful step.
4. Next agent queries memories before execution.
5. Hook layer enforces tool policy (allowed tools per active skill).

## Reference Implementation

- Self-contained MCP server sample (recommended): `samples/mcp-squad-memory/`
- Core storage abstraction + SQLite implementation: `samples/mcp-squad-memory/src/storage.ts`
- MCP tool registration + stdio server bootstrap: `samples/mcp-squad-memory/src/index.ts`
- Bootstrap script for MCP wiring: `scripts/bootstrap-mcp-squad-memory.sh`
- Bootstrap script for hook wiring: `scripts/bootstrap-skill-tool-hook.sh`
- Production hardening in sample: structured logging, safe tool wrappers, payload limits, SQLite retry/WAL pragmas, graceful shutdown.
- Security controls in sample: optional token authz (`SQUAD_MEMORY_AUTHZ_JSON`), squad-scoped access checks, per-token rate limits, production memory-backend guard.
- Next-phase controls now in sample: per-squad quotas and sensitive-data blocking patterns before writes.
- SRE runbook: `samples/mcp-squad-memory/OPERATIONS.md`
- Security review + remediation plan: `docs/security/mcp-squad-memory-security-review.md`

## Codex Client Setup Notes

- **Codex CLI / IDE extension:** configure local stdio MCP entries in `~/.codex/config.toml`.
- **Codex Web:** connect to a remotely hosted MCP endpoint (SSE/streamable HTTP), since local stdio processes are not directly attachable from web sessions.
