# LLM API Abstraction Plan (Minimal Squad Interaction Changes)

## Problem

Today Squad users mostly think in terms of model names and host adapters (`copilot`, `codex`, `claude`).
Switching backing LLM APIs can require host-level reasoning even when users only want to keep the same Squad workflow and swap providers.

## Goal

Let users specify a **backing LLM API/provider** directly, while keeping existing Squad interaction patterns unchanged:

- same CLI commands
- same agent prompts/roles
- same routing semantics
- same coordinator behavior

## Proposed API changes

## 1) Config schema: add `llmApi`

```ts
interface SquadConfig {
  // existing fields
  llmApi?: {
    provider:
      | 'copilot'
      | 'anthropic'
      | 'openai'
      | 'azure-openai'
      | 'google'
      | 'generic-openai-compatible'
      | 'generic-mcp';
    baseUrl?: string;
    apiKeyEnv?: string;
    model?: string;
    hostOverride?: 'copilot' | 'codex' | 'claude' | 'generic-mcp';
  };
}
```

Notes:
- Optional to preserve backward compatibility.
- If absent, current host/model behavior stays intact.

## 2) Host abstraction: add provider-to-host resolver

Add `resolveHostTypeForLlmApi(selection)` to map provider selection to adapter:

- `anthropic` -> `claude`
- `openai`, `azure-openai` -> `codex`
- `copilot` -> `copilot`
- `google`, `generic-openai-compatible`, `generic-mcp` -> `generic-mcp`
- `hostOverride` always wins

## 3) Factory API: add `createHostAdapterForLlmApi(...)`

New convenience API accepts `llmApi` + optional per-host options and internally dispatches to existing `createHostAdapter(...)`.
This minimizes coordinator or command-surface changes.

## Abstraction boundaries

### Stable boundary A: user intent
- `llmApi.provider` captures user intent (who backs generation/tooling).

### Stable boundary B: runtime adapter
- Existing host adapters remain execution backends.
- Provider mapping layer stays thin and replaceable.

### Stable boundary C: capability negotiation
- Existing `HostCapabilities` / runtime profile logic remains unchanged.
- New providers inherit current degrade/native behavior via mapped adapter.

## Migration strategy

1. Ship schema + resolver + factory API as additive features.
2. Keep legacy host-only initialization path untouched.
3. Incrementally adopt in CLI init flow (`squad init`) by asking provider first, host second only when needed.
4. Add diagnostics to print resolved binding:
   - selected provider
   - resolved host adapter
   - effective model hint

## Why this keeps interaction changes minimal

- No new end-user command vocabulary is required.
- Existing team files still work without edits.
- Existing host adapters and tests remain primary integration points.
- Users can switch provider with a small config diff instead of reworking routing/roles/ceremonies.

## Test plan

- Unit: provider -> host mapping matrix.
- Unit: `hostOverride` precedence.
- Unit: factory creation from provider selection.
- Config validation: accepts and validates optional `llmApi` block.
- Regression: existing host-specific tests continue to pass.

## Future extensions

- Provider capability probes (dynamic detection beyond static mapping).
- Multi-provider failover order (`providers: []`) with per-tier preferences.
- Provider-specific auth packs (OIDC, Azure workload identity, etc.).
