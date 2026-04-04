import type { PreToolUseContext, PreToolUseHook, PreToolUseResult } from '@bradygaster/squad-sdk/hooks';

export interface PathPolicy {
  allowed?: readonly string[];
  blocked?: readonly string[];
}

export interface ShellPolicy {
  blockedPatterns?: readonly string[];
  allowedPrefixes?: readonly string[];
}

export interface NetworkPolicy {
  allowedDomains?: readonly string[];
  blockedDomains?: readonly string[];
}

export interface PermissionPolicy {
  allowAskUser?: boolean;
  maxAskUserPerSession?: number;
  allowEscalationTools?: boolean;
}

export interface SkillToolPolicy {
  /**
   * allowlist: deny unknown tools
   * denylist: allow unknown tools unless explicitly blocked
   */
  mode?: 'allowlist' | 'denylist';
  allowedTools?: readonly string[];
  blockedTools?: readonly string[];
  preferredOrder?: readonly string[];
  overrideEnabled?: boolean;

  fileWrites?: PathPolicy;
  shell?: ShellPolicy;
  network?: NetworkPolicy;
  permissions?: PermissionPolicy;

  selfImprovement?: {
    enabled?: boolean;
    failureThreshold?: number; // default: 2 (trigger after >2 failures)
    taskIdArg?: string; // default: "taskId"
    previousFailuresArg?: string; // default: "previousFailures"
    procedureTools?: readonly string[]; // default: ["squad_store_memory"]
    specialistRequestTools?: readonly string[]; // default: ["request_user_input", "ask_user"]
  };
}

export interface EnforcementContext {
  activeSkillId?: string;
  policy?: SkillToolPolicy;
  /** agent/member-specific policy can further restrict effective policy */
  memberPolicy?: SkillToolPolicy;
}

export type ResolveEnforcementContext = (ctx: PreToolUseContext) => EnforcementContext;

const WRITE_TOOLS = new Set(['edit', 'create', 'write_file', 'create_file', 'apply_patch']);
const SHELL_TOOLS = new Set(['bash', 'shell', 'exec', 'powershell']);
const NETWORK_TOOLS = new Set(['fetch', 'web_search', 'http', 'request', 'curl']);
const PERMISSION_TOOLS = new Set(['ask_user', 'request_user_input', 'request_permission']);
const DEFAULT_BLOCKED_SHELL_PATTERNS = ['rm -rf', 'git push --force', 'git reset --hard'];

/**
 * Comprehensive policy hook that can enforce:
 * - tool allow/deny
 * - ordered tool workflow
 * - write-path restrictions
 * - shell command controls
 * - network domain restrictions
 * - permission request budgets
 *
 * Designed for per-skill and per-member governance.
 */
