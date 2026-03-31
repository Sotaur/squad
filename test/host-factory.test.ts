import { describe, it, expect } from 'vitest';
import { createHostAdapter } from '../packages/squad-sdk/src/host/factory.js';

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

describe('createHostAdapter constructor parity for codex/claude', () => {
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
});
