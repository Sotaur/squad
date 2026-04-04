# Claude Skill-Only Squad: Four-Model Reconciliation (Anthropic Lens)

This guide answers: **"If Squad behavior/practices came only from skill files, what should that look like for Claude?"**

It compares four plausible operating versions, then reconciles them into one production-ready pattern optimized for Claude's strengths (structured reasoning, tool use discipline, and long-context planning).

## Evaluation Criteria

Use these criteria to judge any skill-only squad design:

1. **Clarity:** Can Claude quickly select the right workflow?
2. **Efficiency:** Does it minimize unnecessary file/tool/context usage?
3. **Quality:** Does it reliably produce verifiable, low-regression outcomes?
4. **Recoverability:** Does it handle blockers without thrashing?
5. **Scalability:** Does it remain stable as team/repo complexity grows?

## Four Versions

### Version A — Monolithic "One Skill Does Everything"

**Shape**

```text
.squad/skills/
  squad-master/
    SKILL.md
```

**Pros**

- Simple to install and understand.
- One canonical place for policy.

**Cons**

- Grows into context bloat.
- Hard to update safely.
- Encourages over-activation and generic behavior.

### Version B — Role-Centric Skills

**Shape**

```text
.squad/skills/
  lead/
  frontend/
  backend/
  qa/
  reviewer/
```

**Pros**

- Mirrors org/team mental model.
- Clear ownership by function.

**Cons**

- Behavior duplicated across roles.
- Handoffs can become noisy.
- Skills trigger by "who" instead of "work type."

### Version C — Stage-Gated Lifecycle Skills

**Shape**

```text
.squad/skills/
  discover/
  plan/
  implement/
  validate/
  release/
```

**Pros**

- Clean phase progression.
- Strong quality checkpoints.

**Cons**

- Can become rigid for small tasks.
- Overhead if all stages run every time.

### Version D — Capability + Guardrail Hybrid

**Shape**

```text
.squad/skills/
  orchestrator/
  task-triage/
  implementation-standard/
  test-discipline/
  review-gates/
  release-readiness/
  context-economy/
  blocker-escalation/
```

**Pros**

- Modular and reusable.
- Activates only needed capabilities.
- Separates execution from governance.

**Cons**

- Requires clear precedence and routing rules.
- Needs discipline to avoid overlap.

## Reconciliation: Best Combined Solution

For Anthropic/Claude usage, **Version D should be the baseline**, with:

- Version A's single-source policy mindset,
- Version B's explicit ownership language in handoffs,
- Version C's minimal required gates for quality.

Result: **A capability-first architecture with strict guardrails and selective stage gating.**

## Recommended Canonical Skill Set (Claude)

```text
.squad/skills/
  squad-orchestrator/        # routing + workflow selection
  task-triage/               # intake normalization
  implementation-standard/   # code-change rules
  test-discipline/           # verification strategy
  review-gates/              # merge readiness
  release-readiness/         # release safety
  context-economy/           # token/time efficiency
  blocker-escalation/        # bounded retries + escalation
  member-onboarding/         # add a new squad member from expert profile
  mcp-comms-memory/          # shared communication and durable memory via MCP
```

## How Member Skills Should Be Written (with Tool Options)

Use **one behavior skill per member** plus shared guardrail skills. Member skills should stay specialized and reference shared policies instead of duplicating them.

### Suggested Member Skill Layout

```text
.squad/skills/
  members/
    tech-lead/
      SKILL.md
    backend-engineer/
      SKILL.md
    frontend-engineer/
      SKILL.md
    qa-engineer/
      SKILL.md
    security-reviewer/
      SKILL.md
```

### Standard Member Skill Contract

Every member `SKILL.md` should define:

1. **Mission:** what this member is accountable for.
2. **In-scope tasks:** explicit task classes this member should accept.
3. **Out-of-scope tasks:** tasks to reroute to another member.
4. **Tool policy:** allowed tools, preferred order, and forbidden usage.
5. **Quality bar:** member-specific acceptance checks.
6. **Handoff format:** what to pass to the next member.

### Tool Options by Member (Example Policy)

Use this as a concrete starting point for Claude-driven squads.

