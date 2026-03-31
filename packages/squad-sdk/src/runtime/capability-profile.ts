/**
 * Capability negotiation for host runtime portability.
 *
 * @module runtime/capability-profile
 */

import {
  defaultCapabilitiesForHost,
  type AgentHostAdapter,
  type AgentHostType,
  type HostCapabilities,
  type HostCapabilityKey,
  type HostCapabilityState,
  type HostCapabilityStates,
  type ResolvedRuntimeProfile,
  toCapabilityStates,
} from '../host/types.js';
import type { HostCapabilityProbeResult } from '../host/probe.js';
import { applyCapabilityProbe } from '../host/probe.js';
import { recordFallbackStrategy, recordRuntimeProfileMode } from './otel-metrics.js';

export interface ResolveRuntimeProfileOptions {
  host: AgentHostType;
  capabilities?: Partial<HostCapabilities>;
  capabilityStates?: Partial<HostCapabilityStates>;
  requiredCapabilities?: HostCapabilityKey[];
  /**
   * Fail-closed policy:
   * when true, `nativeHooks` must be explicitly validated as supported,
   * otherwise it is treated as unavailable.
   */
  requireValidatedNativeHooks?: boolean;
  confidence?: {
    source?: 'defaults' | 'override' | 'probe';
    score?: number;
    measuredAt?: string;
  };
}

export type ResolveRuntimeProfilePolicy = Omit<
  ResolveRuntimeProfileOptions,
  'host' | 'capabilities' | 'capabilityStates'
> & {
  capabilities?: Partial<HostCapabilities>;
  capabilityStates?: Partial<HostCapabilityStates>;
};

const FALLBACK_BY_CAPABILITY: Record<HostCapabilityKey, string> = {
  parallelSessions: 'Serialize fan-out work through a coordinator queue.',
  toolSchemas: 'Use instruction-wrapped pseudo-tools with strict argument examples.',
  nativeHooks: 'Enforce hook policies in coordinator middleware.',
  streamingEvents: 'Switch to buffered turn-complete response mode.',
  sessionResume: 'Persist checkpoints in Squad state and recreate sessions eagerly.',
  modelHints: 'Use static model tier defaults from squad config.',
  mcpTools: 'Fallback to local tools only; disable external integration routing.',
};

/**
 * Resolve runtime profile from a host adapter.
 */
export function resolveRuntimeProfile(
  adapterOrOptions: AgentHostAdapter | ResolveRuntimeProfileOptions,
  policy: ResolveRuntimeProfilePolicy = {},
): ResolvedRuntimeProfile {
  const isAdapterInput =
    'createSession' in adapterOrOptions &&
    typeof adapterOrOptions.createSession === 'function';
  const host = adapterOrOptions.host;
  const base = defaultCapabilitiesForHost(host);
  const mergedOptions: ResolveRuntimeProfileOptions =
    isAdapterInput
      ? {
          host,
          capabilities: {
            ...adapterOrOptions.capabilities,
            ...(policy.capabilities ?? {}),
          },
          capabilityStates: policy.capabilityStates,
          requiredCapabilities: policy.requiredCapabilities,
          requireValidatedNativeHooks: policy.requireValidatedNativeHooks,
          confidence: policy.confidence,
        }
      : adapterOrOptions;

  const capabilitiesHint: HostCapabilities = {
    ...base,
    ...('capabilities' in mergedOptions ? mergedOptions.capabilities : {}),
  };
  const capabilityStates = resolveCapabilityStates(mergedOptions, capabilitiesHint);

  const capabilities: HostCapabilities = {
    parallelSessions: capabilityStates.parallelSessions === 'supported',
    toolSchemas: capabilityStates.toolSchemas === 'supported',
    nativeHooks: capabilityStates.nativeHooks === 'supported',
    streamingEvents: capabilityStates.streamingEvents === 'supported',
    sessionResume: capabilityStates.sessionResume === 'supported',
    modelHints: capabilityStates.modelHints === 'supported',
    mcpTools: capabilityStates.mcpTools === 'supported',
  };

  const required: HostCapabilityKey[] =
    'requiredCapabilities' in mergedOptions
      ? (mergedOptions.requiredCapabilities ?? [])
      : [];

  const missingCapabilities = required.filter((capability) => !capabilities[capability]);

  const fallbackStrategies = missingCapabilities.map((capability) => FALLBACK_BY_CAPABILITY[capability]);
  const confidence = mergedOptions.confidence
    ? {
        source: mergedOptions.confidence?.source ?? 'override',
        score: normalizeConfidenceScore(mergedOptions.confidence?.score ?? 0.6),
        measuredAt: mergedOptions.confidence?.measuredAt,
      }
    : {
        source: 'defaults' as const,
        score: 0.5,
        measuredAt: undefined,
      };

  const profile: ResolvedRuntimeProfile = {
    host,
    mode: missingCapabilities.length > 0 ? 'degraded' : 'native',
    capabilities,
    capabilityStates,
    confidence,
    missingCapabilities,
    fallbackStrategies,
  };
  recordRuntimeProfileMode(profile.mode, host);
  for (const capability of missingCapabilities) {
    recordFallbackStrategy(host, capability);
  }

  return profile;
}

/** Feature gate helper for runtime codepaths. */
export function hasCapability(
  profile: ResolvedRuntimeProfile,
  capability: HostCapabilityKey,
): boolean {
  return Boolean(profile.capabilities[capability]);
}

function resolveCapabilityStates(
  adapterOrOptions: ResolveRuntimeProfileOptions,
  capabilitiesHint: HostCapabilities,
): HostCapabilityStates {
  const inputStates = adapterOrOptions.capabilityStates ?? {};
  const merged: HostCapabilityStates = {
    ...toCapabilityStates(capabilitiesHint),
    ...inputStates,
  };

  const strictNativeHooks = adapterOrOptions.requireValidatedNativeHooks === true;
  if (strictNativeHooks) {
    const validatedByProbe = adapterOrOptions.confidence?.source === 'probe';
    if (!validatedByProbe) {
      merged.nativeHooks = 'unsupported';
    }
  }

  return merged;
}

export function capabilityStateToBoolean(state: HostCapabilityState): boolean {
  return state === 'supported';
}

export function resolveRuntimeProfileWithProbe(
  adapterOrOptions: AgentHostAdapter | ResolveRuntimeProfileOptions,
  probe: HostCapabilityProbeResult,
  policy: ResolveRuntimeProfilePolicy = {},
): ResolvedRuntimeProfile {
  const probePatch = applyCapabilityProbe(probe);
  const mergedPolicy = {
    ...policy,
    capabilityStates: {
      ...(policy.capabilityStates ?? {}),
      ...(probePatch.capabilityStates ?? {}),
    },
    confidence: probePatch.confidence,
  };

  const isAdapterInput =
    'createSession' in adapterOrOptions &&
    typeof adapterOrOptions.createSession === 'function';
  if (isAdapterInput) {
    return resolveRuntimeProfile(adapterOrOptions, mergedPolicy);
  }

  return resolveRuntimeProfile({
    ...adapterOrOptions,
    ...mergedPolicy,
  });
}

function normalizeConfidenceScore(score: number): number {
  if (Number.isNaN(score)) return 0;
  if (score < 0) return 0;
  if (score > 1) return 1;
  return score;
}
