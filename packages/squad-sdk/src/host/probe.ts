/**
 * Host capability probing helpers.
 *
 * @module host/probe
 */

import type { HostCapabilityStates, HostCapabilityState } from './types.js';

export interface HostCapabilityProbeResult {
  success: boolean;
  states?: Partial<HostCapabilityStates>;
  measuredAt?: string;
  confidenceScore?: number;
}

export interface CapabilityProbeProfilePatch {
  capabilityStates: Partial<HostCapabilityStates>;
  confidence: {
    source: 'probe';
    score: number;
    measuredAt?: string;
  };
}

/**
 * Build a runtime profile patch from probe output.
 *
 * - successful probes merge known states and keep unknowns untouched
 * - failed probes mark unresolved states as `unknown`
 */
export function applyCapabilityProbe(
  probe: HostCapabilityProbeResult,
  fallbackState: HostCapabilityState = 'unknown',
): CapabilityProbeProfilePatch {
  const baseStates: Partial<HostCapabilityStates> = probe.success
    ? (probe.states ?? {})
    : fillUnknownStates(probe.states ?? {}, fallbackState);

  return {
    capabilityStates: baseStates,
    confidence: {
      source: 'probe',
      score: normalizeConfidenceScore(probe.confidenceScore ?? (probe.success ? 0.8 : 0.2)),
      measuredAt: probe.measuredAt,
    },
  };
}

function fillUnknownStates(
  input: Partial<HostCapabilityStates>,
  fallbackState: HostCapabilityState,
): Partial<HostCapabilityStates> {
  const keys: Array<keyof HostCapabilityStates> = [
    'parallelSessions',
    'toolSchemas',
    'nativeHooks',
    'streamingEvents',
    'sessionResume',
    'modelHints',
    'mcpTools',
  ];

  const out: Partial<HostCapabilityStates> = {};
  for (const key of keys) {
    out[key] = input[key] ?? fallbackState;
  }
  return out;
}

function normalizeConfidenceScore(score: number): number {
  if (Number.isNaN(score)) return 0;
  if (score < 0) return 0;
  if (score > 1) return 1;
  return score;
}
