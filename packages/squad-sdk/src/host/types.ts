/**
 * Host adapter contracts for coding-agent platform portability.
 *
 * @module host/types
 */

import type {
  SquadClientEvent,
  SquadClientEventHandler,
  SquadClientEventType,
  SquadSession,
  SquadSessionConfig,
  SquadMessageOptions,
} from '../adapter/types.js';
import type { SquadConnectionState } from '../adapter/client.js';

/** Agent runtime host platform. */
export type AgentHostType = 'copilot' | 'codex' | 'claude' | 'claw' | 'generic-mcp';

/** Capability flags used by runtime profile negotiation. */
export interface HostCapabilities {
  /** Host can run multiple agent sessions concurrently. */
  parallelSessions: boolean;
  /** Host supports strongly-typed JSON schema tool definitions. */
  toolSchemas: boolean;
  /** Host supports pre/post tool hook interception natively. */
  nativeHooks: boolean;
  /** Host supports token-level or chunk-level streaming events. */
  streamingEvents: boolean;
  /** Host supports resumable or persistent session semantics. */
  sessionResume: boolean;
  /** Host can surface model or provider selection hints. */
  modelHints: boolean;
  /** Host exposes MCP servers as first-class tools. */
  mcpTools: boolean;
}

/** Canonical capability keys for profile policies and tests. */
export type HostCapabilityKey = keyof HostCapabilities;
export type HostCapabilityState = 'supported' | 'unsupported' | 'unknown';
export type HostCapabilityStates = Record<HostCapabilityKey, HostCapabilityState>;

/** Confidence metadata for a capability profile (defaults/hints/probes). */
export interface HostCapabilityConfidence {
  source: 'defaults' | 'override' | 'probe';
  score: number;
  measuredAt?: string;
}

/** Runtime mode negotiated from capabilities and required features. */
export type RuntimeProfileMode = 'native' | 'degraded';

/** Result of host capability negotiation at startup. */
export interface ResolvedRuntimeProfile {
  host: AgentHostType;
  mode: RuntimeProfileMode;
  capabilities: HostCapabilities;
  capabilityStates: HostCapabilityStates;
  confidence: HostCapabilityConfidence;
  /** Capabilities that were requested but not available. */
  missingCapabilities: HostCapabilityKey[];
  /** Human-readable coordinator fallbacks to enable. */
  fallbackStrategies: string[];
}

/**
 * Stable host adapter contract.
 * Adapters bridge platform SDK/runtime differences while preserving Squad behavior.
 */
export interface AgentHostAdapter {
  readonly host: AgentHostType;
  readonly capabilities: HostCapabilities;

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

/** Build capability object with defaults for omitted keys. */
export function defineHostCapabilities(partial: Partial<HostCapabilities>): HostCapabilities {
  return {
    parallelSessions: partial.parallelSessions ?? false,
    toolSchemas: partial.toolSchemas ?? false,
    nativeHooks: partial.nativeHooks ?? false,
    streamingEvents: partial.streamingEvents ?? false,
    sessionResume: partial.sessionResume ?? false,
    modelHints: partial.modelHints ?? false,
    mcpTools: partial.mcpTools ?? false,
  };
}

/** Convert boolean capabilities into explicit capability states. */
export function toCapabilityStates(capabilities: HostCapabilities): HostCapabilityStates {
  return {
    parallelSessions: capabilities.parallelSessions ? 'supported' : 'unsupported',
    toolSchemas: capabilities.toolSchemas ? 'supported' : 'unsupported',
    nativeHooks: capabilities.nativeHooks ? 'supported' : 'unsupported',
    streamingEvents: capabilities.streamingEvents ? 'supported' : 'unsupported',
    sessionResume: capabilities.sessionResume ? 'supported' : 'unsupported',
    modelHints: capabilities.modelHints ? 'supported' : 'unsupported',
    mcpTools: capabilities.mcpTools ? 'supported' : 'unsupported',
  };
}

/**
 * Default capability assumptions by host type.
 * These are optimistic for known adapters and conservative for generic MCP.
 */
export function defaultCapabilitiesForHost(host: AgentHostType): HostCapabilities {
  switch (host) {
    case 'copilot':
      return defineHostCapabilities({
        parallelSessions: true,
        toolSchemas: true,
        nativeHooks: true,
        streamingEvents: true,
        sessionResume: true,
        modelHints: true,
        mcpTools: true,
      });
    case 'codex':
      return defineHostCapabilities({
        parallelSessions: true,
        toolSchemas: true,
        nativeHooks: true,
        streamingEvents: true,
        sessionResume: true,
        modelHints: true,
        mcpTools: true,
      });
    case 'claude':
      return defineHostCapabilities({
        parallelSessions: true,
        toolSchemas: true,
        nativeHooks: true,
        streamingEvents: true,
        sessionResume: true,
        modelHints: true,
        mcpTools: true,
      });
    case 'claw':
      return defineHostCapabilities({
        parallelSessions: false,
        toolSchemas: false,
        nativeHooks: false,
        streamingEvents: false,
        sessionResume: false,
        modelHints: true,
        mcpTools: false,
      });
    case 'generic-mcp':
      return defineHostCapabilities({
        parallelSessions: false,
        toolSchemas: true,
        nativeHooks: false,
        streamingEvents: false,
        sessionResume: false,
        modelHints: false,
        mcpTools: true,
      });
  }
}

/** Lightweight message helper for host adapters in call sites. */
export type HostMessageOptions = SquadMessageOptions;
