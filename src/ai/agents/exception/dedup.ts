export interface TaskDedupComponents {
  tenantId: string;
  entityType: 'connection' | 'product' | 'order';
  targetId: string;
  storeId: string;
  mode: 'live' | 'demo';
  failureClass: string;
}

export interface StoredTaskRecord {
  dedupKey: string;
  tenantId: string;
  entityType: 'connection' | 'product' | 'order';
  targetId: string;
  storeId: string;
  mode: 'live' | 'demo';
  failureClass: string;
  titleVi: string;
  summaryVi: string;
  attemptCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  status: 'pending' | 'in_progress' | 'resolved' | 'dismissed';
}

export function computeTaskDedupKey(components: TaskDedupComponents): string {
  // If failure is auth_credential, the true entity is the store connection, not individual products
  const effectiveTargetId =
    components.failureClass === 'auth_credential' ? `conn_${components.storeId}` : components.targetId;

  return [
    components.tenantId,
    components.mode,
    components.storeId,
    components.entityType,
    effectiveTargetId,
    components.failureClass,
  ].join('::');
}

export class TaskDedupStore {
  private tasks = new Map<string, StoredTaskRecord>();

  public recordTask(
    components: TaskDedupComponents,
    titleVi: string,
    summaryVi: string
  ): StoredTaskRecord {
    const dedupKey = computeTaskDedupKey(components);
    const existing = this.tasks.get(dedupKey);
    const now = new Date().toISOString();

    if (existing) {
      existing.attemptCount += 1;
      existing.lastSeenAt = now;
      existing.summaryVi = summaryVi;
      this.tasks.set(dedupKey, existing);
      return existing;
    }

    const newTask: StoredTaskRecord = {
      dedupKey,
      tenantId: components.tenantId,
      entityType: components.entityType,
      targetId: components.failureClass === 'auth_credential' ? `conn_${components.storeId}` : components.targetId,
      storeId: components.storeId,
      mode: components.mode,
      failureClass: components.failureClass,
      titleVi,
      summaryVi,
      attemptCount: 1,
      firstSeenAt: now,
      lastSeenAt: now,
      status: 'pending',
    };
    this.tasks.set(dedupKey, newTask);
    return newTask;
  }

  public getTask(dedupKey: string): StoredTaskRecord | null {
    const task = this.tasks.get(dedupKey);
    return task ? { ...task } : null;
  }

  public listTasksByTenant(tenantId: string): StoredTaskRecord[] {
    return Array.from(this.tasks.values()).filter((t) => t.tenantId === tenantId);
  }

  public clear(): void {
    this.tasks.clear();
  }
}

export const globalTaskDedupStore = new TaskDedupStore();
