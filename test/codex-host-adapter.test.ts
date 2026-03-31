import { describe, it, expect, vi } from 'vitest';
import {
  CodexHostAdapter,
  createCodexHostAdapter,
  type CodexHostClientLike,
} from '../packages/squad-sdk/src/host/codex-host-adapter.js';

function createMockClient(): CodexHostClientLike {
  return {
    connect: vi.fn(async () => {}),
    disconnect: vi.fn(async () => {}),
    getConnectionState: vi.fn(() => 'connected'),
    createSession: vi.fn(async () => ({
      sessionId: 'codex-1',
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

describe('CodexHostAdapter', () => {
  it('delegates lifecycle calls', async () => {
    const client = createMockClient();
    const adapter = new CodexHostAdapter({ client });

    await adapter.connect();
    await adapter.disconnect();

    expect(client.connect).toHaveBeenCalledTimes(1);
    expect(client.disconnect).toHaveBeenCalledTimes(1);
    expect(adapter.getConnectionState()).toBe('connected');
  });

  it('delegates session creation', async () => {
    const client = createMockClient();
    const adapter = new CodexHostAdapter({ client });

    const session = await adapter.createSession({ model: 'gpt-5.1-codex' });
    expect(client.createSession).toHaveBeenCalledTimes(1);
    expect(session.sessionId).toBe('codex-1');
  });

  it('supports capability overrides', () => {
    const client = createMockClient();
    const adapter = new CodexHostAdapter({
      client,
      capabilities: { nativeHooks: false },
    });

    expect(adapter.capabilities.nativeHooks).toBe(false);
  });

  it('supports clientFactory constructor parity', async () => {
    const client = createMockClient();
    const adapter = createCodexHostAdapter({ clientFactory: () => client });
    await adapter.connect();
    expect(client.connect).toHaveBeenCalledTimes(1);
  });

  it('throws clear error when no client or factory is provided', () => {
    expect(() => new CodexHostAdapter({})).toThrow(/client or clientFactory/i);
  });
});
