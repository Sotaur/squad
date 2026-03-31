import { describe, it, expect, vi } from 'vitest';
import { CopilotHostAdapter, type CopilotHostClientLike } from '../packages/squad-sdk/src/host/copilot-host-adapter.js';

function createMockClient(): CopilotHostClientLike {
  return {
    connect: vi.fn(async () => {}),
    disconnect: vi.fn(async () => {}),
    getConnectionState: vi.fn(() => 'connected'),
    createSession: vi.fn(async () => ({
      sessionId: 's1',
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

describe('CopilotHostAdapter', () => {
  it('delegates connection lifecycle calls', async () => {
    const client = createMockClient();
    const adapter = new CopilotHostAdapter({ client });

    await adapter.connect();
    await adapter.disconnect();

    expect(client.connect).toHaveBeenCalledTimes(1);
    expect(client.disconnect).toHaveBeenCalledTimes(1);
    expect(adapter.getConnectionState()).toBe('connected');
  });

  it('delegates session creation', async () => {
    const client = createMockClient();
    const adapter = new CopilotHostAdapter({ client });

    const session = await adapter.createSession({ model: 'claude-sonnet-4.5' });

    expect(client.createSession).toHaveBeenCalledTimes(1);
    expect(session.sessionId).toBe('s1');
  });

  it('supports typed and untyped event subscriptions', () => {
    const client = createMockClient();
    const adapter = new CopilotHostAdapter({ client });

    const unsubA = adapter.on('connected', () => {});
    const unsubB = adapter.on(() => {});

    expect(typeof unsubA).toBe('function');
    expect(typeof unsubB).toBe('function');
    expect(client.on).toHaveBeenCalledTimes(2);
  });
});
