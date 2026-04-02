# Claw Family Adapter — Architecture Reconciliation & Execution Plan

## Context

The initial `claw` adapter scaffold established API parity with other host adapters,
but it does not yet satisfy strict architecture expectations for production
integration with ZeroClaw/OpenClaw runtimes.

This plan reconciles:

1. **Scaffold-first approach** (quick parity + low risk), and
2. **Protocol-first approach** (real ACP — Agent Control Protocol — transport, capability truthfulness,
   robust lifecycle/stream mapping).

The result is a staged design that is both review-friendly and shippable.

---

## Reviewer-grade concerns with the current scaffold

1. **No runtime protocol integration**
   - The current adapter requires an injected client but offers no reference ACP
     client implementation, so interoperability cannot be verified end-to-end.
2. **Capabilities are too optimistic by default**
   - Marking all capability flags `true` for `claw` lacks probe evidence and can
     produce false-native runtime profiles.
3. **No event normalization contract**
   - ACP turn events and Squad session events are not explicitly mapped, which
     risks silent streaming regressions.
4. **No failure taxonomy**
   - ACP JSON-RPC errors (`-32602`, `-32000`, etc.) are not normalized into
     Squad adapter/runtime error categories.
5. **No compatibility envelope**
   - `family` is metadata only; there is no version/profile handshake policy
     (ZeroClaw vs OpenClaw) for method support differences.

---

## Target architecture

### A. Two-layer design (hard requirement)

- **`ClawHostAdapter`**: stable Squad-facing host adapter.
- **`ClawAcpClient`**: protocol/transport implementation for ACP (Agent Control Protocol)
  JSON-RPC 2.0 over stdio (default), with room for alternate transports later.

This keeps the host boundary stable while allowing protocol evolution.

### B. Capability truth model

Capabilities for `claw` must be derived from:

1. conservative static defaults,
2. `initialize` handshake payload,
3. optional active probes.

`resolveRuntimeProfile` should consume measured capability states (`supported /
unsupported / unknown`) and confidence metadata (`source`, `score`,
`measuredAt`).

### C. Explicit event mapping table

Define and test a canonical mapping for:

- ACP streaming notifications → `message_delta` / `usage` / completion signals
- session lifecycle transitions → `connected` / `disconnected` / `error`
- stop/abort semantics → `abort()` and `close()` behavior

No implicit pass-through allowed.

### D. Error normalization

Introduce `mapClawAcpError()` with deterministic translation:

- JSON-RPC parse/request/method/params/internal errors
- ACP custom session-limit/session-not-found errors
- transport process death / timeout / malformed notification cases

All mapped errors must include actionable remediation text.

---

## Combined phased delivery plan

## Phase 0 — Contract hardening (1 PR)

### Scope

- Keep existing adapter scaffold but tighten design contracts.
- Change `defaultCapabilitiesForHost('claw')` to conservative values pending
  handshake/probe evidence.
- Add `ClawRuntimeProfile` type (`family`, `protocolVersion`, `serverInfo`,
  `methods`, capability states/confidence).

### Exit criteria

- Factory and adapter tests still pass.
- New tests enforce conservative defaults and override behavior.

---

## Phase 1 — ACP reference client (2 PRs max)

### Scope

- Add `claw-acp-client.ts`:
  - spawn command (default `zeroclaw acp`)
  - newline-delimited JSON-RPC request/response correlation
  - `initialize` handshake
  - `session/new`, `session/prompt`, `session/stop`
- Support strict timeout controls:
  - startup timeout
  - per-request timeout
  - stream idle timeout

### Exit criteria

- Deterministic integration test with a fake ACP subprocess.
- Clean shutdown and orphan-process prevention validated.

---

## Phase 2 — Event + session semantics (1–2 PRs)

### Scope

- Implement ACP→Squad event mapper with exhaustive switch + `never` guards.
- Normalize turn stream output into Squad session message/event model.
- Guarantee exactly-once terminal event behavior per prompt.

### Exit criteria

- Table-driven tests for every mapped event kind.
- Regression tests for out-of-order and duplicate notifications.

---

## Phase 3 — Capability probing and fail-closed policy (1 PR)

### Scope

- Add `probeClawCapabilities()` using handshake + active checks.
- Feed probe output into runtime profile resolution.
- Add strict mode option for claw hosts:
  - required capabilities not proven ⇒ degraded/fail-closed.

### Exit criteria

- Runtime profile tests for native/degraded outcomes with strict and non-strict
  policy.
- Telemetry markers for degraded fallback reasons.

---

## Phase 4 — Family compatibility envelope (1 PR)

### Scope

- Formalize compatibility matrix for `zeroclaw` and `openclaw`:
  - supported protocol versions
  - optional methods/features
  - known behavior differences
- Add adapter handshake validation with precise errors when outside supported
  envelope.

### Exit criteria

- Contract tests against fixture handshake payloads for both families.
- Documentation page with migration notes and compatibility table.

---

## Phase 5 — Production readiness (1 PR)

### Scope

- Observability: counters + timings for ACP requests/events/errors.
- Security hardening:
  - command path validation
  - env var pass-through policy
  - cwd/path restrictions
- Recovery policies:
  - reconnect/backoff strategy
  - session recreation guidance when process crashes

### Exit criteria

- Soak test scenario: repeated prompts + induced subprocess restarts.
- Security review checklist completed.

---

## Test strategy (cross-phase)

1. **Unit tests**
   - Adapter delegation, capability overrides/defaults, error mapping.
2. **Protocol tests**
   - JSON-RPC framing, request/response correlation, notification handling.
3. **Conformance tests**
   - Include `claw` in shared host adapter conformance suite.
4. **Integration tests**
   - Fake ACP server subprocess for deterministic CI.
5. **Failure-mode tests**
   - malformed JSON, timeout, method not found, session missing, stream stalls.

---

## Definition of done

The claw adapter is considered complete only when all of the following are true:

- Uses a real ACP reference client (not just injected mocks).
- Capability claims are evidence-backed and probe-aware.
- Event and error mappings are explicit and exhaustively tested.
- Family compatibility policy is documented and enforced.
- Runtime profile degrades safely under uncertainty.

