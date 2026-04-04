import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  InMemorySquadStorage,
  SQLiteSquadStorage,
  StorageError,
  type MessageStatus,
  type SquadStorage,
} from './storage.js';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';
type AccessRole = 'read' | 'write';

interface AuthzConfig {
  defaultRateLimitPerMinute: number;
  tokens: Record<
    string,
    {
      squads: string[];
      rateLimitPerMinute?: number;
    }
  >;
}

const FALLBACK_AUTHZ: AuthzConfig = {
  defaultRateLimitPerMinute: 120,
  tokens: {},
};

const requestTimestamps = new Map<string, number[]>();
const suspiciousPatterns = [
  /-----BEGIN (RSA|EC|OPENSSH|PGP) PRIVATE KEY-----/i,
  /aws_secret_access_key/i,
  /xox[baprs]-[A-Za-z0-9-]+/i,
  /ghp_[A-Za-z0-9]{20,}/i,
];

function loadAuthzConfig(): AuthzConfig {
  const raw = process.env.SQUAD_MEMORY_AUTHZ_JSON;
  if (!raw) return FALLBACK_AUTHZ;
  try {
    const parsed = JSON.parse(raw) as Partial<AuthzConfig>;
    return {
      defaultRateLimitPerMinute: parsed.defaultRateLimitPerMinute ?? 120,
      tokens: parsed.tokens ?? {},
    };
  } catch (error) {
    log('error', 'authz.config_invalid', { error: error instanceof Error ? error.message : String(error) });
    return FALLBACK_AUTHZ;
  }
}

function log(level: LogLevel, event: string, meta: Record<string, unknown> = {}) {
  const payload = {
    ts: new Date().toISOString(),
    level,
    event,
    ...meta,
  };
  process.stderr.write(`${JSON.stringify(payload)}\n`);
}

function createStorageFromEnv(): SquadStorage {
  const backend = (process.env.SQUAD_MEMORY_BACKEND ?? 'sqlite').toLowerCase();
  if (backend === 'memory') {
    if ((process.env.NODE_ENV ?? '').toLowerCase() === 'production') {
      throw new Error('SQUAD_MEMORY_BACKEND=memory is not allowed in production.');
    }
    log('warn', 'storage.in_memory_mode');
    return new InMemorySquadStorage();
  }

  const dbPath = process.env.SQUAD_MEMORY_DB ?? '.squad/squad-memory.db';
  log('info', 'storage.sqlite_mode', { dbPath });
  return new SQLiteSquadStorage(dbPath);
}

function required(value: string | undefined, field: string): string {
  if (!value || !value.trim()) throw new Error(`${field} is required`);
  return value;
}

function safeTool(
  name: string,
  handler: (args: any, requestId: string) => Promise<Record<string, unknown>>,
) {
  return async (args: any, _extra?: unknown) => {
    const requestId = randomUUID();
    const startedAt = Date.now();

    try {
      const data = await handler(args, requestId);
      log('info', 'tool.success', {
        requestId,
        tool: name,
        durationMs: Date.now() - startedAt,
      });
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, requestId, ...data }) }],
      };
    } catch (error) {
      const err = normalizeError(error);
      log(err.recoverable ? 'warn' : 'error', 'tool.failure', {
        requestId,
        tool: name,
        durationMs: Date.now() - startedAt,
        code: err.code,
        message: err.message,
        recoverable: err.recoverable,
      });

      return {
        content: [
          {
            type: 'text' as const,
            // literal type needed for MCP SDK typing
            text: JSON.stringify({
              ok: false,
              requestId,
              error: {
                code: err.code,
                message: err.message,
                recoverable: err.recoverable,
              },
            }),
          },
        ],
      };
    }
  };
}

function normalizeError(error: unknown): { code: string; message: string; recoverable: boolean } {
  if (error instanceof StorageError) {
    return {
      code: error.code,
      message: error.message,
      recoverable: error.recoverable,
    };
  }

  if (error instanceof Error) {
    return {
      code: 'UNEXPECTED_ERROR',
      message: error.message,
      recoverable: false,
    };
  }

  return {
    code: 'UNKNOWN_ERROR',
    message: String(error),
    recoverable: false,
  };
}

function guardPayloadSize(args: Record<string, unknown>, maxBytes = 1024 * 128) {
  const size = Buffer.byteLength(JSON.stringify(args), 'utf-8');
  if (size > maxBytes) {
    throw new Error(`payload too large: ${size} bytes exceeds ${maxBytes} bytes`);
  }
}

