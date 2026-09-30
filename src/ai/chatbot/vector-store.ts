import type {
  ChatbotMode,
  DocumentChunk,
  VectorIndexRecord,
  VectorSearchFilter,
  VectorSearchResult,
} from './types.ts';

export class TenantIsolatedVectorStore {
  // Map keyed by `${tenantId}:${mode}` to guarantee physical memory partition
  private partitions = new Map<string, VectorIndexRecord[]>();

  private getPartitionKey(tenantId: string, mode: ChatbotMode): string {
    return `${tenantId}:${mode}`;
  }

  public addRecords(records: VectorIndexRecord[]): void {
    for (const record of records) {
      const key = this.getPartitionKey(record.tenantId, record.mode);
      if (!this.partitions.has(key)) {
        this.partitions.set(key, []);
      }
      const list = this.partitions.get(key)!;
      // Overwrite if chunk already exists
      const existingIndex = list.findIndex((r) => r.chunkId === record.chunkId);
      if (existingIndex >= 0) {
        list[existingIndex] = record;
      } else {
        list.push(record);
      }
    }
  }

  public similaritySearch(
    queryVector: number[],
    filter: VectorSearchFilter,
    topK = 5,
    scoreThreshold = 0.70
  ): VectorSearchResult[] {
    const key = this.getPartitionKey(filter.tenantId, filter.mode);
    const partition = this.partitions.get(key);
    if (!partition || partition.length === 0) {
      return [];
    }

    const scored: Array<{ record: VectorIndexRecord; score: number }> = [];

    for (const record of partition) {
      // Optional documentId filter
      if (filter.documentId && record.documentId !== filter.documentId) {
        continue;
      }

      const score = this.computeCosineSimilarity(queryVector, record.embedding);
      if (score >= scoreThreshold) {
        scored.push({ record, score });
      }
    }

    // Sort descending by score
    scored.sort((a, b) => b.score - a.score);
    const topResults = scored.slice(0, topK);

    return topResults.map(({ record, score }) => {
      const chunk: DocumentChunk = {
        id: record.chunkId,
        documentId: record.documentId,
        documentVersion: record.version,
        tenantId: record.tenantId,
        mode: record.mode,
        content: record.content,
        startOffset: (record.metadata?.startOffset as number) || 0,
        endOffset: (record.metadata?.endOffset as number) || record.content.length,
        hash: record.contentHash,
        metadata: record.metadata,
      };

      return {
        chunk,
        score,
        citation: {
          recordType: 'product',
          recordId: record.documentId,
          version: record.version,
          internalUrl: `/dashboard/catalog/${record.documentId}#chunk-${record.chunkId}`,
          title: (record.metadata?.title as string) || `Tài liệu ${record.documentId}`,
        },
      };
    });
  }

  public deleteDocument(tenantId: string, mode: ChatbotMode, documentId: string): void {
    const key = this.getPartitionKey(tenantId, mode);
    const partition = this.partitions.get(key);
    if (!partition) return;

    this.partitions.set(
      key,
      partition.filter((r) => r.documentId !== documentId)
    );
  }

  public clear(): void {
    this.partitions.clear();
  }

  public getRecordCount(tenantId: string, mode: ChatbotMode): number {
    const key = this.getPartitionKey(tenantId, mode);
    return this.partitions.get(key)?.length || 0;
  }

  private computeCosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) return 0;

    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dot += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}

export const globalVectorStore = new TenantIsolatedVectorStore();
