/**
 * Host adapter factory.
 *
 * @module host/factory
 */

import { type SquadClientOptions } from '../adapter/client.js';
import type {
  SquadClientEvent,
  SquadClientEventHandler,
  SquadClientEventType,
  SquadSession,
  SquadSessionConfig,
} from '../adapter/types.js';
import {
  createClaudeHostAdapter,
  type ClaudeHostClientLike,
} from './claude-host-adapter.js';
import {
  createCodexHostAdapter,
  type CodexHostClientLike,
} from './codex-host-adapter.js';
import { CopilotHostAdapter, type CopilotHostClientLike } from './copilot-host-adapter.js';
import { createClawHostAdapter, type ClawHostClientLike, type ClawFamily } from './claw-host-adapter.js';
import type { AgentHostAdapter, AgentHostType, HostCapabilities } from './types.js';

export type HostAdapterFactoryOptions =
  | {
      host: 'copilot';
      client?: CopilotHostClientLike;
      clientOptions?: SquadClientOptions;
      capabilities?: Partial<HostCapabilities>;
    }
  | {
      host: 'codex';
      client?: CodexHostClientLike;
      clientFactory?: () => CodexHostClientLike;
      capabilities?: Partial<HostCapabilities>;
    }
  | {
      host: 'claude';
      client?: ClaudeHostClientLike;
      clientFactory?: () => ClaudeHostClientLike;
      capabilities?: Partial<HostCapabilities>;
    }
  | {
      host: 'claw';
      client?: ClawHostClientLike;
      clientFactory?: () => ClawHostClientLike;
      capabilities?: Partial<HostCapabilities>;
      family?: ClawFamily;
    }
  | {
      host: 'generic-mcp';
      message?: string;
      readinessCheck?: () => Promise<boolean> | boolean;
    };

class GenericMcpHostAdapter implements AgentHostAdapter {
  readonly host: AgentHostType = 'generic-mcp';
  readonly capabilities = {
    parallelSessions: false,
    toolSchemas: true,
    nativeHooks: false,
    streamingEvents: false,
    sessionResume: false,
    modelHints: false,
    mcpTools: true,
  };

  private connectionState: 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error' = 'disconnected';

  constructor(
    private readonly message = 'generic-mcp host adapter cannot create direct agent sessions',
    private readonly readinessCheck?: () => Promise<boolean> | boolean,
  ) {}

  async connect(): Promise<void> {
    this.connectionState = 'connecting';
    try {
      const ready = await this.isReady();
      this.connectionState = ready ? 'connected' : 'error';
      if (!ready) {
        throw new Error(`${this.message}. Readiness check failed.`);
      }
    } catch {
      this.connectionState = 'error';
      throw new Error(`${this.message}. Unable to verify generic-mcp readiness.`);
    }
  }
  async disconnect(): Promise<void> {
    this.connectionState = 'disconnected';
  }
  getConnectionState() {
    return this.connectionState;
  }
  async createSession(_config?: SquadSessionConfig): Promise<SquadSession> {
    throw new Error(this.message);
  }
  on<K extends SquadClientEventType>(
    _eventTypeOrHandler: K | SquadClientEventHandler,
    _handler?: (event: SquadClientEvent & { type: K }) => void,
  ): () => void {
    return () => {};
  }

  private async isReady(): Promise<boolean> {
    if (!this.readinessCheck) return false;
    return await this.readinessCheck();
  }
}

export function createHostAdapter(options: HostAdapterFactoryOptions): AgentHostAdapter {
  switch (options.host) {
    case 'copilot':
      return new CopilotHostAdapter({
        client: options.client,
        clientOptions: options.clientOptions,
        capabilities: options.capabilities,
      });
    case 'codex':
      return createCodexHostAdapter({
        client: options.client,
        clientFactory: options.clientFactory,
        capabilities: options.capabilities,
      });
    case 'claude':
      return createClaudeHostAdapter({
        client: options.client,
        clientFactory: options.clientFactory,
        capabilities: options.capabilities,
      });
    case 'claw':
      return createClawHostAdapter({
        client: options.client,
        clientFactory: options.clientFactory,
        capabilities: options.capabilities,
        family: options.family,
      });
    case 'generic-mcp':
      return new GenericMcpHostAdapter(options.message, options.readinessCheck);
  }
}