function enforceSquadQuotas(storage: SquadStorage, squadId: string) {
  const maxMessages = Number(process.env.SQUAD_MEMORY_MAX_MESSAGES_PER_SQUAD ?? 50000);
  const maxMemories = Number(process.env.SQUAD_MEMORY_MAX_MEMORIES_PER_SQUAD ?? 200000);
  const stats = storage.getSquadStats(squadId);
  if (stats.messages >= maxMessages) throw new Error(`message quota exceeded for squad '${squadId}'.`);
  if (stats.memories >= maxMemories) throw new Error(`memory quota exceeded for squad '${squadId}'.`);
}

function enforceSensitiveDataPolicy(...values: Array<string | undefined>) {
  for (const raw of values) {
    if (!raw) continue;
    for (const pattern of suspiciousPatterns) {
      if (pattern.test(raw)) {
        throw new Error('payload blocked by sensitive-data policy.');
      }
    }
  }
}

function requireAuthorized(
  authz: AuthzConfig,
  args: Record<string, unknown>,
  role: AccessRole,
  squadId: string,
  tool: string,
) {
  if (!Object.keys(authz.tokens).length) return; // auth disabled for local/dev mode

  const authToken = typeof args.authToken === 'string' ? args.authToken : '';
  if (!authToken) throw new Error('authToken is required.');

  const principal = authz.tokens[authToken];
  if (!principal) throw new Error('invalid authToken.');

  const allowed = principal.squads.includes('*') || principal.squads.includes(squadId);
  if (!allowed) throw new Error(`authToken not authorized for squad '${squadId}'.`);

  // Per-token in-process rate limit
  const now = Date.now();
  const key = `${authToken}:${tool}:${role}`;
  const bucket = requestTimestamps.get(key) ?? [];
  const windowStart = now - 60_000;
  const recent = bucket.filter((ts) => ts > windowStart);
  const max = principal.rateLimitPerMinute ?? authz.defaultRateLimitPerMinute;
  if (recent.length >= max) throw new Error(`rate limit exceeded for token on tool '${tool}'.`);
  recent.push(now);
  requestTimestamps.set(key, recent);
}

