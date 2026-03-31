/**
 * Claude host adapter.
 *
 * @module host/claude-host-adapter
 */

import type { SquadConnectionState } from '../adapter/client.js';
import type {
  SquadClientEvent,
  SquadClientEventHandler,
  SquadClientEventType,
  SquadSession,
  SquadSessionConfig,
} from '../adapter/types.js';
import {
  defaultCapabilitiesForHost,
  type AgentHostAdapter,
  type HostCapabilities,
} from './types.js';

export interface ClaudeHostClientLike {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getConnectionState(): SquadConnectionState;
  createSession(config?: SquadSessionConfig): Promise<SquadSession>;
  on<K extends SquadClientEventType>(
    eventType: K,
    handler: (event: SquadClientEvent & { type: K }) => void,
  ): () => void;
  on(handler: SquadClientEventHandler): () => void;
}

export interface ClaudeHostAdapterOptions {
  client?: ClaudeHostClientLike;
  clientFactory?: () => ClaudeHostClientLike;
  capabilities?: Partial<HostCapabilities>;
}

export class ClaudeHostAdapter implements AgentHostAdapter {
  readonly host = 'claude' as const;
  readonly capabilities: HostCapabilities;

  private readonly client: ClaudeHostClientLike;

  constructor(options: ClaudeHostAdapterOptions) {
    this.client = resolveClaudeClient(options);
    this.capabilities = {
      ...defaultCapabilitiesForHost('claude'),
      ...(options.capabilities ?? {}),
    };
  }

  async connect(): Promise<void> {
    await this.client.connect();
  }

  async disconnect(): Promise<void> {
    await this.client.disconnect();
  }

  getConnectionState(): SquadConnectionState {
    return this.client.getConnectionState();
  }

  async createSession(config: SquadSessionConfig = {}): Promise<SquadSession> {
    return await this.client.createSession(config);
  }

  on<K extends SquadClientEventType>(
    eventTypeOrHandler: K | SquadClientEventHandler,
    handler?: (event: SquadClientEvent & { type: K }) => void,
  ): () => void {
    if (typeof eventTypeOrHandler === 'function') {
      return this.client.on(eventTypeOrHandler);
    }
    return this.client.on(eventTypeOrHandler, handler!);
  }
}

export function createClaudeHostAdapter(options: ClaudeHostAdapterOptions = {}): ClaudeHostAdapter {
  return new ClaudeHostAdapter(options);
}

function resolveClaudeClient(options: ClaudeHostAdapterOptions): ClaudeHostClientLike {
  if (options.client) return options.client;
  if (options.clientFactory) return options.clientFactory();
  throw new Error(
    'ClaudeHostAdapter requires a client or clientFactory. ' +
    'Provide one in constructor options or instantiate through a runtime-specific integration.',
  );
}
