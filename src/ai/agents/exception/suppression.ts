export interface SuppressionEntry {
  targetId: string;
  patchDiffHash: string;
  sourceVersion: number;
  rejectedAt: string;
}

export class ProposalSuppressionStore {
  private entries = new Map<string, SuppressionEntry>();

  private makeKey(targetId: string, patchDiffHash: string, sourceVersion: number): string {
    return `${targetId}::${patchDiffHash}::${sourceVersion}`;
  }

  public recordRejection(targetId: string, patchDiffHash: string, sourceVersion: number): void {
    const key = this.makeKey(targetId, patchDiffHash, sourceVersion);
    this.entries.set(key, {
      targetId,
      patchDiffHash,
      sourceVersion,
      rejectedAt: new Date().toISOString(),
    });
  }

  public isSuppressed(targetId: string, patchDiffHash: string, sourceVersion: number): boolean {
    const key = this.makeKey(targetId, patchDiffHash, sourceVersion);
    return this.entries.has(key);
  }

  public clear(): void {
    this.entries.clear();
  }
}

export const globalSuppressionStore = new ProposalSuppressionStore();
