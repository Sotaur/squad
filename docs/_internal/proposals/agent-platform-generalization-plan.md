# Agent Platform Generalization Plan

## Goal

Generalize Squad so a team can run on **any coding agent platform** (Copilot, Codex CLI, Cursor, Claude Code, etc.) using three portable primitives:

1. **Skills** (portable behavior + workflow knowledge)
2. **MCP** (portable tool access)
3. **Hooks** (portable governance and policy)

This should preserve Squad's existing strengths (routing, persistent team memory, policy enforcement) while reducing hard dependency on any single host runtime.

## Current Signals in This Repository

- Platform adapters already exist for work-tracking/repo backends (`github`, `azure-devops`, `planner`), which shows abstraction is already a design pattern in core runtime.
- Skills already exist as reusable filesystem packages with templates and starter packs.
- Hook pipelines already implement pre/post tool governance (file guards, shell restrictions, PII scrubbing, reviewer lockout).
- MCP is already treated as external and user-configured with multiple config locations.

Conclusion: the repo is already ~60-70% of the way to multi-agent-platform support; the missing piece is a **host agent adapter layer** and packaging strategy.

## Proposed Target Architecture

### 1) Host Agent Adapter Layer (new core contract)

Create a first-class `AgentHostAdapter` contract that normalizes host-specific SDK/runtime behavior:

- session lifecycle (start/stop/resume)
- tool invocation bridge
- streaming events
- context injection (team/routing/skills)
- model selection hints
- auth/environment diagnostics

**Initial adapters:**

- `copilot-host-adapter` (existing behavior wrapped)
- `codex-cli-host-adapter`
- `generic-mcp-host-adapter` (fallback when host only supports MCP)

### 2) Capability Matrix + Negotiation

Add capability negotiation so Squad can degrade gracefully instead of failing hard.

Examples:

- Host supports hooks? Use native hooks. If not, enforce in coordinator middleware.
- Host supports subagents? Use fan-out. If not, serialize with queue and role-tagged prompts.
- Host supports tool schemas? register tool schemas directly. If not, use instruction-wrapped pseudo-tools.

Output of negotiation: `ResolvedRuntimeProfile` used by coordinator/routing.

### 3) Portable Skill Packs

Promote existing skill templates into **platform-neutral + host-overrides**:

- `skills/<name>/SKILL.md` (portable behavior)
- `skills/<name>/references/<host>.md` (host-specific caveats)
- optional `scripts/` for deterministic reusable actions

Add a new starter bundle:

- `agent-platform-compat`
- `mcp-tool-discovery`
- `hook-governance-baseline`
- `fallback-routing` (for hosts lacking parallel subagents)

### 4) MCP Bundle Strategy

Standardize MCP as the cross-platform tool bus.

- Define `mcp-bundle.json` in repo (declarative required/optional servers)
- Add `squad mcp doctor` to validate env vars, commands, and connectivity
- Add server capability labels (`issues`, `git`, `tickets`, `deploy`, `docs-search`) to aid routing

This prevents host lock-in: if a host can speak MCP, Squad can recover a large feature surface quickly.

### 5) Hook Templates + Policy Profiles

Extract built-in governance hooks into installable profiles:

- `hooks/profiles/strict-enterprise.json`
- `hooks/profiles/startup-fast.json`
- `hooks/profiles/oss-maintainer.json`

Each profile compiles to:

- host-native hook config when available
- coordinator-enforced middleware otherwise

This gives teams policy portability across hosts.

## Implementation Plan (Phased)

### Phase 0 — Discovery + Contracts (1-2 sprints)

- Define `AgentHostAdapter` and `ResolvedRuntimeProfile` interfaces.
- Wrap existing Copilot runtime in adapter form (no behavior changes).
- Add integration tests proving parity.

### Phase 1 — Capability-Aware Coordinator (1 sprint)

- Introduce capability negotiation at startup.
- Route coordinator logic through profile gates (parallelism/tools/hooks).
- Add telemetry fields to show degraded vs native mode.

### Phase 2 — Portable Packaging (1 sprint)

- Add `mcp-bundle.json` schema and CLI validation command.
- Add hook profile templates + compiler to runtime hooks.
- Create platform-neutral starter skills and host reference files.

### Phase 3 — Second Host Adapter (2 sprints)

- Implement `codex-cli-host-adapter` as proving ground.
- Validate end-to-end flows: init, route, tool use, review, recover.
- Document compatibility matrix.

### Phase 4 — Marketplace + Ecosystem (ongoing)

- Publish “platform packs” (skills + MCP bundle + hook profile) for major hosts.
- Add plugin metadata to declare host compatibility and required capabilities.

## Suggested Deliverables (Repository Backlog)

1. `packages/squad-sdk/src/host/types.ts` — host adapter contracts.
2. `packages/squad-sdk/src/host/copilot-adapter.ts` — wrapped current integration.
3. `packages/squad-sdk/src/runtime/capability-profile.ts` — negotiation logic.
4. `templates/mcp-bundle.json` — declarative MCP package template.
5. `templates/hooks/profiles/*.json` — governance profile templates.
6. `templates/skills/agent-platform-compat/SKILL.md` — new compatibility skill.
7. `docs/src/content/docs/features/agent-platforms.md` — compatibility + setup guide.

## Risk Register

- **Semantic mismatch across hosts:** Mitigate via capability negotiation + degraded modes.
- **Policy drift between native hooks and middleware hooks:** Mitigate with shared test vectors.
- **MCP auth friction:** Mitigate with `squad mcp doctor` and explicit env diagnostics.
- **Complexity creep:** Keep Copilot as reference adapter; enforce adapter conformance tests.

## Success Criteria

- Squad can run on at least **two host agent platforms** with shared team state.
- ≥80% of core workflows unchanged (init, routing, decisions, skills, reviews).
- Policy profiles produce equivalent enforcement outcomes across hosts.
- New platform onboarding requires adapter implementation, not coordinator rewrite.

## Recommended Next Step

Build a thin vertical slice:

1. Create `AgentHostAdapter` contract.
2. Wrap current Copilot path behind it.
3. Implement one additional host adapter.
4. Validate with one shared skill pack + one shared MCP bundle + one shared hook profile.

This proves portability before broad refactors.
