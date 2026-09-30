import { redactString } from '../agents/exception/sanitizer.ts';
import type { ServerContext, UserRole } from '../agents/assistant/types.ts';
import type {
  ChatbotSessionContext,
  LongTermMemoryEntry,
  MemoryType,
  ShortTermTurn,
} from './types.ts';

const PHONE_REGEX = /(?:\+84|0)[1-9]\d{8,9}\b/g;

export function redactPiiContent(text: string, role: UserRole): string {
  if (role !== 'viewer') {
    return text;
  }
  const phoneMasked = text.replace(PHONE_REGEX, '[REDACTED_PHONE]');
  return redactString(phoneMasked);
}

export class WindowBufferHistory {
  private turns: ShortTermTurn[] = [];
  private maxTurns: number;
  private tokenCeiling: number;

  constructor(options: { maxTurns?: number; tokenCeiling?: number } = {}) {
    this.maxTurns = options.maxTurns ?? 6;
    this.tokenCeiling = options.tokenCeiling ?? 2000;
  }

  public addTurn(role: 'user' | 'assistant' | 'system', content: string): void {
    const estimatedTokens = Math.max(1, Math.ceil(content.length / 4));
    const turn: ShortTermTurn = {
      role,
      content,
      estimatedTokens,
      timestamp: new Date().toISOString(),
    };

    this.turns.push(turn);
    this.prune();
  }

  public getTurns(userRole: UserRole = 'admin'): ShortTermTurn[] {
    return this.turns.map((turn) => ({
      ...turn,
      content: redactPiiContent(turn.content, userRole),
    }));
  }

  public getTotalTokens(): number {
    return this.turns.reduce((sum, t) => sum + t.estimatedTokens, 0);
  }

  public clear(): void {
    this.turns = [];
  }

  private prune(): void {
    // 1. Prune by turn count
    if (this.turns.length > this.maxTurns) {
      this.turns = this.turns.slice(this.turns.length - this.maxTurns);
    }

    // 2. Prune by token ceiling
    while (this.turns.length > 1 && this.getTotalTokens() > this.tokenCeiling) {
      this.turns.shift();
    }
  }
}

export class LongTermMemoryStore {
  // Keyed by `${tenantId}:${userId}`
  private store = new Map<string, LongTermMemoryEntry[]>();

  private getStoreKey(tenantId: string, userId: string): string {
    return `${tenantId}:${userId}`;
  }

  public saveMemory(
    entry: Omit<LongTermMemoryEntry, 'version' | 'updatedAt'>
  ): LongTermMemoryEntry {
    const key = this.getStoreKey(entry.tenantId, entry.userId);
    if (!this.store.has(key)) {
      this.store.set(key, []);
    }
    const list = this.store.get(key)!;
    const existingIndex = list.findIndex(
      (m) => m.memoryType === entry.memoryType && m.key === entry.key
    );

    const now = new Date().toISOString();
    let saved: LongTermMemoryEntry;

    if (existingIndex >= 0) {
      const current = list[existingIndex];
      saved = {
        ...entry,
        version: current.version + 1,
        updatedAt: now,
      };
      list[existingIndex] = saved;
    } else {
      saved = {
        ...entry,
        version: 1,
        updatedAt: now,
      };
      list.push(saved);
    }

    return saved;
  }

  public getMemories(
    tenantId: string,
    userId: string,
    memoryType?: MemoryType
  ): LongTermMemoryEntry[] {
    const key = this.getStoreKey(tenantId, userId);
    const list = this.store.get(key) || [];
    if (!memoryType) {
      return [...list];
    }
    return list.filter((m) => m.memoryType === memoryType);
  }

  public clear(): void {
    this.store.clear();
  }
}

export class ChatbotContextManager {
  private sessionHistories = new Map<string, WindowBufferHistory>();
  private longTermStore: LongTermMemoryStore;

  constructor(longTermStore?: LongTermMemoryStore) {
    this.longTermStore = longTermStore || new LongTermMemoryStore();
  }

  public getLongTermStore(): LongTermMemoryStore {
    return this.longTermStore;
  }

  public recordTurn(
    conversationId: string,
    role: 'user' | 'assistant' | 'system',
    content: string
  ): void {
    if (!this.sessionHistories.has(conversationId)) {
      this.sessionHistories.set(conversationId, new WindowBufferHistory());
    }
    const history = this.sessionHistories.get(conversationId)!;
    history.addTurn(role, content);
  }

  public getSessionBundle(
    context: ServerContext,
    conversationId: string
  ): ChatbotSessionContext {
    let history = this.sessionHistories.get(conversationId);
    if (!history) {
      history = new WindowBufferHistory();
      this.sessionHistories.set(conversationId, history);
    }

    const shortTermTurns = history.getTurns(context.role);
    const longTermMemories = this.longTermStore.getMemories(context.tenantId, context.userId);

    return {
      conversationId,
      tenantId: context.tenantId,
      userId: context.userId,
      mode: context.mode,
      shortTermTurns,
      longTermMemories,
    };
  }

  public clear(): void {
    this.sessionHistories.clear();
    this.longTermStore.clear();
  }
}

export const globalContextManager = new ChatbotContextManager();
