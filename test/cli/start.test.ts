/**
 * Start Command Tests — PTY Mirror Mode for Copilot
 *
 * Tests module exports and StartOptions interface.
 * Does NOT spawn PTY or create tunnels (requires native deps + network).
 */

import { describe, it, expect } from 'vitest';

describe('CLI: start command', () => {
  it('module exports runStart function', async () => {
    const mod = await import('../../packages/squad-cli/src/cli/commands/start.js');
    expect(typeof mod.runStart).toBe('function');
  });

  it('module exports StartOptions type (verifiable via function arity)', async () => {
    const mod = await import('../../packages/squad-cli/src/cli/commands/start.js');
    // runStart(cwd, options) — should accept 2 parameters
    expect(mod.runStart.length).toBe(2);
  });

  it('module has no unexpected default export', async () => {
    const mod = await import('../../packages/squad-cli/src/cli/commands/start.js');
    // ESM module should have named exports, no default
    expect(mod.default).toBeUndefined();
  });

  it('exports node-pty loader helper', async () => {
    const mod = await import('../../packages/squad-cli/src/cli/commands/start.js');
    expect(typeof mod.loadNodePtyForStart).toBe('function');
  });

  it('node-pty loader throws actionable guidance when module is unavailable', async () => {
    const mod = await import('../../packages/squad-cli/src/cli/commands/start.js');
    await expect(
      mod.loadNodePtyForStart(async () => {
        throw new Error('Cannot find module node-pty');
      })
    ).rejects.toThrow(/requires optional dependency 'node-pty'/i);
  });
});
