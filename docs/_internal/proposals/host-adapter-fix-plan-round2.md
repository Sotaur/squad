# Host Adapter Fix Plan — Round 2

Reference: `docs/_internal/reviews/host-adapter-multi-lens-review-round2.md`

## Issue R2-M1 (Medium)

### Problem

`resolveRuntimeProfile` strict policy controls are not consistently available for adapter-based calls.

### Fix

- Add overload/secondary options argument so this works:

```ts
resolveRuntimeProfile(adapter, {
  requiredCapabilities: ['nativeHooks'],
  requireValidatedNativeHooks: true,
});
```

### Tests

- Add adapter-based strict-mode regression test.

---

## Issue R2-L1 (Low)

### Problem

Capability metrics cache is not reset in `_resetMetrics`.

### Fix

- Reset `_capabilityProfileMetrics` inside `_resetMetrics`.

### Tests

- Verify no regressions in existing tests and metrics module behavior.

---

## Issue R2-L2 (Low)

### Problem

`unknown` capability state is not populated by any runtime probe utility.

### Fix

- Add `packages/squad-sdk/src/host/probe.ts` with:
  - `HostCapabilityProbeResult`
  - `applyCapabilityProbe(...)` helper that merges probe results into runtime profile options
  - automatic `confidence.source='probe'`

### Tests

- Add probe unit tests for:
  - failed probe => `unknown` states
  - successful probe => `supported/unsupported` state merge

---

## Sequence

1. Resolver API parity (R2-M1)
2. Metrics reset hygiene (R2-L1)
3. Probe utility + tests (R2-L2)
4. Re-run adapter/capability/docs tests
5. Write closure note with “no open issues” for this round