export function createSkillToolPolicyHook(resolveContext: ResolveEnforcementContext): PreToolUseHook {
  const preferredProgress = new Map<string, number>();
  const askUserCount = new Map<string, number>();
  const failureCountByTask = new Map<string, number>();

  return (ctx: PreToolUseContext): PreToolUseResult => {
    const enforcement = resolveContext(ctx);
    if (!enforcement.activeSkillId) return { action: 'allow' };

    const policy = mergePolicy(enforcement.policy, enforcement.memberPolicy);
    if (!policy) return { action: 'allow' };

    const base = `${ctx.agentName}/${enforcement.activeSkillId}`;

    // 0) Self-improvement gate: if repeated failures > threshold, require learning action.
    const selfImprovementBlock = enforceSelfImprovement(ctx, enforcement.activeSkillId, policy, failureCountByTask);
    if (selfImprovementBlock) return selfImprovementBlock;

    // 1) Explicit tool deny
    if (matchesAny(ctx.toolName, policy.blockedTools)) {
      return block(`Tool '${ctx.toolName}' blocked for ${base}.`);
    }

    // 2) Allowlist / denylist mode
    const mode = policy.mode ?? (policy.allowedTools?.length ? 'allowlist' : 'denylist');
    if (mode === 'allowlist' && !matchesAny(ctx.toolName, policy.allowedTools)) {
      if (!policy.overrideEnabled) {
        return block(`Tool '${ctx.toolName}' not allowlisted for ${base}.`);
      }
    }

    // 3) Tool ordering workflow
    if (!policy.overrideEnabled) {
      const orderResult = enforcePreferredOrder(ctx, enforcement.activeSkillId, policy.preferredOrder, preferredProgress);
      if (orderResult) return orderResult;
    }

    // 4) File write restrictions
    if (WRITE_TOOLS.has(ctx.toolName)) {
      const path = readPathArg(ctx.arguments);
      if (path) {
        if (matchesAny(path, policy.fileWrites?.blocked)) {
          return block(`Write blocked for path '${path}' by policy (${base}).`);
        }
        if (policy.fileWrites?.allowed?.length && !matchesAny(path, policy.fileWrites.allowed)) {
          return block(`Write path '${path}' not allowlisted for ${base}.`);
        }
      }
    }

    // 5) Shell command restrictions
    if (SHELL_TOOLS.has(ctx.toolName)) {
      const command = readCommandArg(ctx.arguments);
      if (command) {
        const blocked = policy.shell?.blockedPatterns ?? DEFAULT_BLOCKED_SHELL_PATTERNS;
        if (blocked.some((pattern) => command.toLowerCase().includes(pattern.toLowerCase()))) {
          return block(`Shell command blocked by pattern for ${base}.`);
        }

        if (policy.shell?.allowedPrefixes?.length) {
          const trimmed = command.trim();
          const allowed = policy.shell.allowedPrefixes.some((prefix) => trimmed.startsWith(prefix));
          if (!allowed) return block(`Shell command prefix not permitted for ${base}.`);
        }
      }
    }

    // 6) Network restrictions
    if (NETWORK_TOOLS.has(ctx.toolName)) {
      const url = readUrlArg(ctx.arguments);
      if (url) {
        const domain = parseDomain(url);
        if (domain) {
          if (policy.network?.blockedDomains?.some((d) => domainMatches(domain, d))) {
            return block(`Network domain '${domain}' is blocked for ${base}.`);
          }
          if (policy.network?.allowedDomains?.length) {
            const allowed = policy.network.allowedDomains.some((d) => domainMatches(domain, d));
            if (!allowed) return block(`Network domain '${domain}' is not allowlisted for ${base}.`);
          }
        }
      }
    }

    // 7) Permission request budget / gating
    if (PERMISSION_TOOLS.has(ctx.toolName)) {
      const allowAskUser = policy.permissions?.allowAskUser ?? true;
      if (!allowAskUser) {
        return block(`Permission tool '${ctx.toolName}' disabled for ${base}.`);
      }

      const max = policy.permissions?.maxAskUserPerSession;
      if (typeof max === 'number' && max >= 0) {
        const key = `${ctx.sessionId}:${ctx.agentName}`;
        const current = askUserCount.get(key) ?? 0;
        if (current >= max) {
          return block(`Permission request budget exceeded (${max}) for ${ctx.agentName}.`);
        }
        askUserCount.set(key, current + 1);
      }
    }

    return { action: 'allow' };
  };
}

