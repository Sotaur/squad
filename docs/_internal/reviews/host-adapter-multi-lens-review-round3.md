# Host Adapter Multi-Lens Review — Round 3

Scope: host adapter runtime profile path after Round 2 fixes.

## Independent findings

### Architecture

1. **Medium** — Probe flow is still two-step for consumers (`applyCapabilityProbe` + `resolveRuntimeProfile` manual merge), creating integration drift risk.

### Security

1. **Low** — Confidence score is accepted as-is; out-of-range values could produce misleading confidence semantics.

### Performance

1. **Low** — No direct issue found in this round.

### AI behavior

1. **Low** — Missing guardrails on confidence score can impact policy behavior relying on confidence thresholds.

### DX

1. **Medium** — No single high-level API for “resolve with probe” despite probe utility existing.

## Consolidated

- Medium: add one-step probe-aware resolver helper.
- Low: normalize confidence score to [0,1] in resolver/probe path.

## Exit criteria

1. One-step probe-aware resolver exists and is tested.
2. Confidence score normalization is enforced and tested.
