# Agent Platforms

> ⚠️ **Experimental** — Host adapters are evolving quickly in alpha.

Squad can run across different coding-agent hosts through a shared host adapter layer.

## What this means for users

You can keep your team state, routing, skills, and governance patterns while changing host runtime.

Supported host targets in current SDK:

- `copilot`
- `codex`
- `claude`
- `generic-mcp` (fallback integration mode)

## Runtime behavior and graceful degradation

At startup, Squad resolves a runtime profile from host capabilities.

If required capabilities are missing, Squad runs in **degraded mode** and uses fallback strategies, for example:

- no parallel sessions → serialize work through coordinator queue
- no streaming events → buffered turn completion
- no native hooks → middleware policy enforcement

## Security defaults

When `requireValidatedNativeHooks` is enabled, Squad fail-closes native hook usage unless hooks were explicitly probe-validated.

This avoids trusting host-native governance controls when capability certainty is low.

## Generic MCP mode

`generic-mcp` is for MCP-only environments where direct agent session primitives may be unavailable.

- readiness is checked at connect time
- connection state is explicit (`connecting`, `connected`, `error`, etc.)
- failed readiness keeps the adapter in `error`

## For developers

If you are implementing adapters or integrating host selection in runtime code, use:

- [Host Adapters Reference](../reference/host-adapters.md)
- [SDK Integration](../reference/integration.md)
