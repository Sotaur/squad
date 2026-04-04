import Database from 'better-sqlite3';

export type MessageStatus = 'queued' | 'read' | 'resolved';
export type MemoryType = 'fact' | 'decision' | 'risk' | 'handoff' | 'retro';
export type MemoryTier = 'hot' | 'cold' | 'long_term';

export interface SquadMessage {
  id: string;
  squadId: string;
  from: string;
  to: string[];
  subject: string;
  body: string;
  tags: string[];
  correlationId?: string;
  status: MessageStatus;
  createdAt: string;
  ackedAt?: string;
}

export interface SquadMemory {
  id: string;
  squadId: string;
  agentName: string;
  type: MemoryType;
  summary: string;
  details: string;
  tags: string[];
  confidence: number;
  source: string;
  tier: MemoryTier;
  accuracy: number;
  usageCount: number;
  lastAccessedAt: string;
  createdAt: string;
  expiresAt?: string;
}

export interface SendMessageInput {
  squadId: string;
  from: string;
  to: string[];
  subject: string;
  body: string;
  tags?: string[];
  correlationId?: string;
}

export interface StoreMemoryInput {
  squadId: string;
  agentName: string;
  type: MemoryType;
  summary: string;
  details?: string;
  tags?: string[];
  confidence?: number;
  accuracy?: number;
  tier?: MemoryTier;
  source?: string;
  expiresAt?: string;
}

export interface QueryMemoriesInput {
  squadId: string;
  agentName?: string;
  type?: MemoryType;
  tier?: MemoryTier;
  tags?: string[];
  text?: string;
  limit?: number;
}

export interface SquadStorage {
  sendMessage(input: SendMessageInput): { messageId: string };
  listInbox(squadId: string, agentName: string): SquadMessage[];
  ackMessage(squadId: string, messageId: string, status: MessageStatus): boolean;
  storeMemory(input: StoreMemoryInput): { memoryId: string };
  queryMemories(input: QueryMemoriesInput): SquadMemory[];
  handoff(input: { message: SendMessageInput; memory: StoreMemoryInput }): { messageId: string; memoryId: string };
  healthCheck(): {
    backend: 'sqlite' | 'memory';
    status: 'ok' | 'degraded';
    stats: Record<string, number | string>;
  };
  getSquadStats(squadId: string): {
    messages: number;
    memories: number;
  };
  close?(): void;
}

export class StorageError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly recoverable: boolean,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'StorageError';
  }
}