#### `tech-lead`
- **Primary tools:** repo search/read, architecture docs, planning artifacts.
- **Secondary tools:** test summary commands for release confidence.
- **Guidelines:** no broad file edits unless resolving architectural blocker; must produce decision log + rationale.

#### `backend-engineer`
- **Primary tools:** source edit, unit/integration test commands, API contract checks.
- **Secondary tools:** DB migration/schema tools when needed.
- **Guidelines:** bias to backward compatibility and migration safety; always map endpoint/data changes to tests.

#### `frontend-engineer`
- **Primary tools:** component edits, type checks, frontend test/lint commands.
- **Secondary tools:** visual regression/screenshot tooling when UI changes.
- **Guidelines:** include accessibility and state/error-path checks; avoid unrelated styling churn.

#### `qa-engineer`
- **Primary tools:** test runners, fixture generation, flaky-test isolation tools.
- **Secondary tools:** coverage reporting and smoke scripts.
- **Guidelines:** focus on reproducibility and failure minimization; output failing test evidence + minimal repro.

#### `security-reviewer`
- **Primary tools:** dependency/audit scanners, secret-leak checks, auth/config inspections.
- **Secondary tools:** threat-model checklists and policy references.
- **Guidelines:** classify findings by severity and exploitability; provide mitigation + verification plan.

### Cross-Member Tool Guidelines

- **Least-cost first:** prefer deterministic, local, low-cost commands before expensive workflows.
- **No speculative tooling:** don't run heavyweight tools without a triggering hypothesis.
- **Evidence capture:** each tool invocation should map to a decision or acceptance criterion.
- **Retry discipline:** max two retries before escalation to `blocker-escalation`.
- **Safety first:** destructive commands require explicit justification in execution notes.

## Strong Tool-Language Policy (Recommended Wording)

Use explicit RFC-2119 style wording in each member skill:

- **MUST** use only tools listed in that skill's `allowedTools` policy for in-scope tasks.
- **MUST NOT** invoke blocked tools except during approved escalation paths.
- **MUST** execute preferred tools in declared order before trying alternates.
- **MUST** provide evidence (command output or file deltas) for every tool-driven claim.
- **SHOULD** avoid expensive tools until a low-cost check fails.
- **MAY** use emergency overrides only when `blocker-escalation` is active and reason is recorded.

This language removes ambiguity and makes enforcement deterministic.

## Hook Design: Enforce Allowed Tools Per Active Skill

You can enforce tool policy with a custom pre-tool hook that checks:

1. current active skill ID,
2. tool being invoked,
3. skill policy (`allowedTools`, `blockedTools`, `preferredOrder`),
4. whether escalation override is active.

### Example Skill Policy Block

```yaml
---
name: backend-engineer
domain: engineering
triggers: [api, migration, endpoint]
roles: [backend-engineer]
toolPolicy:
  allowedTools: [read_file, edit_file, npm_test, node]
  blockedTools: [rm_rf, force_push]
  preferredOrder: [read_file, npm_test, edit_file]
  allowOverrideVia: blocker-escalation
---
```

### Example Enforcement Hook (Complete TypeScript)

```ts
import { HookPipeline } from '@bradygaster/squad-sdk/hooks';
import { createSkillToolPolicyHook } from '../examples/skill-tool-policy-hook';

const hook = createSkillToolPolicyHook((ctx) => {
  const activeSkillId = (ctx.arguments.activeSkillId as string | undefined) ?? undefined;
  const policyBySkill = {
    'backend-engineer': {
      allowedTools: ['read_file', 'edit_file', 'npm_test', 'exec'],
      blockedTools: ['git_push_force'],
      preferredOrder: ['read_file', 'npm_test', 'edit_file'],
    },
  } as const;

  return {
    activeSkillId,
    policy: activeSkillId ? policyBySkill[activeSkillId as 'backend-engineer'] : undefined,
  };
});

const pipeline = new HookPipeline();
pipeline.addPreToolHook(hook);
```

Full implementation: `docs/examples/skill-tool-policy-hook.ts`.

The implementation supports comprehensive enforcement beyond simple allow/deny:

