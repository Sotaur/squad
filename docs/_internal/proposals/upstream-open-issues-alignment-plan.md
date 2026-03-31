# Upstream Open Issues Alignment Plan (Original Repo)

Date reviewed: 2026-03-31
Original repo reviewed: https://github.com/bradygaster/squad/issues?q=is%3Aissue+is%3Aopen

## Goal

Identify live upstream issues that **do not conflict** with this fork's host-adapter / capability-probing design shift, then define fix plans for each.

## Triage criteria

An upstream issue is considered **eligible** when:

1. It can be implemented without removing host-adapter abstractions (`host/*`, capability-profile, probes).
2. It does not force rollback of fail-closed governance behavior.
3. It does not contradict fork-level portability decisions (multi-host + MCP fallback).

## Priority summary

1. **P0 (memory tiers)** — #686
2. **P1 (runtime/package correctness)** — #714, #711
3. **P2 (docs/runtime UX)** — #712, #706

---

## Issue #686 — Research: Tiered memory implementation plan (#595 #600)

**Upstream status:** Open spike, references gaps where spawn prompts load full history and no archive read tool exists.

### Compatibility with fork

✅ Compatible and aligned.

- Fork already introduced richer capability profiling and probe-backed runtime decisions.
- Tiered memory improves context hygiene and complements host portability.

### Fix plan

#### Phase 1 — Hot tier on spawn (bounded context)

- Add `readRecentHistory(teamRoot, agentName, limit)` helper.
- Change spawn prompt assembly to include only recent hot entries + charter essentials.
- Config gate: `memory.hotLimit` default 5.

#### Phase 2 — Cold tier on demand

- Add read tool: `squad_history_read` with filters:
  - `agent`, `from`, `to`, `limit`, `query`
- Enforce tool-level redaction and path constraints.

#### Phase 3 — Tier policy + metrics

- Add runtime memory tier counters:
  - hot entries loaded
  - cold reads per session
  - average cold payload size
- Add fail-safe cap for cold reads to prevent context blow-up.

#### Phase 4 — Wiki tier (if storage-provider dependency is ready)

- Add optional wiki/index provider behind feature flag.
- Keep default off until storage abstraction in fork and upstream converge.

### Files likely touched

- `packages/squad-sdk/src/agents/history-shadow.ts`
- `packages/squad-sdk/src/agents/*` prompt assembly path
- `packages/squad-sdk/src/tools/*` (new history read tool)
- `packages/squad-sdk/src/runtime/otel-metrics.ts`
- docs: memory + tools reference

### Tests

- spawn payload excludes stale history beyond hot limit
- cold read tool returns bounded slices
- no regression in nap/archive behavior

---

## Issue #714 — CLI/SDK export mismatch: FSStorageProvider not exported

**Upstream status:** Open bug; packaged CLI fails to import `FSStorageProvider` from SDK.

### Compatibility with fork

✅ Compatible.

- Pure packaging/export correctness.
- No conflict with host-adapter design.

### Fix plan

1. Audit SDK public exports (`src/index.ts`) for `FSStorageProvider` presence.
2. Verify package `exports` map includes runtime path used by packaged CLI.
3. Add packaging smoke regression test that installs tarballs and imports the symbol.
4. Backfill changelog note for downstream integrators.

### Files likely touched

- `packages/squad-sdk/src/index.ts`
- `packages/squad-sdk/package.json`
- packaging smoke tests under `test/`

---

## Issue #711 — squad start --tunnel node-pty module not found

**Upstream status:** Open bug; runtime failure when starting tunnel due missing `node-pty` in packaged environment.

### Compatibility with fork

✅ Compatible.

- Operational packaging/runtime issue.

### Fix plan

1. Determine if `node-pty` should be dependency vs optional dependency for tunnel path.
2. Add lazy import guard with actionable error if missing.
3. Ensure bundler/package step preserves required dependency in global install path.
4. Add CLI integration test covering `start --tunnel` command bootstrap.

### Files likely touched

- `packages/squad-cli/src/cli/commands/start.ts`
- `packages/squad-cli/package.json`
- CLI packaging/integration tests

---

## Issue #712 — Docs search breaks after View Transitions navigation

**Upstream status:** Open bug; search modal/input no longer works after transition.

### Compatibility with fork

✅ Compatible.

- Docs UI behavior only.

### Fix plan

1. Rebind search event listeners on `astro:after-swap` (or equivalent transition hooks).
2. Refactor Search component init into idempotent `initSearch()` function.
3. Ensure cleanup of prior listeners to avoid duplicates.
4. Add Playwright regression: open search → navigate result → reopen search.

### Files likely touched

- `docs/src/components/Search.astro`
- docs tests (`docs/tests/search.spec.mjs`)

---

## Issue #706 — Missing YAML frontmatter in skills

**Upstream status:** Open bug; subset of skills without YAML header causes loader incompatibilities.

### Compatibility with fork

✅ Compatible.

- Complements this fork’s stricter skill portability goals.

### Fix plan

1. Enumerate all skill templates in canonical source.
2. Add YAML frontmatter (`name`, `description`) to any missing skill.
3. Run template sync and add test that rejects skill templates without frontmatter.
4. Add migration note for generated squads from older templates.

### Files likely touched

- `.squad-templates/skills/**/SKILL.md`
- `scripts/sync-templates.mjs`
- `test/template-sync.test.ts` (or new skill-frontmatter test)

---

## Non-prioritized / excluded in this pass

These were not planned here because they are broader feature initiatives and need separate product alignment with the fork roadmap:

- #710 loop + prompt injection research
- #708 work monitor feature expansion
- #707 task-scoped work output layout
- #685 git-notes state RFC

They are not rejected — only deferred pending roadmap capacity.

---

## Execution order recommendation

1. #686 (tiered memory) — highest architectural leverage and explicitly prioritized.
2. #714 and #711 — unblock packaging/runtime reliability.
3. #712 and #706 — docs/search and skill metadata hardening.

## Success criteria

- Memory-tier implementation lands without regression in history/nap flows.
- Packaged CLI/SDK smoke tests pass on clean install paths.
- Docs search transition bug reproducibly fixed.
- No skill template ships without valid YAML frontmatter.
