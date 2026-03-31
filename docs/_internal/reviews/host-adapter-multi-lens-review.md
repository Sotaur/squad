# Host Adapter Multi-Lens Review

Scope reviewed:

- `packages/squad-sdk/src/host/*`
- `packages/squad-sdk/src/runtime/capability-profile.ts`
- adapter/conformance tests under `test/*host-adapter*.test.ts`
- related planning docs

Method:

- Five independent lenses: Architecture, Security, Performance, AI Expert, Developer Experience.
- Each lens wrote findings before cross-lens reconciliation.
- Final section merges findings by severity and category.

---

## 1) Architecture Review (independent)

### Strengths

- Positive: clear `AgentHostAdapter` contract and capability model; allows host replacement without coordinator rewrites.
- Positive: `resolveRuntimeProfile` creates explicit degraded-vs-native mode behavior.
- Positive: conformance tests enforce substitutability across Copilot/Codex/Claude.

### Findings

1. **Medium — Capability source of truth is static defaults**
   - `defaultCapabilitiesForHost` hardcodes optimistic capability sets for codex/claude.
   - Architecture risk: defaults may diverge from real runtime behavior and create false-native execution.
   - Recommendation: add runtime capability probing and treat defaults as hints only.

2. **Low — Adapter implementation duplication**
   - Copilot/Codex/Claude adapters repeat identical delegation logic.
   - Recommendation: extract shared base/delegate helper to reduce drift and maintenance overhead.

---

## 2) Security Review (independent)

### Strengths

- Positive: no dangerous shell/file behaviors added in adapter code.
- Positive: capability model can force degraded paths where hooks are unavailable.

### Findings

1. **High — Overstated `nativeHooks` capability may weaken enforcement assumptions**
   - If a host is marked `nativeHooks=true` incorrectly, policy enforcement might rely on host-native hooks that do not actually exist.
   - Recommendation: enforce a fail-closed policy mode where unresolved hook capability defaults to middleware enforcement.

2. **Medium — `generic-mcp` connection state always reports connected**
   - In `GenericMcpHostAdapter`, `getConnectionState()` returns `'connected'` unconditionally.
   - This can mask operational failures and reduce detection/alerting for misconfigured deployments.
   - Recommendation: introduce explicit state transitions and readiness checks.

3. **Low — Factory accepts externally-injected clients without guard rails**
   - Useful for tests/integration, but production wiring should validate required methods/shape.
   - Recommendation: add runtime validation for factory client dependencies in non-test paths.

---

## 3) Performance Review (independent)

### Strengths

- Positive: adapter layer is thin; near-zero overhead over underlying clients.
- Positive: capability profile resolution is O(number_of_capabilities) and inexpensive.

### Findings

1. **Low — Repeated profile resolution may cause avoidable churn in hot paths**
   - If called repeatedly per operation, profile assembly may be redundant.
   - Recommendation: compute once at startup and cache immutable runtime profile per session/host.

2. **Low — No instrumentation around degraded-mode fallbacks yet**
   - Performance impact of fallback paths (serialization, buffered mode) is not measured.
   - Recommendation: emit telemetry counters/timers for degraded fallback usage.

---

## 4) AI/LLM Expert Review (independent)

### Strengths

- Positive: explicit capability flags are a strong abstraction for cross-host behavior.
- Positive: fallback strategies are concrete and align with agent-operational constraints.

### Findings

1. **Medium — Capability flags do not distinguish “unknown” vs “false”**
   - Current boolean model collapses uncertainty and unsupported capability into same value.
   - Recommendation: evolve capability values to tri-state (`supported` / `unsupported` / `unknown`) for safer orchestration.

2. **Medium — Fallback strategy mapping is static and not task-aware**
   - Some tasks may need stronger/alternative fallbacks depending on routing/tooling context.
   - Recommendation: allow task-context fallback policies layered over global defaults.

3. **Low — No confidence scoring for adapter capability assertions**
   - Recommendation: attach confidence metadata sourced from probes/tests to avoid brittle assumptions.

---

## 5) Developer Experience (DX) Review (independent)

### Strengths

- Positive: adapter tests are clear and fast.
- Positive: conformance suite gives maintainers confidence when adding new hosts.
- Positive: factory entry point simplifies runtime wiring.

### Findings

1. **Medium — Inconsistent constructor ergonomics across adapters**
   - Copilot can self-instantiate client; Codex/Claude require injected client.
   - DX consequence: inconsistent integration path and confusion for consumers.
   - Recommendation: standardize constructor patterns or provide companion `create*HostAdapter` helpers.

2. **Low — Missing docs for production host wiring sequence**
   - Plan docs are strong, but API-level how-to docs are still absent.
   - Recommendation: add public docs page with setup examples for each host + factory usage.

3. **Low — Error messages could be more actionable**
   - Generic MCP adapter error is clear but does not include remediation hints.
   - Recommendation: append suggested steps (configure MCP server, choose supported host).

---

## Reconciled Summary (cross-lens)

## Severity: High

1. **Security / Governance correctness**
   - Risk: incorrect `nativeHooks=true` can cause incorrect trust in host-native policy enforcement.
   - Action: fail closed by default (`nativeHooks=false` unless validated), and enforce middleware hooks when uncertain.

## Severity: Medium

1. **Architecture / Reliability**
   - Static optimistic capability defaults for Codex/Claude may drift from runtime truth.
   - Action: capability probing + persisted runtime profile.

2. **Security / Operability**
   - `generic-mcp` reports connected unconditionally.
   - Action: explicit health state/readiness checks.

3. **AI behavior / Safety**
   - Boolean capability model lacks uncertainty semantics.
   - Action: tri-state capabilities and uncertainty-aware routing.

4. **DX / API consistency**
   - Adapter constructor ergonomics are inconsistent.
   - Action: unify creation patterns and add helper constructors.

## Severity: Low

1. **Architecture / Maintainability**
   - Repeated adapter delegation code.
   - Action: base adapter helper.

2. **Performance / Observability**
   - No degraded-path telemetry and potential repeated profile computation.
   - Action: cache runtime profile + emit degraded-mode metrics.

3. **DX / Documentation & Errors**
   - Missing public integration guide for host factory and limited remediation hints.
   - Action: docs + richer error messages.

---

## Recommended next implementation backlog

1. Fail-closed hook-capability behavior (`nativeHooks` requires positive validation).
2. Add runtime capability probe API + probe-backed profile cache.
3. Introduce adapter conformance metadata (`confidence`, probe timestamp, host mode).
4. Improve `generic-mcp` state semantics with readiness checks.
5. Normalize constructor ergonomics across all adapters.
6. Add public “Host Adapter Integration” docs with factory examples.
