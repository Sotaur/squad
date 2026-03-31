/**
 * Codex host adapter.
 *
 * @module host/codex-host-adapter
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

export interface CodexHostClientLike {
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

export interface CodexHostAdapterOptions {
  client?: CodexHostClientLike;
  clientFactory?: () => CodexHostClientLike;
  capabilities?: Partial<HostCapabilities>;
}

export class CodexHostAdapter implements AgentHostAdapter {
  readonly host = 'codex' as const;
  readonly capabilities: HostCapabilities;

  private readonly client: CodexHostClientLike;

  constructor(options: CodexHostAdapterOptions) {
    this.client = resolveCodexClient(options);
    this.capabilities = {
      ...defaultCapabilitiesForHost('codex'),
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

export function createCodexHostAdapter(options: CodexHostAdapterOptions = {}): CodexHostAdapter {
  return new CodexHostAdapter(options);
}

function resolveCodexClient(options: CodexHostAdapterOptions): CodexHostClientLike {
  if (options.client) return options.client;
  if (options.clientFactory) return options.clientFactory();
  throw new Error(
    'CodexHostAdapter requires a client or clientFactory. ' +
    'Provide one in constructor options or instantiate through a runtime-specific integration.',
  );
}
