import { describe, it, expect } from 'vitest';
import {
  createHostAdapter,
  createHostAdapterForLlmApi,
  createVerifiedHostAdapterForLlmApi,
} from '../packages/squad-sdk/src/host/factory.js';
import {
  resolveHostTypeForLlmApi,
  verifyLlmApiProvider,
} from '../packages/squad-sdk/src/host/llm-api.js';

const mockClient = () => ({
  async connect() {},
  async disconnect() {},
  getConnectionState: () => 'connected' as const,
  async createSession() {
    return {
      sessionId: 's1',
      async sendMessage() {},
      async sendAndWait() { return {}; },
      async abort() {},
      async getMessages() { return []; },
      on() {},
      off() {},
      async close() {},
    };
  },
  on() { return () => {}; },
});


describe('createHostAdapter generic-mcp readiness', () => {
  it('reports error when readiness check fails', async () => {
    const adapter = createHostAdapter({
      host: 'generic-mcp',
      readinessCheck: async () => false,
    });

    await expect(adapter.connect()).rejects.toThrow(/readiness/i);
    expect(adapter.getConnectionState()).toBe('error');
  });

  it('reports connected when readiness check succeeds', async () => {
    const adapter = createHostAdapter({
      host: 'generic-mcp',
      readinessCheck: () => true,
    });

    await adapter.connect();
    expect(adapter.getConnectionState()).toBe('connected');
  });
});

describe('createHostAdapter constructor parity for codex/claude/claw', () => {
  const mockClient = () => ({
    async connect() {},
    async disconnect() {},
    getConnectionState: () => 'connected' as const,
    async createSession() {
      return {
        sessionId: 's1',
        async sendMessage() {},
        async sendAndWait() { return {}; },
        async abort() {},
        async getMessages() { return []; },
        on() {},
        off() {},
        async close() {},
      };
    },
    on() { return () => {}; },
  });

  it('creates codex adapter with clientFactory', async () => {
    const adapter = createHostAdapter({
      host: 'codex',
      clientFactory: () => mockClient(),
    });
    await adapter.connect();
    expect(adapter.host).toBe('codex');
  });

  it('creates claude adapter with clientFactory', async () => {
    const adapter = createHostAdapter({
      host: 'claude',
      clientFactory: () => mockClient(),
    });
    await adapter.connect();
    expect(adapter.host).toBe('claude');
  });

  it('creates claw adapter with clientFactory and family', async () => {
    const adapter = createHostAdapter({
      host: 'claw',
      clientFactory: () => mockClient(),
      family: 'zeroclaw',
    });
    await adapter.connect();
    expect(adapter.host).toBe('claw');
  });
});

describe('llm api provider abstraction', () => {
  it('maps llm providers to host adapters', () => {
    expect(resolveHostTypeForLlmApi({ provider: 'anthropic' })).toBe('claude');
    expect(resolveHostTypeForLlmApi({ provider: 'openai' })).toBe('codex');
    expect(resolveHostTypeForLlmApi({ provider: 'copilot' })).toBe('copilot');
    expect(resolveHostTypeForLlmApi({ provider: 'google' })).toBe('generic-mcp');
  });

  it('respects host overrides', () => {
    expect(
      resolveHostTypeForLlmApi({
        provider: 'openai',
        hostOverride: 'generic-mcp',
      }),
    ).toBe('generic-mcp');
  });

  it('creates host adapters from llm api selection', async () => {
    const adapter = createHostAdapterForLlmApi({
      llmApi: { provider: 'anthropic' },
      claude: {
        clientFactory: () => mockClient(),
      },
    });

    await adapter.connect();
    expect(adapter.host).toBe('claude');
  });

  it('fails with clear error when selected provider is not installed', async () => {
    await expect(
      verifyLlmApiProvider(
        { provider: 'openai' },
        {
          verifier: {
            isInstalled: () => false,
            isCallable: () => true,
          },
        },
      ),
    ).rejects.toThrow('Selected LLM provider "openai" is not installed or configured in this runtime.');
  });

  it('fails with clear error when selected provider is installed but not callable', async () => {
    await expect(
      verifyLlmApiProvider(
        { provider: 'anthropic' },
        {
          verifier: {
            isInstalled: () => true,
            isCallable: () => false,
          },
        },
      ),
    ).rejects.toThrow(
      'Selected LLM provider "anthropic" is installed but not callable. Check authentication, endpoint, and model settings.',
    );
  });

  it('creates verified adapter when provider is installed and callable', async () => {
    const adapter = await createVerifiedHostAdapterForLlmApi({
      llmApi: { provider: 'openai' },
      verifier: {
        isInstalled: () => true,
        isCallable: () => true,
      },
      codex: {
        clientFactory: () => mockClient(),
      },
    });

    await adapter.connect();
    expect(adapter.host).toBe('codex');
  });
});
