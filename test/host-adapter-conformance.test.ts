import { describe, it, expect, vi } from 'vitest';
import type { AgentHostAdapter } from '../packages/squad-sdk/src/host/types.js';
import { CopilotHostAdapter } from '../packages/squad-sdk/src/host/copilot-host-adapter.js';
import { CodexHostAdapter } from '../packages/squad-sdk/src/host/codex-host-adapter.js';
import { ClaudeHostAdapter } from '../packages/squad-sdk/src/host/claude-host-adapter.js';
import { resolveRuntimeProfile } from '../packages/squad-sdk/src/runtime/capability-profile.js';
import { ClawHostAdapter } from '../packages/squad-sdk/src/host/claw-host-adapter.js';

function createMockClient() {
  return {
    connect: vi.fn(async () => {}),
    disconnect: vi.fn(async () => {}),
    getConnectionState: vi.fn(() => 'connected' as const),
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

const adapters: Array<{ name: string; create: () => AgentHostAdapter }> = [
  {
    name: 'copilot',
    create: () => new CopilotHostAdapter({ client: createMockClient() }),
  },
  {
    name: 'codex',
    create: () => new CodexHostAdapter({ client: createMockClient() }),
  },
  {
    name: 'claude',
    create: () => new ClaudeHostAdapter({ client: createMockClient() }),
  },
  {
    name: 'claw',
    create: () => new ClawHostAdapter({ client: createMockClient(), family: 'zeroclaw' }),
  },
];

describe('host adapter conformance', () => {
  for (const adapterCase of adapters) {
    it(`${adapterCase.name} implements required AgentHostAdapter behavior`, async () => {
      const adapter = adapterCase.create();

      await adapter.connect();
      const session = await adapter.createSession({ model: 'test-model' });
      expect(session.sessionId).toBeTypeOf('string');
      expect(typeof adapter.on(() => {})).toBe('function');
      await adapter.disconnect();

      const profile = resolveRuntimeProfile(adapter);
      expect(profile.host).toBe(adapter.host);
      expect(profile.capabilities).toBeTruthy();
    });
  }
});
