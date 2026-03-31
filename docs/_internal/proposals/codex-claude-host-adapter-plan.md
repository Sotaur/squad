# Codex + Claude Host Adapter Delivery Plan

## Purpose

Plan the next execution slice after `AgentHostAdapter` scaffolding: implement two production adapters:

1. `codex-host-adapter`
2. `claude-host-adapter`

Both adapters must conform to `AgentHostAdapter`, provide a capability declaration, and pass the same conformance tests.

---

## Current baseline (already in repo)

- `AgentHostAdapter` contract and capability model exist.
- `CopilotHostAdapter` exists as reference implementation.
- Runtime capability negotiation exists (`resolveRuntimeProfile`).

This plan focuses on implementing the next two adapters and proving feature parity in degraded/native modes.

---

## Adapter 1: Codex Host Adapter

## Scope

Create `packages/squad-sdk/src/host/codex-host-adapter.ts` with:

- lifecycle bridge (`connect`, `disconnect`, `getConnectionState`)
- session creation bridge (`createSession`)
- event subscription bridge (`on(...)`)
- explicit capability declaration for Codex runtime

## Proposed capability profile

Default `codex` capabilities (initial target):

- `parallelSessions: true`
- `toolSchemas: true`
- `nativeHooks: true`
- `streamingEvents: true`
- `sessionResume: true`
- `modelHints: true`
- `mcpTools: true`

If any capability is unavailable in a deployment mode, adapter must override flags and let runtime degrade via `resolveRuntimeProfile`.

## Implementation notes

- Implement an internal `CodexClientLike` interface mirroring the minimum operations needed by `AgentHostAdapter`.
- Prefer dependency injection in constructor for testability.
- Reuse the same event contract style as `CopilotHostAdapter` (typed + untyped overloads).

## Tests

Add `test/codex-host-adapter.test.ts` that validates:

- lifecycle delegation
- session delegation
- event subscription delegation
- capability override behavior

---

## Adapter 2: Claude Host Adapter

## Scope

Create `packages/squad-sdk/src/host/claude-host-adapter.ts` with:

- lifecycle bridge (`connect`, `disconnect`, `getConnectionState`)
- session creation bridge (`createSession`)
- event subscription bridge (`on(...)`)
- capability declaration that can be toggled by environment/transport mode

## Proposed capability profile

Default `claude` capabilities (target, subject to runtime mode):

- `parallelSessions: true`
- `toolSchemas: true`
- `nativeHooks: true`
- `streamingEvents: true`
- `sessionResume: true`
- `modelHints: true`
- `mcpTools: true`

Degraded profile examples:

- If session persistence is unavailable: `sessionResume=false`
- If hook interception is not available in a specific integration path: `nativeHooks=false`

## Implementation notes

- Implement `ClaudeClientLike` with minimal required operations.
- Keep adapter independent from Anthropic package internals by isolating translation logic inside the adapter.
- Normalize events into existing Squad event names before dispatch.

## Tests

Add `test/claude-host-adapter.test.ts` that validates:

- lifecycle/session/event delegation
- event normalization behavior
- capability override behavior

---

## Shared Conformance Suite

Add `test/host-adapter-conformance.test.ts` with a table-driven suite executed for:

- `CopilotHostAdapter`
- `CodexHostAdapter`
- `ClaudeHostAdapter`

Conformance requirements:

1. Implements all `AgentHostAdapter` methods.
2. Returns valid `HostCapabilities` object.
3. Supports typed and untyped `on(...)` subscriptions.
4. Works with `resolveRuntimeProfile` without errors.

---

## Runtime wiring tasks

1. Add host selection helper:
   - `packages/squad-sdk/src/host/factory.ts`
   - input: `{ host: 'copilot' | 'codex' | 'claude' | 'generic-mcp' }`
2. Extend `AgentHostType` to include `'codex'` and `'claude'`.
3. Export new adapters in `packages/squad-sdk/src/host/index.ts`.
4. Keep coordinator wiring behind current behavior flag until adapter parity is confirmed.

---

## External integration assumptions

### Codex

- Uses MCP as a first-class integration path.
- Should be compatible with `mcp-bundle.json` strategy and server capability labels.

### Claude

- Claude Code supports MCP servers and slash-command/tool composition patterns.
- Adapter should treat MCP availability as required for cross-platform parity.

---

## Milestones

### M1 — Codex adapter skeleton (1 sprint)

- `codex-host-adapter.ts`
- adapter unit tests
- export + profile resolution validation

### M2 — Claude adapter skeleton (1 sprint)

- `claude-host-adapter.ts`
- adapter unit tests
- export + profile resolution validation

### M3 — Conformance + runtime switch (1 sprint)

- shared conformance tests
- host factory
- guarded runtime wiring in coordinator/client entry points

### M4 — Docs + rollout (1 sprint)

- docs page for host compatibility matrix
- integration notes for env/auth and MCP setup
- release notes with compatibility caveats

---

## Done criteria

This plan is complete when:

1. Codex and Claude adapters compile and export from SDK.
2. All adapter unit tests + conformance tests pass.
3. `resolveRuntimeProfile` produces expected native/degraded modes for both adapters.
4. A single squad config can switch host adapters without coordinator changes.