export class SQLiteSquadStorage implements SquadStorage {
  private readonly db: Database.Database;
  private readonly statements: ReturnType<typeof this.prepareStatements>;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.configureDatabase();
    this.migrate();
    this.statements = this.prepareStatements();
  }

  sendMessage(input: SendMessageInput): { messageId: string } {
    return this.withRetry('sendMessage', () => {
      const id = this.id('msg');
      this.statements.insertMessage.run({
        id,
        squadId: input.squadId,
        from: input.from,
        recipientsJson: JSON.stringify(input.to),
        subject: input.subject,
        body: redactSecrets(input.body),
        tagsJson: JSON.stringify(input.tags ?? []),
        correlationId: input.correlationId ?? null,
        createdAt: new Date().toISOString(),
      });

      return { messageId: id };
    });
  }

  listInbox(squadId: string, agentName: string): SquadMessage[] {
    return this.withRetry('listInbox', () => {
      const rows = this.statements.selectMessagesBySquad.all(squadId) as SqlMessageRow[];
      return rows.map(rowToMessage).filter((m) => m.to.includes(agentName)).filter((m) => m.status !== 'resolved');
    });
  }

  ackMessage(squadId: string, messageId: string, status: MessageStatus): boolean {
    return this.withRetry('ackMessage', () => {
      const result = this.statements.updateMessageStatus.run({
        status,
        ackedAt: new Date().toISOString(),
        messageId,
        squadId,
      });
      return result.changes > 0;
    });
  }

  storeMemory(input: StoreMemoryInput): { memoryId: string } {
    return this.withRetry('storeMemory', () => {
      const id = this.id('mem');
      this.statements.insertMemory.run({
        id,
        squadId: input.squadId,
        agentName: input.agentName,
        type: input.type,
        summary: redactSecrets(input.summary),
        details: redactSecrets(normalizeDetailsForTier(input.details ?? '', input.tier ?? 'hot')),
        tagsJson: JSON.stringify(input.tags ?? []),
        confidence: clamp01(input.confidence ?? 0.7),
        accuracy: clamp01(input.accuracy ?? inferAccuracy(input.tier ?? 'hot', input.confidence ?? 0.7)),
        tier: input.tier ?? 'hot',
        usageCount: 0,
        lastAccessedAt: new Date().toISOString(),
        source: input.source ?? 'agent-observed',
        createdAt: new Date().toISOString(),
        expiresAt: input.expiresAt ?? null,
      });
      return { memoryId: id };
    });
  }

  queryMemories(input: QueryMemoriesInput): SquadMemory[] {
    return this.withRetry('queryMemories', () => {
      const rows = this.statements.selectMemoriesBySquad.all(input.squadId, Math.max(1, Math.min(input.limit ?? 100, 500))) as SqlMemoryRow[];
      const now = Date.now();

      return rows
        .map(rowToMemory)
        .filter((m) => !input.agentName || m.agentName === input.agentName)
        .filter((m) => !input.type || m.type === input.type)
        .filter((m) => !input.tier || m.tier === input.tier)
        .filter((m) => !input.tags || input.tags.every((tag) => m.tags.includes(tag)))
        .filter((m) => !m.expiresAt || Date.parse(m.expiresAt) > now)
        .filter((m) => {
          if (!input.text) return true;
          const hay = `${m.summary}\n${m.details}\n${m.tags.join(' ')}`.toLowerCase();
          return hay.includes(input.text.toLowerCase());
        })
        .map((m) => ({ memory: m, score: scoreMemory(m, now) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, input.limit ?? 10)
        .map((x) => {
          const evolvedTier = evolveTier(x.memory);
          this.statements.updateMemoryAccess.run({
            id: x.memory.id,
            usageCount: x.memory.usageCount + 1,
            lastAccessedAt: new Date().toISOString(),
            tier: evolvedTier,
          });
          return formatMemoryForTier({ ...x.memory, tier: evolvedTier, usageCount: x.memory.usageCount + 1 });
        });
    });
  }

  handoff(input: { message: SendMessageInput; memory: StoreMemoryInput }): { messageId: string; memoryId: string } {
    return this.withRetry('handoff', () => {
      const tx = this.db.transaction((payload: { message: SendMessageInput; memory: StoreMemoryInput }) => {
        const send = this.sendMessage(payload.message);
        const store = this.storeMemory({
          ...payload.memory,
          type: 'handoff',
          tags: [...(payload.memory.tags ?? []), 'handoff'],
        });
        return { messageId: send.messageId, memoryId: store.memoryId };
      });

      return tx(input);
    });
  }

  close(): void {
    this.db.close();
  }

  healthCheck(): { backend: 'sqlite'; status: 'ok' | 'degraded'; stats: Record<string, number | string> } {
    try {
      const integrity = this.db.pragma('quick_check', { simple: true }) as string;
      const messageCount = Number((this.db.prepare('SELECT COUNT(*) as c FROM messages').get() as any).c ?? 0);
      const memoryCount = Number((this.db.prepare('SELECT COUNT(*) as c FROM memories').get() as any).c ?? 0);
      const walMode = String(this.db.pragma('journal_mode', { simple: true }));

      return {
        backend: 'sqlite',
        status: integrity.toLowerCase() === 'ok' ? 'ok' : 'degraded',
        stats: {
          integrity,
          messageCount,
          memoryCount,
          journalMode: walMode,
        },
      };
    } catch (error) {
      return {
        backend: 'sqlite',
        status: 'degraded',
        stats: {
          error: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  getSquadStats(squadId: string): { messages: number; memories: number } {
    const messages = Number((this.db.prepare('SELECT COUNT(*) as c FROM messages WHERE squad_id = ?').get(squadId) as any)?.c ?? 0);
    const memories = Number((this.db.prepare('SELECT COUNT(*) as c FROM memories WHERE squad_id = ?').get(squadId) as any)?.c ?? 0);
    return { messages, memories };
  }

  private configureDatabase() {
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('busy_timeout = 3000');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('temp_store = MEMORY');
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        squad_id TEXT NOT NULL,
        sender TEXT NOT NULL,
        recipients_json TEXT NOT NULL,
        subject TEXT NOT NULL,
        body TEXT NOT NULL,
        tags_json TEXT NOT NULL,
        correlation_id TEXT,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        acked_at TEXT
      );

      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        squad_id TEXT NOT NULL,
        agent_name TEXT NOT NULL,
        type TEXT NOT NULL,
        summary TEXT NOT NULL,
        details TEXT NOT NULL,
        tags_json TEXT NOT NULL,
        confidence REAL NOT NULL,
        accuracy REAL NOT NULL DEFAULT 0.7,
        tier TEXT NOT NULL DEFAULT 'hot',
        usage_count INTEGER NOT NULL DEFAULT 0,
        last_accessed_at TEXT NOT NULL DEFAULT (datetime('now')),
        source TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_messages_squad_created ON messages(squad_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_memories_squad_created ON memories(squad_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
      CREATE INDEX IF NOT EXISTS idx_memories_agent ON memories(agent_name);
      CREATE INDEX IF NOT EXISTS idx_memories_tier ON memories(tier);
    `);

    this.ensureColumn('memories', 'accuracy', "REAL NOT NULL DEFAULT 0.7");
    this.ensureColumn('memories', 'tier', "TEXT NOT NULL DEFAULT 'hot'");
    this.ensureColumn('memories', 'usage_count', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('memories', 'last_accessed_at', "TEXT NOT NULL DEFAULT (datetime('now'))");
  }

  private prepareStatements() {
    return {
      insertMessage: this.db.prepare(`
        INSERT INTO messages (id, squad_id, sender, recipients_json, subject, body, tags_json, correlation_id, status, created_at)
        VALUES (@id, @squadId, @from, @recipientsJson, @subject, @body, @tagsJson, @correlationId, 'queued', @createdAt)
      `),
      selectMessagesBySquad: this.db.prepare(`
        SELECT * FROM messages WHERE squad_id = ? ORDER BY created_at DESC LIMIT 1000
      `),
      updateMessageStatus: this.db.prepare(`
        UPDATE messages
        SET status = @status, acked_at = @ackedAt
        WHERE id = @messageId AND squad_id = @squadId
      `),
      insertMemory: this.db.prepare(`
        INSERT INTO memories (id, squad_id, agent_name, type, summary, details, tags_json, confidence, accuracy, tier, usage_count, last_accessed_at, source, created_at, expires_at)
        VALUES (@id, @squadId, @agentName, @type, @summary, @details, @tagsJson, @confidence, @accuracy, @tier, @usageCount, @lastAccessedAt, @source, @createdAt, @expiresAt)
      `),
      selectMemoriesBySquad: this.db.prepare(`
        SELECT * FROM memories WHERE squad_id = ? ORDER BY created_at DESC LIMIT ?
      `),
      updateMemoryAccess: this.db.prepare(`
        UPDATE memories
        SET usage_count = @usageCount, last_accessed_at = @lastAccessedAt, tier = @tier
        WHERE id = @id
      `),
    };
  }

  private withRetry<T>(operation: string, fn: () => T): T {
    let attempts = 0;
    let lastError: unknown;

    while (attempts < 3) {
      try {
        return fn();
      } catch (error: any) {
        lastError = error;
        attempts += 1;
        const isBusy = typeof error?.message === 'string' && error.message.includes('SQLITE_BUSY');

        if (!isBusy || attempts >= 3) {
          throw new StorageError(
            `SQLite operation '${operation}' failed after ${attempts} attempt(s).`,
            isBusy ? 'SQLITE_BUSY' : 'SQLITE_ERROR',
            isBusy,
            error,
          );
        }
      }
    }

    throw new StorageError(`SQLite operation '${operation}' failed.`, 'SQLITE_ERROR', false, lastError);
  }

  private id(prefix: 'msg' | 'mem') {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
  }

  private ensureColumn(table: string, column: string, definition: string): void {
    const columns = this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (!columns.some((c) => c.name === column)) {
      this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }
}

export class InMemorySquadStorage implements SquadStorage {
  private messages = new Map<string, SquadMessage[]>();
  private memories = new Map<string, SquadMemory[]>();

  sendMessage(input: SendMessageInput): { messageId: string } {
    const id = this.id('msg');
    const msg: SquadMessage = {
      id,
      squadId: input.squadId,
      from: input.from,
      to: input.to,
      subject: input.subject,
      body: redactSecrets(input.body),
      tags: input.tags ?? [],
      correlationId: input.correlationId,
      status: 'queued',
      createdAt: new Date().toISOString(),
    };
    const bucket = this.messages.get(input.squadId) ?? [];
    bucket.push(msg);
    this.messages.set(input.squadId, bucket);
    return { messageId: id };
  }

  listInbox(squadId: string, agentName: string): SquadMessage[] {
    return (this.messages.get(squadId) ?? [])
      .filter((m) => m.to.includes(agentName))
      .filter((m) => m.status !== 'resolved');
  }

  ackMessage(squadId: string, messageId: string, status: MessageStatus): boolean {
    const bucket = this.messages.get(squadId) ?? [];
    const target = bucket.find((m) => m.id === messageId);
    if (!target) return false;
    target.status = status;
    target.ackedAt = new Date().toISOString();
    return true;
  }

  storeMemory(input: StoreMemoryInput): { memoryId: string } {
    const id = this.id('mem');
    const memory: SquadMemory = {
      id,
      squadId: input.squadId,
      agentName: input.agentName,
      type: input.type,
      summary: redactSecrets(input.summary),
      details: redactSecrets(normalizeDetailsForTier(input.details ?? '', input.tier ?? 'hot')),
      tags: input.tags ?? [],
      confidence: clamp01(input.confidence ?? 0.7),
      accuracy: clamp01(input.accuracy ?? inferAccuracy(input.tier ?? 'hot', input.confidence ?? 0.7)),
      tier: input.tier ?? 'hot',
      usageCount: 0,
      lastAccessedAt: new Date().toISOString(),
      source: input.source ?? 'agent-observed',
      createdAt: new Date().toISOString(),
      expiresAt: input.expiresAt,
    };
    const bucket = this.memories.get(input.squadId) ?? [];
    bucket.push(memory);
    this.memories.set(input.squadId, bucket);
    return { memoryId: id };
  }

  queryMemories(input: QueryMemoriesInput): SquadMemory[] {
    const now = Date.now();
    return (this.memories.get(input.squadId) ?? [])
      .filter((m) => !input.agentName || m.agentName === input.agentName)
      .filter((m) => !input.type || m.type === input.type)
      .filter((m) => !input.tier || m.tier === input.tier)
      .filter((m) => !input.tags || input.tags.every((tag) => m.tags.includes(tag)))
      .filter((m) => !m.expiresAt || Date.parse(m.expiresAt) > now)
      .filter((m) => {
        if (!input.text) return true;
        const hay = `${m.summary}\n${m.details}\n${m.tags.join(' ')}`.toLowerCase();
        return hay.includes(input.text.toLowerCase());
      })
      .map((m) => ({ memory: m, score: scoreMemory(m, now) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, input.limit ?? 10)
      .map((x) => {
        const evolvedTier = evolveTier(x.memory);
        x.memory.usageCount += 1;
        x.memory.lastAccessedAt = new Date().toISOString();
        x.memory.tier = evolvedTier;
        return formatMemoryForTier(x.memory);
      });
  }

  handoff(input: { message: SendMessageInput; memory: StoreMemoryInput }): { messageId: string; memoryId: string } {
    const send = this.sendMessage(input.message);
    const store = this.storeMemory({
      ...input.memory,
      type: 'handoff',
      tags: [...(input.memory.tags ?? []), 'handoff'],
    });
    return { messageId: send.messageId, memoryId: store.memoryId };
  }

  private id(prefix: 'msg' | 'mem') {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
  }

  healthCheck(): { backend: 'memory'; status: 'ok' | 'degraded'; stats: Record<string, number | string> } {
    const messageCount = [...this.messages.values()].reduce((acc, bucket) => acc + bucket.length, 0);
    const memoryCount = [...this.memories.values()].reduce((acc, bucket) => acc + bucket.length, 0);
    return {
      backend: 'memory',
      status: 'ok',
      stats: {
        messageCount,
        memoryCount,
      },
    };
  }

  getSquadStats(squadId: string): { messages: number; memories: number } {
    return {
      messages: (this.messages.get(squadId) ?? []).length,
      memories: (this.memories.get(squadId) ?? []).length,
    };
  }
}

interface SqlMessageRow {
  id: string;
  squad_id: string;
  sender: string;
  recipients_json: string;
  subject: string;
  body: string;
  tags_json: string;
  correlation_id: string | null;
  status: MessageStatus;
  created_at: string;
  acked_at: string | null;
}

interface SqlMemoryRow {
  id: string;
  squad_id: string;
  agent_name: string;
  type: MemoryType;
  summary: string;
  details: string;
  tags_json: string;
  confidence: number;
  accuracy: number;
  tier: MemoryTier;
  usage_count: number;
  last_accessed_at: string;
  source: string;
  created_at: string;
  expires_at: string | null;
}

function rowToMessage(row: SqlMessageRow): SquadMessage {
  return {
    id: row.id,
    squadId: row.squad_id,
    from: row.sender,
    to: JSON.parse(row.recipients_json),
    subject: row.subject,
    body: row.body,
    tags: JSON.parse(row.tags_json),
    correlationId: row.correlation_id ?? undefined,
    status: row.status,
    createdAt: row.created_at,
    ackedAt: row.acked_at ?? undefined,
  };
}

function rowToMemory(row: SqlMemoryRow): SquadMemory {
  return {
    id: row.id,
    squadId: row.squad_id,
    agentName: row.agent_name,
    type: row.type,
    summary: row.summary,
    details: row.details,
    tags: JSON.parse(row.tags_json),
    confidence: row.confidence,
    accuracy: row.accuracy,
    tier: row.tier ?? 'hot',
    usageCount: row.usage_count ?? 0,
    lastAccessedAt: row.last_accessed_at ?? row.created_at,
    source: row.source,
    createdAt: row.created_at,
    expiresAt: row.expires_at ?? undefined,
  };
}

function scoreMemory(memory: SquadMemory, nowMs: number) {
  const ageMs = Math.max(0, nowMs - Date.parse(memory.createdAt));
  const ageHours = ageMs / (1000 * 60 * 60);
  const recency = 1 / (1 + ageHours / 24);
  const usageBoost = Math.min(memory.usageCount / 20, 1) * 0.15;
  const tierWeight = memory.tier === 'hot' ? 0.12 : memory.tier === 'cold' ? 0.06 : 0.02;
  return memory.confidence * 0.45 + memory.accuracy * 0.3 + recency * 0.1 + usageBoost + tierWeight;
}

function inferAccuracy(tier: MemoryTier, confidence: number): number {
  const base = clamp01(confidence);
  if (tier === 'long_term') return Math.max(base, 0.9);
  if (tier === 'cold') return Math.max(base, 0.75);
  return Math.max(base, 0.6);
}

function normalizeDetailsForTier(details: string, tier: MemoryTier): string {
  const clean = details.trim();
  if (tier === 'hot') return clean.slice(0, 320);
  if (tier === 'cold') return clean.slice(0, 3000);
  return clean;
}

function evolveTier(memory: SquadMemory): MemoryTier {
  const ageDays = Math.max(0, (Date.now() - Date.parse(memory.createdAt)) / (1000 * 60 * 60 * 24));

  if (memory.usageCount >= 8 && ageDays <= 14) return 'hot';
  if (memory.usageCount >= 2 || ageDays <= 60) return 'cold';
  return 'long_term';
}

function formatMemoryForTier(memory: SquadMemory): SquadMemory {
  if (memory.tier === 'hot') {
    return {
      ...memory,
      details: memory.details.slice(0, 320),
    };
  }
  if (memory.tier === 'long_term') {
    return {
      ...memory,
      accuracy: Math.max(memory.accuracy, 0.9),
    };
  }
  return memory;
}

function clamp01(value: number) {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function redactSecrets(text: string) {
  return text
    .replace(/(api[_-]?key\s*[:=]\s*)[^\s]+/gi, '$1[REDACTED]')
    .replace(/(token\s*[:=]\s*)[^\s]+/gi, '$1[REDACTED]')
    .replace(/(password\s*[:=]\s*)[^\s]+/gi, '$1[REDACTED]');
}
