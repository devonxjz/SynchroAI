import type { AssistantResponse, ServerContext } from './types.ts';
import { redactString } from '../exception/sanitizer.ts';

export interface IdempotencyEntry {
  scopedKey: string;
  payloadHash: string;
  status: 'in_progress' | 'completed';
  createdAt: number;
  response?: AssistantResponse;
}

export class IdempotencyConflictError extends Error {
  public readonly code = 'IDEMPOTENCY_CONFLICT';
  constructor(message: string) {
    super(message);
    this.name = 'IdempotencyConflictError';
  }
}

export class IdempotencyManager {
  private entries = new Map<string, IdempotencyEntry>();

  private computeScopedKey(context: ServerContext, idempotencyKey: string): string {
    return [context.tenantId, context.userId, context.mode, idempotencyKey].join('::');
  }

  private hashMessage(message: string): string {
    let hash = 0;
    for (let i = 0; i < message.length; i++) {
      hash = (hash << 5) - hash + message.charCodeAt(i);
      hash |= 0;
    }
    return `hash_${hash}`;
  }

  public acquireLock(
    context: ServerContext,
    idempotencyKey: string,
    message: string
  ): { acquired: boolean; existingResponse?: AssistantResponse } {
    const scopedKey = this.computeScopedKey(context, idempotencyKey);
    const payloadHash = this.hashMessage(message);
    const existing = this.entries.get(scopedKey);

    if (existing) {
      // Check payload mismatch
      if (existing.payloadHash !== payloadHash) {
        throw new IdempotencyConflictError(
          `Cùng khóa bất biến ${idempotencyKey} nhưng nội dung yêu cầu khác nhau.`
        );
      }

      if (existing.status === 'in_progress') {
        return { acquired: false };
      }

      if (existing.status === 'completed' && existing.response) {
        // Re-verify current active permissions before returning cached idempotent response
        const safeResponse = { ...existing.response };
        if (context.role === 'viewer') {
          safeResponse.answer = redactString(safeResponse.answer);
        }
        return { acquired: false, existingResponse: safeResponse };
      }
    }

    // Acquire lock
    this.entries.set(scopedKey, {
      scopedKey,
      payloadHash,
      status: 'in_progress',
      createdAt: Date.now(),
    });

    return { acquired: true };
  }

  public complete(context: ServerContext, idempotencyKey: string, response: AssistantResponse): void {
    const scopedKey = this.computeScopedKey(context, idempotencyKey);
    const existing = this.entries.get(scopedKey);
    if (!existing) return;

    existing.status = 'completed';
    existing.response = response;
    this.entries.set(scopedKey, existing);
  }

  public clear(): void {
    this.entries.clear();
  }
}

export const globalIdempotencyManager = new IdempotencyManager();
