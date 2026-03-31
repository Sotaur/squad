# Host Adapter Multi-Lens Review — Round 2

Scope:

- `packages/squad-sdk/src/host/*`
- `packages/squad-sdk/src/runtime/capability-profile.ts`
- `packages/squad-sdk/src/runtime/otel-metrics.ts`
- adapter/factory/capability tests
- user + developer docs added in previous iteration

Method:

- Independent passes: Architecture, Security, Performance, AI, DX.
- Then reconciled severity matrix.

---

## Architecture (independent)

### Findings

1. **Medium** — `resolveRuntimeProfile` strict policy options are only available when called with option object, not when called with a concrete adapter instance.
   - This creates inconsistent call ergonomics and can bypass strict-policy expectations in adapter-first call sites.

2. **Low** — Probe abstraction exists in plans/docs but not as executable utility in runtime code.
   - This leaves capability confidence mostly static.

---

## Security (independent)

### Findings

1. **Medium** — Fail-closed mode cannot be centrally enforced if adapter-based callers cannot pass strict options.
   - Could allow accidental non-strict profile resolution paths.

---

## Performance (independent)

### Findings

1. **Low** — New capability-profile metric cache is not reset by `_resetMetrics`, causing potential cross-test pollution in metric tests.

---

## AI / LLM behavior (independent)

### Findings

1. **Low** — `unknown` capability state is defined but not fed by a probe utility, reducing practical value of uncertainty-aware routing.

---

## Developer Experience (independent)

### Findings

1. **Medium** — API ergonomics mismatch: adapter form and options form of `resolveRuntimeProfile` do not expose equivalent controls.

---

## Consolidated Severity Matrix

### Medium

1. **Security + Architecture + DX**
   - Unify strict-profile policy options for both adapter-based and options-based resolver calls.

### Low

1. **Performance**
   - Include capability-profile metric cache in `_resetMetrics`.

2. **Architecture + AI**
   - Add a minimal probe utility that can emit `unknown` states and `probe` confidence data.

---

## Exit condition for Round 2

Round 2 closes when:

1. Adapter-based resolution supports strict options consistently.
2. Metrics reset covers all newly introduced caches.
3. Probe utility exists and is test-covered for unknown/probe state behavior.