function enforceSelfImprovement(
  ctx: PreToolUseContext,
  activeSkillId: string,
  policy: SkillToolPolicy,
  failureCountByTask: Map<string, number>,
): PreToolUseResult | null {
  const si = policy.selfImprovement;
  if (!si?.enabled) return null;

  const taskIdArg = si.taskIdArg ?? 'taskId';
  const previousFailuresArg = si.previousFailuresArg ?? 'previousFailures';
  const threshold = si.failureThreshold ?? 2;

  const rawTask = ctx.arguments[taskIdArg];
  const taskId = typeof rawTask === 'string' && rawTask.trim() ? rawTask.trim() : `${activeSkillId}:unknown`;
  const key = `${ctx.sessionId}:${ctx.agentName}:${taskId}`;

  const reportedFailures = Number(ctx.arguments[previousFailuresArg] ?? 0);
  const observedFailures = Number.isFinite(reportedFailures) ? Math.max(0, reportedFailures) : 0;
  const currentFailures = Math.max(failureCountByTask.get(key) ?? 0, observedFailures);
  failureCountByTask.set(key, currentFailures);

  if (currentFailures <= threshold) return null;

  const procedureTools = si.procedureTools ?? ['squad_store_memory'];
  const specialistTools = si.specialistRequestTools ?? ['request_user_input', 'ask_user'];
  const remediationTools = [...procedureTools, ...specialistTools];

  if (!matchesAny(ctx.toolName, remediationTools)) {
    return block(
      `Task '${taskId}' exceeded failure threshold (${threshold}). ` +
      `Before continuing, either write a detailed procedure using [${procedureTools.join(', ')}] ` +
      `or request a specialized squad member using [${specialistTools.join(', ')}].`,
    );
  }

  // Reset once remediation action is executed.
  failureCountByTask.set(key, 0);
  return null;
}

function enforcePreferredOrder(
  ctx: PreToolUseContext,
  activeSkillId: string,
  preferredOrder: readonly string[] | undefined,
  progressMap: Map<string, number>,
): PreToolUseResult | null {
  if (!preferredOrder?.length) return null;

  const key = `${ctx.sessionId}:${activeSkillId}:${ctx.agentName}`;
  const current = progressMap.get(key) ?? 0;
  const expected = preferredOrder[current];

  if (!expected) return null;
  if (!matchesAny(ctx.toolName, [expected])) {
    return block(`Skill '${activeSkillId}' requires '${expected}' before '${ctx.toolName}'.`);
  }

  progressMap.set(key, current + 1);
  return null;
}

function mergePolicy(a?: SkillToolPolicy, b?: SkillToolPolicy): SkillToolPolicy | undefined {
  if (!a && !b) return undefined;
  return {
    mode: b?.mode ?? a?.mode,
    allowedTools: mergeArrays(a?.allowedTools, b?.allowedTools),
    blockedTools: mergeArrays(a?.blockedTools, b?.blockedTools),
    preferredOrder: b?.preferredOrder ?? a?.preferredOrder,
    overrideEnabled: (a?.overrideEnabled ?? false) || (b?.overrideEnabled ?? false),
    fileWrites: {
      allowed: mergeArrays(a?.fileWrites?.allowed, b?.fileWrites?.allowed),
      blocked: mergeArrays(a?.fileWrites?.blocked, b?.fileWrites?.blocked),
    },
    shell: {
      blockedPatterns: mergeArrays(a?.shell?.blockedPatterns, b?.shell?.blockedPatterns),
      allowedPrefixes: mergeArrays(a?.shell?.allowedPrefixes, b?.shell?.allowedPrefixes),
    },
    network: {
      allowedDomains: mergeArrays(a?.network?.allowedDomains, b?.network?.allowedDomains),
      blockedDomains: mergeArrays(a?.network?.blockedDomains, b?.network?.blockedDomains),
    },
    permissions: {
      allowAskUser: b?.permissions?.allowAskUser ?? a?.permissions?.allowAskUser,
      maxAskUserPerSession: b?.permissions?.maxAskUserPerSession ?? a?.permissions?.maxAskUserPerSession,
      allowEscalationTools: b?.permissions?.allowEscalationTools ?? a?.permissions?.allowEscalationTools,
    },
    selfImprovement: {
      enabled: b?.selfImprovement?.enabled ?? a?.selfImprovement?.enabled,
      failureThreshold: b?.selfImprovement?.failureThreshold ?? a?.selfImprovement?.failureThreshold,
      taskIdArg: b?.selfImprovement?.taskIdArg ?? a?.selfImprovement?.taskIdArg,
      previousFailuresArg: b?.selfImprovement?.previousFailuresArg ?? a?.selfImprovement?.previousFailuresArg,
      procedureTools: mergeArrays(a?.selfImprovement?.procedureTools, b?.selfImprovement?.procedureTools),
      specialistRequestTools: mergeArrays(a?.selfImprovement?.specialistRequestTools, b?.selfImprovement?.specialistRequestTools),
    },
  };
}

