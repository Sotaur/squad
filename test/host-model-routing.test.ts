import { describe, it, expect, vi } from 'vitest';
import { CopilotHostAdapter } from '../packages/squad-sdk/src/host/copilot-host-adapter.js';
import { CodexHostAdapter } from '../packages/squad-sdk/src/host/codex-host-adapter.js';
import { ClaudeHostAdapter } from '../packages/squad-sdk/src/host/claude-host-adapter.js';
import { ClawHostAdapter } from '../packages/squad-sdk/src/host/claw-host-adapter.js';
import { createHostAdapter } from '../packages/squad-sdk/src/host/factory.js';

function createTrackedClient() {
  const createSession = vi.fn(async (config?: { model?: string }) => ({
    sessionId: `s-${config?.model ?? 'default'}`,
    async sendMessage() {},
    async sendAndWait() { return {}; },
    async abort() {},
    async getMessages() { return []; },
    on() {},
    off() {},
    async close() {},
  }));

  return {
    client: {
      connect: vi.fn(async () => {}),
      disconnect: vi.fn(async () => {}),
      getConnectionState: vi.fn(() => 'connected' as const),
      createSession,
      on: vi.fn(() => () => {}),
    },
    createSession,
  };
}

describe('host adapters model routing by squad member', () => {
  const squadMembers = [
    { agentName: 'fenster', model: 'gpt-5.1-codex' },
    { agentName: 'verbal', model: 'claude-sonnet-4.5' },
    { agentName: 'hockney', model: 'gemini-2.5-pro' },
  ] as const;

  it('copilot adapter forwards per-member model requests', async () => {
    const tracked = createTrackedClient();
    const adapter = new CopilotHostAdapter({ client: tracked.client });

    for (const member of squadMembers) {
      await adapter.createSession({ model: member.model, clientName: `member-${member.agentName}` });
    }

    expect(tracked.createSession).toHaveBeenCalledTimes(3);
    expect(tracked.createSession.mock.calls.map(([cfg]) => cfg.model)).toEqual(
      squadMembers.map(m => m.model),
    );
  });

  it('codex adapter forwards per-member model requests', async () => {
    const tracked = createTrackedClient();
    const adapter = new CodexHostAdapter({ client: tracked.client });

    for (const member of squadMembers) {
      await adapter.createSession({ model: member.model, clientName: `member-${member.agentName}` });
    }

    expect(tracked.createSession.mock.calls.map(([cfg]) => cfg.model)).toEqual(
      squadMembers.map(m => m.model),
    );
  });

  it('claude adapter forwards per-member model requests', async () => {
    const tracked = createTrackedClient();
    const adapter = new ClaudeHostAdapter({ client: tracked.client });

    for (const member of squadMembers) {
      await adapter.createSession({ model: member.model, clientName: `member-${member.agentName}` });
    }

    expect(tracked.createSession.mock.calls.map(([cfg]) => cfg.model)).toEqual(
      squadMembers.map(m => m.model),
    );
  });

  it('claw adapter forwards per-member model requests', async () => {
    const tracked = createTrackedClient();
    const adapter = new ClawHostAdapter({ client: tracked.client, family: 'zeroclaw' });

    for (const member of squadMembers) {
      await adapter.createSession({ model: member.model, clientName: `member-${member.agentName}` });
    }

    expect(tracked.createSession.mock.calls.map(([cfg]) => cfg.model)).toEqual(
      squadMembers.map(m => m.model),
    );
  });

  it('generic-mcp adapter rejects direct session creation', async () => {
    const adapter = createHostAdapter({
      host: 'generic-mcp',
      message: 'generic-mcp does not create direct sessions',
      readinessCheck: () => true,
    });

    await expect(adapter.createSession({ model: 'gpt-5.1-codex' })).rejects.toThrow(/does not create direct sessions/i);
  });
});
