# Copilot vs Claude vs Codex CLI/SDK: overlapping capabilities

_As of April 1, 2026 (UTC), based on the currently published vendor documentation._

## Scope and sources

This comparison focuses on **official documentation** for:

- **GitHub Copilot CLI** and Copilot extension/developer docs
- **Anthropic Claude Code CLI + SDK**
- **OpenAI Codex CLI/SDK-oriented docs**

Primary docs used:

- GitHub Copilot CLI: https://docs.github.com/en/copilot/concepts/agents/about-copilot-cli
- GitHub Copilot CLI usage/customization: https://docs.github.com/en/copilot/how-tos/use-copilot-agents/use-copilot-cli
- GitHub Copilot CLI command reference: https://docs.github.com/copilot/reference/cli-command-reference
- Anthropic CLI reference: https://docs.anthropic.com/en/docs/claude-code/cli-reference
- Anthropic Claude Code SDK: https://docs.anthropic.com/s/claude-code-sdk
- Anthropic MCP in SDK: https://docs.anthropic.com/en/docs/claude-code/sdk/sdk-mcp
- OpenAI code-generation guide (Codex positioning): https://platform.openai.com/docs/guides/code-generation
- OpenAI Codex overview: https://platform.openai.com/docs/codex/overview
- OpenAI Docs MCP (Codex CLI + IDE extension config): https://platform.openai.com/docs/docs-mcp
- OpenAI shell tool guide (Codex CLI as reference implementation): https://platform.openai.com/docs/guides/tools-shell

---

## Quick overlap matrix

| Capability | GitHub Copilot (CLI/docs) | Claude Code (CLI + SDK docs) | OpenAI Codex (CLI/SDK docs) | Overlap |
|---|---|---|---|---|
| Interactive terminal workflow | Yes (`copilot` interactive mode) | Yes (`claude` REPL mode) | Yes (Codex CLI local terminal workflow described in docs) | **All three** |
| Non-interactive / script mode | Yes (`--prompt`) | Yes (`-p/--print`) | Yes (Codex SDK/CLI positioned for CI/CD + automation) | **All three** |
| File/code edit + execution loop | Yes (agentic code changes + tool execution) | Yes (allowed/disallowed tools; permissions) | Yes (read/modify/run code; shell tool patterns) | **All three** |
| MCP integration | Yes (configure MCP servers) | Yes (MCP servers in CLI/SDK config) | Yes (Codex `mcp` config + shared CLI/extension config) | **All three** |
| Subagents / custom agents | Yes (default + custom agents) | Partial (agent behavior via tools/permissions; not framed as Copilot-style named subagents in docs used) | Partial (agentic Codex behavior; docs emphasize tasks + tools more than named subagents) | **Strongest in Copilot docs** |
| Session continuation/resume | Yes (session history/context controls) | Yes (`-c`, `-r <session-id>`) | Partial (Codex cloud/background tasks + client continuity; CLI session semantics less explicit in sources used) | **Copilot + Claude clear** |
| Structured output for programmatic use | Yes (CLI command/reference features; automation-focused options) | Yes (`json` / `stream-json` output + typed SDK messages) | Yes (API/SDK integration docs; tool-call structured loops) | **All three** |
| Built-in context/token management UX | Yes (`/usage`, `/context`, `/compact`) | Partial (focus more on permissions/tooling than explicit token dashboards in cited pages) | Partial (less CLI-token UX detail in cited Codex pages) | **Most explicit in Copilot docs** |
| Remote/cloud delegated coding tasks | Yes (coding agent can work on issues/PRs) | Not a primary framing in cited pages | Yes (Codex cloud runs tasks in sandboxed cloud envs, parallel background tasks) | **Copilot + Codex** |

---

## Overlapping capabilities (what is clearly common)

1. **Terminal-first agent experience**
   - All three ecosystems document a terminal/CLI entrypoint intended for iterative coding assistance.

2. **Automation-friendly non-interactive execution**
   - Copilot supports prompt-driven one-shot usage.
   - Claude supports `-p` non-interactive mode.
   - Codex docs explicitly position CLI/SDK for CI/CD and automation contexts.

3. **Tool-using coding agent behavior (read/edit/run)**
   - Each stack documents agentic coding behavior that includes reading files, editing code, and shell/tool operations with safety controls.

4. **MCP extensibility**
   - All three documentation sets include MCP server integration as a first-class extension mechanism.

5. **Programmable SDK/API pathways beyond chat UI**
   - Copilot has extension/developer APIs and programmatic CLI usage.
   - Claude has explicit SDK packages and schemas.
   - Codex docs position SDK/API integration for embedding coding agents in pipelines and products.

---

## Important differences in emphasis (still relevant to overlap decisions)

- **Copilot docs** emphasize: custom agents/subagents, context-window management UX, and GitHub-native coding-agent workflows (issues/PRs).
- **Claude docs** emphasize: strong CLI↔SDK parity, detailed permissions model (`allowedTools`, `disallowedTools`, permission prompt tool), and typed JSON streaming interfaces.
- **Codex docs** emphasize: local + cloud duality, API tool patterns (especially shell), MCP interoperability, and coding-model integration for agent builders.

---

## Practical “common denominator” feature set

If you need one workflow that ports across all three ecosystems, design around:

- CLI-based prompt execution (interactive + non-interactive)
- Read/edit/execute coding loop with explicit permission controls
- MCP-based external tools/resources
- JSON/structured outputs for CI automation
- Repo-scoped instructions/config files for behavioral steering

This is the highest-confidence overlap visible across current documentation.