function mergeArrays<T>(a?: readonly T[], b?: readonly T[]): readonly T[] | undefined {
  if (!a && !b) return undefined;
  return [...new Set([...(a ?? []), ...(b ?? [])])];
}

function matchesAny(value: string, patterns?: readonly string[]): boolean {
  if (!patterns?.length) return false;
  return patterns.some((p) => wildcardMatch(value, p));
}

function wildcardMatch(value: string, pattern: string): boolean {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`, 'i').test(value);
}

function readPathArg(args: Record<string, unknown>): string | undefined {
  const candidate = args.path ?? args.file_path ?? args.target;
  return typeof candidate === 'string' ? candidate : undefined;
}

function readCommandArg(args: Record<string, unknown>): string | undefined {
  const candidate = args.command ?? args.cmd;
  return typeof candidate === 'string' ? candidate : undefined;
}

function readUrlArg(args: Record<string, unknown>): string | undefined {
  const candidate = args.url ?? args.uri ?? args.endpoint;
  return typeof candidate === 'string' ? candidate : undefined;
}

function parseDomain(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function domainMatches(actual: string, rule: string): boolean {
  if (rule.startsWith('*.')) {
    const suffix = rule.slice(1).toLowerCase();
    return actual.endsWith(suffix);
  }
  return actual === rule.toLowerCase();
}

function block(reason: string): PreToolUseResult {
  return { action: 'block', reason };
}

// Example wiring:
//
// import { HookPipeline } from '@bradygaster/squad-sdk/hooks';
//
// const hook = createSkillToolPolicyHook((ctx) => {
//   const activeSkillId = typeof ctx.arguments.activeSkillId === 'string'
//     ? ctx.arguments.activeSkillId
//     : undefined;
//
//   // Skill policy (what this skill permits)
//   const skillPolicies: Record<string, SkillToolPolicy> = {
//     'backend-engineer': {
//       mode: 'allowlist',
//       allowedTools: ['read_file', 'edit_file', 'exec', 'request_user_input'],
//       blockedTools: ['git_push_force', 'exec:rm*'],
//       preferredOrder: ['read_file', 'exec', 'edit_file'],
//       fileWrites: { allowed: ['src/**', 'test/**'], blocked: ['**/.env*'] },
//       shell: { blockedPatterns: ['rm -rf', 'git push --force'], allowedPrefixes: ['npm ', 'node ', 'pnpm ', 'git status'] },
//       network: { allowedDomains: ['api.github.com', '*.internal.example.com'] },
//       permissions: { allowAskUser: true, maxAskUserPerSession: 3 },
//       selfImprovement: {
//         enabled: true,
//         failureThreshold: 2,
//         taskIdArg: 'taskId',
//         previousFailuresArg: 'previousFailures',
//         procedureTools: ['squad_store_memory'],
//         specialistRequestTools: ['request_user_input', 'ask_user'],
//       },
//     },
//   };
//
//   // Member policy (what this member is additionally restricted to)
//   const memberPolicies: Record<string, SkillToolPolicy> = {
//     tester: {
//       fileWrites: { allowed: ['test/**', 'fixtures/**'] },
//       permissions: { maxAskUserPerSession: 2 },
//     },
//   };
//
//   return {
//     activeSkillId,
//     policy: activeSkillId ? skillPolicies[activeSkillId] : undefined,
//     memberPolicy: memberPolicies[ctx.agentName.toLowerCase()],
//   };
// });
//
// const pipeline = new HookPipeline();
// pipeline.addPreToolHook(hook);
