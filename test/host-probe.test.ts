import { describe, it, expect } from 'vitest';
import { applyCapabilityProbe } from '../packages/squad-sdk/src/host/probe.js';

describe('applyCapabilityProbe', () => {
  it('maps successful probe results with probe confidence', () => {
    const patch = applyCapabilityProbe({
      success: true,
      states: { nativeHooks: 'supported', parallelSessions: 'unsupported' },
      confidenceScore: 0.93,
      measuredAt: '2026-03-31T00:00:00.000Z',
    });

    expect(patch.capabilityStates.nativeHooks).toBe('supported');
    expect(patch.capabilityStates.parallelSessions).toBe('unsupported');
    expect(patch.confidence.source).toBe('probe');
    expect(patch.confidence.score).toBe(0.93);
  });

  it('fills unresolved states as unknown on probe failure', () => {
    const patch = applyCapabilityProbe({
      success: false,
      states: { mcpTools: 'supported' },
    });

    expect(patch.capabilityStates.nativeHooks).toBe('unknown');
    expect(patch.capabilityStates.streamingEvents).toBe('unknown');
    expect(patch.capabilityStates.mcpTools).toBe('supported');
    expect(patch.confidence.score).toBe(0.2);
  });

  it('normalizes confidence score to 0..1 range', () => {
    const low = applyCapabilityProbe({ success: true, confidenceScore: -2 });
    const high = applyCapabilityProbe({ success: true, confidenceScore: 3 });
    expect(low.confidence.score).toBe(0);
    expect(high.confidence.score).toBe(1);
  });
});
