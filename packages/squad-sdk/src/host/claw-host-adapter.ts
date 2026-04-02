/**
 * Claw-family host adapter.
 *
 * Supports ZeroClaw/OpenClaw style runtimes behind a shared interface so
 * runtime orchestration stays host-agnostic.
 *
 * @module host/claw-host-adapter
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

/** Concrete platform identity under the claw family umbrella. */
export type ClawFamily = 'zeroclaw' | 'openclaw' | 'unknown';

/**
 * Host client shape required by the adapter.
 *
 * Intentionally identical to other host adapters so factories and test harnesses
 * can reuse the same mock/runtime adapters.
 */
export interface ClawHostClientLike {
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

export interface ClawHostAdapterOptions {
  client?: ClawHostClientLike;
  clientFactory?: () => ClawHostClientLike;
  capabilities?: Partial<HostCapabilities>;
  family?: ClawFamily;
}

export class ClawHostAdapter implements AgentHostAdapter {
  readonly host = 'claw' as const;
  readonly capabilities: HostCapabilities;

  /** Optional informational identity for diagnostics/telemetry. */
  readonly family: ClawFamily;

  private readonly client: ClawHostClientLike;

  constructor(options: ClawHostAdapterOptions) {
    this.client = resolveClawClient(options);
    this.family = options.family ?? 'unknown';
    this.capabilities = {
      ...defaultCapabilitiesForHost('claw'),
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

export function createClawHostAdapter(options: ClawHostAdapterOptions = {}): ClawHostAdapter {
  return new ClawHostAdapter(options);
}

function resolveClawClient(options: ClawHostAdapterOptions): ClawHostClientLike {
  if (options.client) return options.client;
  if (options.clientFactory) return options.clientFactory();
  throw new Error(
    'ClawHostAdapter requires a client or clientFactory. ' +
      'Provide one in constructor options or instantiate through a runtime-specific integration.',
  );
}
