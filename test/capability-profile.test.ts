import { describe, it, expect } from 'vitest';
import {
  defineHostCapabilities,
  defaultCapabilitiesForHost,
  type AgentHostAdapter,
} from '../packages/squad-sdk/src/host/types.js';
import {
  resolveRuntimeProfile,
  resolveRuntimeProfileWithProbe,
  hasCapability,
} from '../packages/squad-sdk/src/runtime/capability-profile.js';

function createAdapter(capabilities = defineHostCapabilities({})): AgentHostAdapter {
  return {
    host: 'generic-mcp',
    capabilities,
    async connect() {},
    async disconnect() {},
    getConnectionState() {
      return 'disconnected';
    },
    async createSession() {
      throw new Error('not implemented');
    },
    on() {
      return () => {};
    },
  };
}

describe('runtime capability profile', () => {
  it('resolves native profile when required capabilities are present', () => {
    const profile = resolveRuntimeProfile({
      host: 'copilot',
      requiredCapabilities: ['parallelSessions', 'nativeHooks', 'streamingEvents'],
    });

    expect(profile.mode).toBe('native');
    expect(profile.missingCapabilities).toEqual([]);
    expect(profile.fallbackStrategies).toEqual([]);
    expect(profile.capabilityStates.nativeHooks).toBe('supported');
  });

  it('resolves degraded profile when required capabilities are missing', () => {
    const profile = resolveRuntimeProfile({
      host: 'generic-mcp',
      requiredCapabilities: ['parallelSessions', 'nativeHooks'],
    });

    expect(profile.mode).toBe('degraded');
    expect(profile.missingCapabilities).toEqual(['parallelSessions', 'nativeHooks']);
    expect(profile.fallbackStrategies.length).toBe(2);
  });

  it('supports adapter-based profile resolution', () => {
    const adapter = createAdapter(
      defineHostCapabilities({ parallelSessions: true, nativeHooks: false, mcpTools: true }),
    );

    const profile = resolveRuntimeProfile(adapter);

    expect(profile.host).toBe('generic-mcp');
    expect(hasCapability(profile, 'parallelSessions')).toBe(true);
    expect(hasCapability(profile, 'nativeHooks')).toBe(false);
    expect(profile.confidence.source).toBe('defaults');
  });

  it('provides default host capability assumptions', () => {
    const copilot = defaultCapabilitiesForHost('copilot');
    const generic = defaultCapabilitiesForHost('generic-mcp');

    expect(copilot.parallelSessions).toBe(true);
    expect(generic.parallelSessions).toBe(false);
    expect(generic.mcpTools).toBe(true);
  });

  it('fail-closes native hooks when strict mode is enabled without probe validation', () => {
    const profile = resolveRuntimeProfile({
      host: 'copilot',
      requiredCapabilities: ['nativeHooks'],
      requireValidatedNativeHooks: true,
    });

    expect(profile.capabilityStates.nativeHooks).toBe('unsupported');
    expect(profile.mode).toBe('degraded');
  });

  it('allows native hooks in strict mode when probe validation is present', () => {
    const profile = resolveRuntimeProfile({
      host: 'copilot',
      requiredCapabilities: ['nativeHooks'],
      requireValidatedNativeHooks: true,
      capabilityStates: { nativeHooks: 'supported' },
      confidence: { source: 'probe', score: 0.95 },
    });

    expect(profile.capabilityStates.nativeHooks).toBe('supported');
    expect(profile.mode).toBe('native');
  });

  it('supports strict policy options when resolving from adapter input', () => {
    const adapter = createAdapter(
      defineHostCapabilities({ parallelSessions: true, nativeHooks: true }),
    );

    const strictProfile = resolveRuntimeProfile(adapter, {
      requiredCapabilities: ['nativeHooks'],
      requireValidatedNativeHooks: true,
    });
    expect(strictProfile.mode).toBe('degraded');

    const validatedProfile = resolveRuntimeProfile(adapter, {
      requiredCapabilities: ['nativeHooks'],
      requireValidatedNativeHooks: true,
      capabilityStates: { nativeHooks: 'supported' },
      confidence: { source: 'probe', score: 0.9 },
    });
    expect(validatedProfile.mode).toBe('native');
  });

  it('supports one-step probe-aware profile resolution', () => {
    const profile = resolveRuntimeProfileWithProbe(
      { host: 'copilot', requiredCapabilities: ['nativeHooks'] },
      {
        success: true,
        states: { nativeHooks: 'supported' },
        confidenceScore: 0.9,
      },
    );
    expect(profile.mode).toBe('native');
    expect(profile.confidence.source).toBe('probe');
  });

  it('normalizes confidence score bounds in runtime profile output', () => {
    const low = resolveRuntimeProfile({
      host: 'copilot',
      confidence: { source: 'override', score: -10 },
    });
    const high = resolveRuntimeProfile({
      host: 'copilot',
      confidence: { source: 'override', score: 10 },
    });

    expect(low.confidence.score).toBe(0);
    expect(high.confidence.score).toBe(1);
  });
});
