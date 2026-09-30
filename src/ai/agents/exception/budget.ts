import type { ActionBudgetRecord, AttemptToken } from './types.ts';

export class AtomicRetryBudgetManager {
  private records = new Map<string, ActionBudgetRecord>();
  private processedAttempts = new Set<string>();

  public getRecord(actionId: string): ActionBudgetRecord | null {
    const record = this.records.get(actionId);
    if (!record) return null;
    return { ...record };
  }

  public initActionBudget(actionId: string, maxRetries = 2): ActionBudgetRecord {
    const existing = this.records.get(actionId);
    if (existing) return existing;

    const record: ActionBudgetRecord = {
      actionId,
      initialAttemptUsed: false,
      maxRetries,
      retriesUsed: 0,
      exhausted: false,
    };
    this.records.set(actionId, record);
    return record;
  }

  public isEventAlreadyProcessed(eventIdOrAttemptKey: string): boolean {
    return this.processedAttempts.has(eventIdOrAttemptKey);
  }

  public markEventProcessed(eventIdOrAttemptKey: string): void {
    this.processedAttempts.add(eventIdOrAttemptKey);
  }

  public claimAttemptToken(
    actionId: string,
    attemptId: string,
    maxRetries = 2,
    delayMs = 1000
  ): AttemptToken | null {
    // If the queue redelivers the exact same attemptId, don't double charge budget
    if (this.processedAttempts.has(attemptId)) {
      return null;
    }

    let record = this.records.get(actionId);
    if (!record) {
      record = this.initActionBudget(actionId, maxRetries);
    }

    if (record.exhausted) {
      return null;
    }

    const now = Date.now();
    if (record.nextAllowedAt) {
      const allowedTime = new Date(record.nextAllowedAt).getTime();
      if (now < allowedTime) {
        return null;
      }
    }

    // First attempt
    if (!record.initialAttemptUsed) {
      record.initialAttemptUsed = true;
      record.lastAttemptId = attemptId;
      this.processedAttempts.add(attemptId);
      this.records.set(actionId, record);

      return {
        actionId,
        attemptNumber: 1,
        maxAttempts: 1 + record.maxRetries,
        issuedAt: new Date(now).toISOString(),
        token: `token_${actionId}_1_${now}`,
      };
    }

    // Subsequent retries
    if (record.retriesUsed >= record.maxRetries) {
      record.exhausted = true;
      this.records.set(actionId, record);
      return null;
    }

    record.retriesUsed += 1;
    const attemptNumber = 1 + record.retriesUsed;
    if (record.retriesUsed >= record.maxRetries) {
      record.exhausted = true;
    }

    record.nextAllowedAt = new Date(now + delayMs).toISOString();
    record.lastAttemptId = attemptId;
    this.processedAttempts.add(attemptId);
    this.records.set(actionId, record);

    return {
      actionId,
      attemptNumber,
      maxAttempts: 1 + record.maxRetries,
      issuedAt: new Date(now).toISOString(),
      token: `token_${actionId}_${attemptNumber}_${now}`,
    };
  }

  public clear(): void {
    this.records.clear();
    this.processedAttempts.clear();
  }
}

export const globalRetryBudget = new AtomicRetryBudgetManager();