- tool allowlist/denylist modes,
- ordered tool workflows (`preferredOrder`),
- file-write path allow/block policies,
- shell command blocklists + allowed prefixes,
- network domain allow/block lists,
- permission request controls (`ask_user` budgets per session),
- per-member overrides layered on top of per-skill policy.
- self-improvement gate: if a task has failed more than twice, require either
  1) writing a detailed procedure (`squad_store_memory`), or
  2) requesting a new specialized squad member (`request_user_input`/`ask_user`).

### Optional `squad.config.ts` Guardrail Layer

Use global hooks as a coarse-grained safety net, then skill hook for fine-grained policy:

```ts
import { defineConfig } from '@bradygaster/squad-sdk';

export default defineConfig({
  hooks: {
    allowedWritePaths: ['src/**', 'test/**', 'docs/**', '.squad/**'],
    blockedCommands: ['rm -rf', 'git push --force', 'git reset --hard'],
    scrubPii: true,
    reviewerLockout: true,
  },
});
```

### Enforcement Notes

- Treat missing `toolPolicy` as **deny-by-default** for high-governance squads.
- Record blocked tool attempts in orchestration logs for auditability.
- Keep policy data near skill metadata to avoid drift between docs and runtime behavior.
- Prefer middleware hooks when host-native hooks are unavailable.

## Activation Contract

Each skill should include the same top-level sections:

1. **When to activate**
2. **Inputs required**
3. **Workflow steps**
4. **Hard guardrails (must not violate)**
5. **Evidence required for completion**
6. **Escalation conditions**

This shared structure prevents drift and makes routing deterministic.

## Claude-Optimized Guardrails

### 1) Efficiency Guardrails

- **Minimal activation:** orchestrator + only required execution skills.
- **Read budget:** cap initial file reads; expand only with justified need.
- **Command ladder:** cheap deterministic checks before expensive operations.
- **Retry ceiling:** maximum 2 retries per blocker category before escalation.
- **Diff discipline:** prefer small, reversible increments.

### 2) Quality Guardrails

- **Definition of Done required:** objective + acceptance checks + non-goals.
- **Evidence-first completion:** no "done" claim without command/file proof.
- **Regression targeting:** each touched behavior maps to at least one check.
- **Risk note required:** include rollback strategy for non-trivial changes.

### 3) Coordination Guardrails

- **Handoff schema:** `status | changes | evidence | risks | next owner`.
- **No silent skip:** if a gate is skipped, explain why and residual risk.
- **Priority order:** system/developer/user directives > repo rules > skill defaults.
- **Contradiction stop:** pause and request clarification on conflicting constraints.

### 4) Context Guardrails

- **Progressive disclosure:** concise SKILL.md; details in references.
- **No policy duplication:** one canonical owner skill per policy area.
- **Checkpoint recaps:** brief summaries after triage, implementation, pre-final.
- **Prune stale threads:** explicitly discard failed hypothesis branches.

## Repository-Validated Capability Notes

The repository tests and templates imply a few concrete constraints that member skills should follow:

- Frontmatter parsing is validated for `name`, `domain`, `triggers`, and `roles` (mapped to agent roles). Keep these present for reliable matching.
- Skill matching is trigger- and role-aware (case-insensitive), so `triggers` should include likely task keywords.
- Tool declarations in frontmatter are metadata/documentation. Executable tool handlers come from `scripts/*.js` in a skill directory.
- Script-backed tools resolve with the `squad_` prefix convention in loader behavior.
- If a skill has no body content, parsing can fail; include non-empty actionable body sections.

These constraints keep the guide aligned with current parser/loader expectations in tests and built-in templates.

## Reference `SKILL.md` Template (Aligned to Current Tests/Templates)

