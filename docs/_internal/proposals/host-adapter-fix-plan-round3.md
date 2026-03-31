# Host Adapter Fix Plan — Round 3

Reference: `docs/_internal/reviews/host-adapter-multi-lens-review-round3.md`

## R3-M1

Add `resolveRuntimeProfileWithProbe(...)` so callers can provide probe results without manual patch plumbing.

### Tasks

- Add helper in `runtime/capability-profile.ts`.
- Reuse `applyCapabilityProbe` internally.
- Keep existing APIs backward compatible.

### Tests

- Probe success path resolves to expected capability state.
- Probe failure path yields unknowns and degraded mode when required.

## R3-L1

Normalize confidence score in all runtime profile outputs.

### Tasks

- Clamp confidence score to [0,1] in resolver helper.
- Clamp probe-provided confidence score similarly.

### Tests

- negative score -> 0
- score > 1 -> 1

## Done

Round 3 closes when both helper and normalization are implemented and tested.
