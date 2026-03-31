# Host Adapter Fix Plan (Issue-by-Issue)

This plan expands each issue from the multi-lens review into concrete remediation work.

Reference review: `docs/_internal/reviews/host-adapter-multi-lens-review.md`

## Implementation status (current branch)

- ✅ H1 (partial): strict fail-closed mode for native hooks added in runtime profile resolution.
- ✅ M2 (partial): generic-mcp now uses explicit readiness-based connection state.
- ✅ M4 (partial): Codex/Claude constructor ergonomics normalized via optional `client` + `clientFactory`.
- ✅ L2 (partial): degraded profile + fallback strategy metrics instrumentation added.
- ⏳ Remaining items tracked below for full completion.

---

## P0 / High Severity

## Issue H1 — Overstated `nativeHooks` can weaken enforcement assumptions

### Risk

If `nativeHooks=true` is set incorrectly, policy enforcement may rely on non-existent host-native hooks and miss governance controls.

### Fix strategy

1. **Fail-closed default for hook capability**
   - Introduce capability state `unknown` and treat `unknown` as `unsupported` for enforcement decisions.
   - Force middleware hook enforcement unless probe confirms native hook support.
2. **Guard rail in profile resolution**
   - Add `requireValidatedNativeHooks` option in `resolveRuntimeProfile`.
   - If enabled and validation absent, set `nativeHooks=false` and emit warning.
3. **Runtime enforcement policy mode**
   - Add config: `hookEnforcementMode: 'middleware-first' | 'native-allowed'`.
   - Default to `middleware-first`.

### Code changes

- `packages/squad-sdk/src/host/types.ts`
  - add tri-state capability model (`supported|unsupported|unknown`) or validated wrapper for hooks.
- `packages/squad-sdk/src/runtime/capability-profile.ts`
  - enforce fail-closed transformation when capability unresolved.
- `packages/squad-sdk/src/coordinator/*` (integration phase)
  - route all policy hooks through middleware unless validation token exists.

### Tests

- Unit: unresolved `nativeHooks` always yields middleware fallback in strict mode.
- Unit: validated `nativeHooks` allows native path.
- Integration: simulated host with false positive hooks still blocked by middleware path.

### Exit criteria

- No code path can run native-only enforcement when capability confidence is below threshold.

---

## P1 / Medium Severity

## Issue M1 — Static optimistic capability defaults may drift from runtime truth

### Risk

Default capabilities for `codex` and `claude` can become stale and trigger incorrect routing/fallback behavior.

### Fix strategy

1. Add **runtime capability probe API** (`probeHostCapabilities`).
2. Cache probe result in `ResolvedRuntimeProfile` with timestamp + confidence.
3. Use static defaults only as bootstrap hints before probe completion.

### Code changes

- `packages/squad-sdk/src/host/probe.ts` (new)
- `packages/squad-sdk/src/runtime/capability-profile.ts`
  - merge static defaults + probe result + policy overrides.

### Tests

- Probe success updates profile from optimistic defaults to measured capabilities.
- Probe failure downgrades unknowns and triggers degraded mode safely.

### Exit criteria

- Runtime decisions are probe-backed in non-test execution mode.

---

## Issue M2 — `generic-mcp` always returns connected

### Risk

Operational failures can be hidden by unconditional connected state.

### Fix strategy

1. Add explicit `connectionState` state machine to `GenericMcpHostAdapter`.
2. Add `checkReadiness()` that validates declared MCP servers or registry availability.
3. Return `error` state with actionable diagnostics when readiness fails.

### Code changes

- `packages/squad-sdk/src/host/factory.ts`
  - replace static connected return with tracked state + probe.

### Tests

- Missing MCP configuration => `error`.
- Valid MCP configuration => `connected`.

### Exit criteria

- `generic-mcp` state truthfully reflects readiness.

---

## Issue M3 — Boolean capability model cannot represent uncertainty

### Risk