```markdown
---
name: implementation-standard
description: Enforce safe, incremental, evidence-backed code changes for Claude-driven squad execution.
domain: engineering
confidence: medium
source: observed
triggers: [refactor, bugfix, regression, test]
roles: [backend-engineer, frontend-engineer, qa-engineer]
tools:
  # Optional metadata describing relevant tools for this skill
  - name: test-runner
    description: Run targeted test suites for changed behavior
    when: after each implementation increment
---

# When to Activate
Use when any source file modification is required.

# Inputs Required
- objective
- constraints
- acceptance checks
- affected files/modules

# Workflow
1. Propose smallest viable diff.
2. Implement increment.
3. Run mapped verification.
4. Record evidence.
5. Repeat until acceptance checks pass.

# Hard Guardrails
- Never claim completion without evidence.
- No broad refactor unless explicitly requested.
- Preserve backward compatibility unless waived.
- Stop and escalate after two failed retries.

# Evidence Required for Completion
- changed files
- commands run + outcomes
- residual risks

# Escalation Conditions
- missing requirements
- blocked environment
- contradictory constraints
- repeated verification instability
```

### Optional Script Handler Layout (for executable tools)

```text
.squad/skills/implementation-standard/
  SKILL.md
  scripts/
    create_issue.js
    update_issue.js
    list_issues.js
    close_issue.js
```

If `scripts/` exists, handlers should be valid JavaScript modules and follow the expected naming pattern so loader/tool registration can map them correctly.

## `member-onboarding` Skill (Add a New Squad Member from Expert Description)

Create a dedicated skill to reliably add new members based on a natural-language expert profile.

### Purpose

Turn input such as _\"Add a performance engineer expert in PostgreSQL indexing and API latency analysis\"_ into a consistent new member definition with routing + tool policy.

### Required Inputs

- member name (or naming preference),
- expert domain(s),
- primary outcomes they own,
- constraints (stack, repo boundaries, risk tolerance),
- expected collaboration pattern with existing members.

### Workflow

1. Parse expert description into capabilities, boundaries, and deliverables.
2. Map responsibilities to existing member coverage to avoid overlap.
3. Generate a new member skill with mission, scope, tool options, and quality gates.
4. Add routing rules so orchestrator knows when to invoke this member.
5. Add handoff expectations (inputs/outputs to neighboring members).
6. Validate with one representative scenario.

### Output Contract

- New member `SKILL.md` file with:
  - mission,
  - in-scope/out-of-scope,
  - tool options + order of operations,
  - acceptance checks,
  - escalation triggers.
- Routing snippet for `squad-orchestrator`.
- Brief overlap report showing why this member is distinct from current squad.

### Guardrails

- Do not create a member whose scope is already fully covered.
- Prefer capability composition (small focused member) over broad generalists.
- Enforce explicit tool policy (allowed/preferred/restricted).
- Require at least one measurable success criterion tied to owned outcomes.

## `mcp-comms-memory` Skill (Squad Communication + Memory via MCP)

Use a dedicated skill for agent-to-agent messaging and durable memory retrieval through MCP tools.

- Design document: `docs/features/mcp-squad-communication-memory.md`
- Self-contained MCP sample: `samples/mcp-squad-memory/`

Recommended tool set:

- `squad_send_message`
- `squad_list_inbox`
- `squad_ack_message`
- `squad_store_memory`
- `squad_query_memories`
- `squad_handoff`

## Routing Logic (What Claude Should Do First)

1. Activate `squad-orchestrator` for classification.
2. Activate `task-triage` to normalize requirements.
3. Select execution skill(s): usually `implementation-standard` + `test-discipline`.
4. Run `review-gates` before finalizing output.
5. Run `release-readiness` only for release-affecting work.
6. Use `blocker-escalation` immediately on retry ceiling.
7. Apply `context-economy` rules throughout.

## Practical Scoring Rubric for the Four Versions

Score each 1-5 (higher is better):

- Clarity
- Efficiency
- Quality
- Recoverability
- Scalability

Expected outcome in most engineering environments:

- **A:** high clarity, low scalability.
- **B:** medium clarity, medium quality.
- **C:** high quality, medium efficiency.
- **D:** highest balance across all criteria.

## Final Recommendation

For Anthropic teams using Claude, implement the **Version D hybrid** with the standardized activation contract and guardrails above.

This yields a squad that is:

- **fast** (minimal activation + bounded retries),
- **reliable** (evidence-backed gates),
- **auditable** (consistent handoff/evidence schema),
- **scalable** (modular skills that avoid monolithic drift).
