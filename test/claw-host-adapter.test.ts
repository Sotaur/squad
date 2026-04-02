import { describe, it, expect, vi } from 'vitest';
import {
  ClawHostAdapter,
  createClawHostAdapter,
  type ClawHostClientLike,
} from '../packages/squad-sdk/src/host/claw-host-adapter.js';

function createMockClient(): ClawHostClientLike {
  return {
    connect: vi.fn(async () => {}),
    disconnect: vi.fn(async () => {}),
    getConnectionState: vi.fn(() => 'connected'),
    createSession: vi.fn(async () => ({
      sessionId: 'claw-1',
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

describe('ClawHostAdapter', () => {
  it('delegates lifecycle calls', async () => {
    const client = createMockClient();
    const adapter = new ClawHostAdapter({ client, family: 'zeroclaw' });

    await adapter.connect();
    await adapter.disconnect();

    expect(client.connect).toHaveBeenCalledTimes(1);
    expect(client.disconnect).toHaveBeenCalledTimes(1);
    expect(adapter.getConnectionState()).toBe('connected');
  });

  it('delegates session creation', async () => {
    const client = createMockClient();
    const adapter = new ClawHostAdapter({ client, family: 'openclaw' });

    const session = await adapter.createSession({ model: 'claude-sonnet-4.5' });
    expect(client.createSession).toHaveBeenCalledTimes(1);
    expect(session.sessionId).toBe('claw-1');
  });


  it('uses conservative defaults until capability probing proves support', () => {
    const client = createMockClient();
    const adapter = new ClawHostAdapter({ client, family: 'zeroclaw' });

    expect(adapter.capabilities.parallelSessions).toBe(false);
    expect(adapter.capabilities.nativeHooks).toBe(false);
    expect(adapter.capabilities.streamingEvents).toBe(false);
    expect(adapter.capabilities.modelHints).toBe(true);
  });

  it('supports capability overrides', () => {
    const client = createMockClient();
    const adapter = new ClawHostAdapter({
      client,
      capabilities: { nativeHooks: false },
      family: 'zeroclaw',
    });

    expect(adapter.capabilities.nativeHooks).toBe(false);
  });

  it('supports clientFactory constructor parity', async () => {
    const client = createMockClient();
    const adapter = createClawHostAdapter({ clientFactory: () => client, family: 'zeroclaw' });
    await adapter.connect();
    expect(client.connect).toHaveBeenCalledTimes(1);
  });

  it('throws clear error when no client or factory is provided', () => {
    expect(() => new ClawHostAdapter({})).toThrow(/client or clientFactory/i);
  });
});
