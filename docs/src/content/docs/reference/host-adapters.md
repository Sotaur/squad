# Host Adapters Reference

> ⚠️ **Experimental** — API details may change between alpha releases.

This page is for SDK and runtime developers wiring multi-host support.

## Core types

The host adapter system is centered on:

- `AgentHostAdapter`
- `AgentHostType`
- `HostCapabilities`
- `HostCapabilityState` / `HostCapabilityStates`
- `ResolvedRuntimeProfile`

Import from:

```ts
import {
  createHostAdapter,
  resolveRuntimeProfile,
  resolveRuntimeProfileWithProbe,
  hasCapability,
  type AgentHostAdapter,
} from '@bradygaster/squad-sdk';
```

## Supported host types

- `copilot`
- `codex`
- `claude`
- `generic-mcp`

## Factory usage

```ts
const adapter = createHostAdapter({
  host: 'codex',
  clientFactory: () => myCodexClient,
});

await adapter.connect();
const profile = resolveRuntimeProfile({
  host: adapter.host,
  capabilities: adapter.capabilities,
  requiredCapabilities: ['parallelSessions', 'nativeHooks'],
  requireValidatedNativeHooks: true,
  confidence: { source: 'probe', score: 0.95 },
});
```

If you already have probe output, you can resolve in one step:

```ts
const profile = resolveRuntimeProfileWithProbe(
  { host: adapter.host, requiredCapabilities: ['nativeHooks'] },
  probeResult,
  { requireValidatedNativeHooks: true },
);
```

## Capability resolution notes

- `capabilityStates` supports `supported | unsupported | unknown`.
- boolean `capabilities` are derived from capability states.
- strict native hook validation can force fail-closed behavior.

## Generic MCP readiness

For `generic-mcp`, provide readiness checks to avoid false-positive connected state:

```ts
const adapter = createHostAdapter({
  host: 'generic-mcp',
  readinessCheck: async () => Boolean(process.env.MCP_CONFIG_READY),
});

await adapter.connect();
```

## Telemetry

Runtime profile resolution emits metrics for:

- degraded profile resolutions
- applied fallback strategies

Use these metrics to detect host capability drift over time.

## Related

- [Agent Platforms](../features/agent-platforms.md)
- [Tools & Hooks](./tools-and-hooks.md)
- [SDK Integration](./integration.md)
