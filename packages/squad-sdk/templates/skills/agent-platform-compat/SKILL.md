---
name: agent-platform-compat
description: Use this skill when adapting workflows, tools, or policies across different coding-agent hosts (Copilot, Codex CLI, generic MCP hosts). It provides a capability-first approach to preserve behavior under host differences.
---

# Agent Platform Compatibility

## When to use

Use this skill when:

- migrating a squad between coding-agent hosts
- diagnosing why behavior differs across hosts
- designing fallback logic for missing host capabilities

## Workflow

1. Identify host capabilities:
   - parallel sessions
   - tool schemas
   - native hooks
   - streaming events
   - session resume
   - model hints
   - MCP tools
2. Compare required capabilities for the requested task.
3. If capabilities are missing, switch to fallbacks:
   - no parallel sessions → serialize work through coordinator queue
   - no native hooks → enforce policies in coordinator middleware
   - no streaming events → use turn-buffered responses
4. Record portability decisions in `decisions.md`.

## Output contract

Always return:

- host profile summary
- missing capability list
- fallback strategy list
- residual risks
