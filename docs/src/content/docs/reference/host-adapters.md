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

## ACP definition

**ACP** stands for **Agent Control Protocol**. In this context, ACP refers to a
newline-delimited **JSON-RPC 2.0** session protocol (typically over stdio) used
for host runtime control methods such as `initialize`, `session/new`,
`session/prompt`, and `session/stop`.

## Supported host types

- `copilot`
- `codex`
- `claude`
- `claw` (ZeroClaw/OpenClaw family, conservative defaults pending ACP probes)
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

For `claw`, default capabilities are intentionally conservative until ACP handshake/probe evidence promotes specific flags.

- `capabilityStates` supports `supported | unsupported | unknown`.
- boolean `capabilities` are derived from capability states.
- strict native hook validation can force fail-closed behavior.


## Claw family adapter design

`claw` is a host-family adapter intended for ZeroClaw/OpenClaw style runtimes.
Use `family` as a diagnostic hint while keeping one stable Squad-facing contract:

```ts
const adapter = createHostAdapter({
  host: 'claw',
  family: 'zeroclaw',
  clientFactory: () => myClawClient,
});
```

Design principles:

- **Family abstraction first**: one adapter contract for multiple claw runtimes.
- **Runtime injection**: explicit `client`/`clientFactory` to decouple SDK from transport.
- **Capability policy compatibility**: capability override support mirrors codex/claude adapters.

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
