# Unified Host Adapter Execution Plan (Reconciled)

## Source plans compared

- `agent-platform-generalization-plan.md` strengths:
  - clear architecture layers
  - phased rollout and risk framing
  - portability primitives (skills + MCP + hooks)
- `codex-claude-host-adapter-plan.md` strengths:
  - concrete adapter file-level scope
  - conformance test expectations
  - milestone-oriented delivery for Codex + Claude

## Reconciled strategy

Use architecture from the first plan and execution precision from the second:

1. Keep the host abstraction + capability negotiation as the stable core.
2. Deliver real adapters in this order: `codex`, then `claude`.
3. Use a shared conformance test suite so adapters are substitutable.
4. Add a host factory and keep coordinator rollout behind flags until parity is proven.
5. Preserve portability artifacts (MCP bundles, hook profiles, skills) as host-agnostic dependencies.

## Implemented in this slice

- Added `CodexHostAdapter` and `ClaudeHostAdapter`.
- Added `createHostAdapter(...)` factory.
- Expanded `AgentHostType` to include `codex` and `claude`.
- Added adapter-specific tests and a cross-adapter conformance test.

## Next slice

- Wire host factory into coordinator/client startup path under a feature flag.
- Add end-to-end smoke coverage for each host selection.
- Publish compatibility matrix docs once runtime wiring is enabled by default.