`false` (unsupported) and `unknown` (not yet measured) are conflated.

### Fix strategy

1. Introduce `CapabilityState = 'supported' | 'unsupported' | 'unknown'`.
2. Maintain compatibility by exposing derived booleans where needed.
3. Update fallback logic to prioritize safe behavior on `unknown`.

### Code changes

- `packages/squad-sdk/src/host/types.ts`
  - add stateful capability type.
- `packages/squad-sdk/src/runtime/capability-profile.ts`
  - add `resolveCapabilityState(...)` helpers.

### Tests

- Unknown capabilities trigger conservative fallback.
- Supported capabilities allow native paths.

### Exit criteria

- All routing decisions can differentiate unknown from unsupported.

---

## Issue M4 — Inconsistent adapter constructor ergonomics

### Risk

Copilot self-instantiates client while Codex/Claude require injected clients; this hurts predictability.

### Fix strategy

1. Standardize constructor signatures across adapters:
   - `{ client?: XClientLike, clientOptions?: ..., capabilities?: ... }`
2. Provide `create*HostAdapter` helper functions for ergonomic defaults.
3. Update docs and examples to a single adapter bootstrap pattern.

### Code changes

- `packages/squad-sdk/src/host/copilot-host-adapter.ts`
- `packages/squad-sdk/src/host/codex-host-adapter.ts`
- `packages/squad-sdk/src/host/claude-host-adapter.ts`
- `packages/squad-sdk/src/host/factory.ts`

### Tests

- Constructor parity tests across all adapters.
- Factory creates each adapter without custom client injection in default mode.

### Exit criteria

- Adapter creation API is consistent across hosts.

---

## P2 / Low Severity

## Issue L1 — Adapter delegation code duplication

### Fix strategy

- Create `BaseDelegatingHostAdapter` abstract class with shared lifecycle/session/event delegation.
- Host-specific adapters only provide host id + default capability profile + optional event normalization.

### Exit criteria

- Shared delegation behavior implemented once.

---

## Issue L2 — No degraded-mode performance telemetry

### Fix strategy

- Emit counters/timers for fallback strategy usage.
- Record degraded-path latency and serialized fan-out counts.

### Code changes

- `packages/squad-sdk/src/runtime/otel-metrics.ts`
- `packages/squad-sdk/src/runtime/capability-profile.ts`
- coordinator execution path instrumentation

### Exit criteria

- Dashboard can show degraded-mode frequency and impact.

---

## Issue L3 — Missing public host integration docs + limited remediation hints

### Fix strategy

1. Add docs page: `docs/src/content/docs/features/agent-platforms.md`.
2. Add troubleshooting section for capability probes and generic-mcp readiness failures.
3. Improve adapter/factory error strings with explicit next actions.

### Exit criteria

- Public docs cover setup and troubleshooting for Copilot/Codex/Claude/generic-mcp.

---

## Sequencing plan

1. **Phase A (Security first)**: H1 + M3 (fail-closed + uncertainty model)
2. **Phase B (Runtime truth)**: M1 + M2 (probing + readiness state)
3. **Phase C (API cleanup)**: M4 + L1 (constructor parity + base class)
4. **Phase D (Ops & docs)**: L2 + L3 (telemetry + external docs)

---

## Validation matrix

For each phase:

- Unit tests for capability resolution and adapter behavior.
- Conformance suite run across all adapters.
- Regression test of fallback strategy behavior.
- Docs build for any docs-touching phase.

---

## Ownership suggestion

- Runtime/security changes: SDK core maintainers.
- Adapter probing/integration: host adapter maintainers.
- Docs and DX: docs/devrel maintainers.

---

## Definition of done (overall)

All review findings are closed when:

1. Enforcement is fail-closed under capability uncertainty.
2. Capabilities are probe-backed with confidence metadata.
3. Adapter APIs are consistent and conformance-tested.
4. Degraded-mode telemetry is visible.
5. Public integration/troubleshooting docs are published.