async function main() {
  const storage = createStorageFromEnv();
  const authz = loadAuthzConfig();

  process.on('SIGINT', () => {
    log('info', 'server.shutdown', { signal: 'SIGINT' });
    storage.close?.();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    log('info', 'server.shutdown', { signal: 'SIGTERM' });
    storage.close?.();
    process.exit(0);
  });

  const server = new McpServer({ name: 'squad-memory-bridge', version: '1.0.0' });

  server.tool(
    'squad_health',
    'Return runtime/storage health and key operational stats.',
    {},
    safeTool('squad_health', async () => {
      return storage.healthCheck();
    }),
  );

  server.tool(
    'squad_send_message',
    'Send a message to one or more squad members.',
    {
      squadId: z.string(),
      authToken: z.string().optional(),
      from: z.string(),
      to: z.array(z.string()).min(1),
      subject: z.string().default(''),
      body: z.string(),
      tags: z.array(z.string()).optional(),
      correlationId: z.string().optional(),
    },
    safeTool('squad_send_message', async (args) => {
      guardPayloadSize(args);
      requireAuthorized(authz, args, 'write', required(args.squadId, 'squadId'), 'squad_send_message');
      enforceSquadQuotas(storage, required(args.squadId, 'squadId'));
      enforceSensitiveDataPolicy(args.subject, args.body);
      return storage.sendMessage({
        squadId: required(args.squadId, 'squadId'),
        from: required(args.from, 'from'),
        to: args.to,
        subject: args.subject,
        body: required(args.body, 'body'),
        tags: args.tags,
        correlationId: args.correlationId,
      });
    }),
  );

  server.tool(
    'squad_list_inbox',
    'List unresolved inbox messages for an agent.',
    {
      squadId: z.string(),
      authToken: z.string().optional(),
      agentName: z.string(),
    },
    safeTool('squad_list_inbox', async (args) => {
      guardPayloadSize(args);
      requireAuthorized(authz, args, 'read', required(args.squadId, 'squadId'), 'squad_list_inbox');
      return {
        items: storage.listInbox(required(args.squadId, 'squadId'), required(args.agentName, 'agentName')),
      };
    }),
  );

  server.tool(
    'squad_ack_message',
    'Mark a message as read or resolved.',
    {
      squadId: z.string(),
      authToken: z.string().optional(),
      messageId: z.string(),
      status: z.enum(['read', 'resolved']).default('read'),
    },
    safeTool('squad_ack_message', async (args) => {
      guardPayloadSize(args);
      requireAuthorized(authz, args, 'write', required(args.squadId, 'squadId'), 'squad_ack_message');
      const status: MessageStatus = args.status;
      return {
        updated: storage.ackMessage(required(args.squadId, 'squadId'), required(args.messageId, 'messageId'), status),
      };
    }),
  );

  server.tool(
    'squad_store_memory',
    'Store a durable memory record for the squad.',
    {
      squadId: z.string(),
      authToken: z.string().optional(),
      agentName: z.string(),
      type: z.enum(['fact', 'decision', 'risk', 'handoff', 'retro']),
      tier: z.enum(['hot', 'cold', 'long_term']).optional(),
      summary: z.string(),
      details: z.string().optional(),
      tags: z.array(z.string()).optional(),
      confidence: z.number().min(0).max(1).optional(),
      accuracy: z.number().min(0).max(1).optional(),
      source: z.string().optional(),
      expiresAt: z.string().optional(),
    },
    safeTool('squad_store_memory', async (args) => {
      guardPayloadSize(args);
      requireAuthorized(authz, args, 'write', required(args.squadId, 'squadId'), 'squad_store_memory');
      enforceSquadQuotas(storage, required(args.squadId, 'squadId'));
      enforceSensitiveDataPolicy(args.summary, args.details);
      return storage.storeMemory({
        squadId: required(args.squadId, 'squadId'),
        agentName: required(args.agentName, 'agentName'),
        type: args.type,
        tier: args.tier,
        summary: required(args.summary, 'summary'),
        details: args.details,
        tags: args.tags,
        confidence: args.confidence,
        accuracy: args.accuracy,
        source: args.source,
        expiresAt: args.expiresAt,
      });
    }),
  );

  server.tool(
    'squad_query_memories',
    'Query memories by filters and text.',
    {
      squadId: z.string(),
      authToken: z.string().optional(),
      agentName: z.string().optional(),
      type: z.enum(['fact', 'decision', 'risk', 'handoff', 'retro']).optional(),
      tier: z.enum(['hot', 'cold', 'long_term']).optional(),
      tags: z.array(z.string()).optional(),
      text: z.string().optional(),
      limit: z.number().int().min(1).max(100).optional(),
    },
    safeTool('squad_query_memories', async (args) => {
      guardPayloadSize(args);
      requireAuthorized(authz, args, 'read', required(args.squadId, 'squadId'), 'squad_query_memories');
      return {
        items: storage.queryMemories({
          squadId: required(args.squadId, 'squadId'),
          agentName: args.agentName,
          type: args.type,
          tier: args.tier,
          tags: args.tags,
          text: args.text,
          limit: args.limit,
        }),
      };
    }),
  );

  server.tool(
    'squad_handoff',
    'Send a handoff message and store it as memory atomically.',
    {
      message: z.object({
        squadId: z.string(),
        authToken: z.string().optional(),
        from: z.string(),
        to: z.array(z.string()).min(1),
        subject: z.string(),
        body: z.string(),
        tags: z.array(z.string()).optional(),
        correlationId: z.string().optional(),
      }),
      memory: z.object({
        squadId: z.string(),
        agentName: z.string(),
        summary: z.string(),
        details: z.string().optional(),
        tags: z.array(z.string()).optional(),
        confidence: z.number().min(0).max(1).optional(),
        source: z.string().optional(),
        expiresAt: z.string().optional(),
      }),
    },
    safeTool('squad_handoff', async (args) => {
      guardPayloadSize(args);
      if (args.message.squadId !== args.memory.squadId) {
        throw new Error('message.squadId and memory.squadId must match.');
      }
      requireAuthorized(authz, args.message, 'write', required(args.message.squadId, 'squadId'), 'squad_handoff');
      enforceSquadQuotas(storage, required(args.message.squadId, 'squadId'));
      enforceSensitiveDataPolicy(args.message.subject, args.message.body, args.memory.summary, args.memory.details);
      return storage.handoff({
        message: args.message,
        memory: {
          ...args.memory,
          type: 'handoff',
        },
      });
    }),
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  log('info', 'server.ready', { transport: 'stdio' });
}

main().catch((error) => {
  const normalized = normalizeError(error);
  log('error', 'server.fatal', normalized);
  process.exit(1);
});
