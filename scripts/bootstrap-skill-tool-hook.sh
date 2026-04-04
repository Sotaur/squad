#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${1:-$(pwd)}"
SOURCE_HOOK="$ROOT_DIR/docs/examples/skill-tool-policy-hook.ts"
HOOK_DIR="$ROOT_DIR/.squad/hooks"
HOOK_FILE="$HOOK_DIR/skill-tool-policy-hook.ts"
REGISTER_FILE="$HOOK_DIR/register-skill-tool-hook.ts"

if [[ ! -f "$SOURCE_HOOK" ]]; then
  echo "❌ Source hook example not found: $SOURCE_HOOK" >&2
  exit 1
fi

mkdir -p "$HOOK_DIR"
cp "$SOURCE_HOOK" "$HOOK_FILE"

cat > "$REGISTER_FILE" <<'TS'
import { HookPipeline, type PreToolUseContext } from '@bradygaster/squad-sdk/hooks';
import { createSkillToolPolicyHook, type SkillToolPolicy } from './skill-tool-policy-hook.js';

// Replace with your real active-skill resolver from session/router state.
function resolveActiveSkill(ctx: PreToolUseContext): { activeSkillId?: string; policy?: SkillToolPolicy } {
  const activeSkillId = typeof ctx.arguments.activeSkillId === 'string' ? ctx.arguments.activeSkillId : undefined;

  const policies: Record<string, SkillToolPolicy> = {
    'backend-engineer': {
      mode: 'allowlist',
      allowedTools: ['read_file', 'edit_file', 'npm_test', 'exec'],
      blockedTools: ['git_push_force'],
      preferredOrder: ['read_file', 'npm_test', 'edit_file'],
      fileWrites: {
        allowed: ['src/**', 'test/**'],
        blocked: ['**/.env*']
      },
      shell: {
        blockedPatterns: ['rm -rf', 'git push --force', 'git reset --hard'],
        allowedPrefixes: ['npm ', 'pnpm ', 'node ', 'git status']
      },
      permissions: {
        allowAskUser: true,
        maxAskUserPerSession: 3
      },
      selfImprovement: {
        enabled: true,
        failureThreshold: 2,
        taskIdArg: 'taskId',
        previousFailuresArg: 'previousFailures',
        procedureTools: ['squad_store_memory'],
        specialistRequestTools: ['request_user_input', 'ask_user']
      }
    },
  };

  const memberPolicies: Record<string, SkillToolPolicy> = {
    reviewer: {
      fileWrites: { allowed: ['docs/**', 'test/**'] },
      permissions: { maxAskUserPerSession: 1 }
    }
  };

  return {
    activeSkillId,
    policy: activeSkillId ? policies[activeSkillId] : undefined,
    memberPolicy: memberPolicies[ctx.agentName.toLowerCase()],
  };
}

export function registerSkillToolPolicyHook(pipeline: HookPipeline): void {
  pipeline.addPreToolHook(createSkillToolPolicyHook(resolveActiveSkill));
}
TS

echo "✅ Installed hook implementation: $HOOK_FILE"
echo "✅ Created registration stub: $REGISTER_FILE"
echo
echo "Next step: import registerSkillToolPolicyHook(...) where your HookPipeline is created."
