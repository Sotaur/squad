/**
 * Copilot host adapter.
 *
 * Wraps the existing SquadClient adapter so coordinator/runtime code can target
 * a stable host contract without binding directly to Copilot SDK details.
 *
 * @module host/copilot-host-adapter
 */

import { SquadClient, type SquadClientOptions } from '../adapter/client.js';
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

/** Test-friendly shape for injected client implementations. */
export interface CopilotHostClientLike {
  connect(): Promise<void>;
  disconnect(): Promise<void | Error[]>;
  getConnectionState?(): 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';
  getState?(): 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';
  createSession(config?: SquadSessionConfig): Promise<SquadSession>;
  on<K extends SquadClientEventType>(
    eventType: K,
    handler: (event: SquadClientEvent & { type: K }) => void,
  ): () => void;
  on(handler: SquadClientEventHandler): () => void;
}

export interface CopilotHostAdapterOptions {
  clientOptions?: SquadClientOptions;
  /** Optional overrides for testing or constrained runtime deployments. */
  capabilities?: Partial<HostCapabilities>;
  /** Injected client for tests; defaults to a real SquadClient instance. */
  client?: CopilotHostClientLike;
}

export class CopilotHostAdapter implements AgentHostAdapter {
  readonly host = 'copilot' as const;
  readonly capabilities: HostCapabilities;

  private readonly client: CopilotHostClientLike;

  constructor(options: CopilotHostAdapterOptions = {}) {
    this.client = options.client ?? new SquadClient(options.clientOptions);
    this.capabilities = {
      ...defaultCapabilitiesForHost('copilot'),
      ...(options.capabilities ?? {}),
    };
  }

  async connect(): Promise<void> {
    await this.client.connect();
  }

  async disconnect(): Promise<void> {
    await this.client.disconnect();
  }

  getConnectionState() {
    if (typeof this.client.getConnectionState === 'function') {
      return this.client.getConnectionState();
    }
    if (typeof this.client.getState === 'function') {
      return this.client.getState();
    }
    return 'disconnected';
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
