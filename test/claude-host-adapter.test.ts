import { describe, it, expect, vi } from 'vitest';
import {
  ClaudeHostAdapter,
  createClaudeHostAdapter,
  type ClaudeHostClientLike,
} from '../packages/squad-sdk/src/host/claude-host-adapter.js';

function createMockClient(): ClaudeHostClientLike {
  return {
    connect: vi.fn(async () => {}),
    disconnect: vi.fn(async () => {}),
    getConnectionState: vi.fn(() => 'connected'),
    createSession: vi.fn(async () => ({
      sessionId: 'claude-1',
      sendMessage: vi.fn(async () => {}),
      sendAndWait: vi.fn(async () => ({})),
      abort: vi.fn(async () => {}),
      getMessages: vi.fn(async () => []),
      on: vi.fn(() => {}),
      off: vi.fn(() => {}),
      close: vi.fn(async () => {}),
    })),
    on: vi.fn(() => () => {}),
  };
}

describe('ClaudeHostAdapter', () => {
  it('delegates lifecycle calls', async () => {
    const client = createMockClient();
    const adapter = new ClaudeHostAdapter({ client });

    await adapter.connect();
    await adapter.disconnect();

    expect(client.connect).toHaveBeenCalledTimes(1);
    expect(client.disconnect).toHaveBeenCalledTimes(1);
    expect(adapter.getConnectionState()).toBe('connected');
  });

  it('delegates session creation', async () => {
    const client = createMockClient();
    const adapter = new ClaudeHostAdapter({ client });

    const session = await adapter.createSession({ model: 'claude-sonnet-4.5' });
    expect(client.createSession).toHaveBeenCalledTimes(1);
    expect(session.sessionId).toBe('claude-1');
  });

  it('supports capability overrides', () => {
    const client = createMockClient();
    const adapter = new ClaudeHostAdapter({
      client,
      capabilities: { sessionResume: false },
    });

    expect(adapter.capabilities.sessionResume).toBe(false);
  });

  it('supports clientFactory constructor parity', async () => {
    const client = createMockClient();
    const adapter = createClaudeHostAdapter({ clientFactory: () => client });
    await adapter.connect();
    expect(client.connect).toHaveBeenCalledTimes(1);
  });

  it('throws clear error when no client or factory is provided', () => {
    expect(() => new ClaudeHostAdapter({})).toThrow(/client or clientFactory/i);
  });
});
