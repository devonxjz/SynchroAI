import type { Citation } from '../agents/assistant/types.ts';
import { RecursiveTextChunker } from './chunker.ts';
import { OpenAIEmbeddingProvider } from './embeddings.ts';
import type {
  ChatbotMode,
  DocumentChunk,
  VectorIndexRecord,
  VectorSearchResult,
} from './types.ts';
import { TenantIsolatedVectorStore, globalVectorStore } from './vector-store.ts';

export interface RagIngestOptions {
  documentId: string;
  documentVersion?: number;
  tenantId: string;
  mode?: ChatbotMode;
  title?: string;
  metadata?: Record<string, unknown>;
}

export interface RagQueryOptions {
  tenantId: string;
  mode?: ChatbotMode;
  documentId?: string;
  topK?: number;
  scoreThreshold?: number;
}

export interface RagRetrievalOutput {
  results: VectorSearchResult[];
  citations: Citation[];
  formattedContext: string;
}

export class RagRetrieverPipeline {
  private chunker: RecursiveTextChunker;
  private embeddingProvider: OpenAIEmbeddingProvider;
  private vectorStore: TenantIsolatedVectorStore;

  constructor(options?: {
    chunker?: RecursiveTextChunker;
    embeddingProvider?: OpenAIEmbeddingProvider;
    vectorStore?: TenantIsolatedVectorStore;
  }) {
    this.chunker = options?.chunker || new RecursiveTextChunker({ chunkSize: 60, chunkOverlap: 15 });
    this.embeddingProvider = options?.embeddingProvider || new OpenAIEmbeddingProvider();
    this.vectorStore = options?.vectorStore || globalVectorStore;
  }

  public async ingestDocument(
    text: string,
    options: RagIngestOptions
  ): Promise<DocumentChunk[]> {
    const mode = options.mode || 'demo';
    // Purge old versions of this documentId to avoid stale chunks
    this.vectorStore.deleteDocument(options.tenantId, mode, options.documentId);

    const chunks = this.chunker.chunkText(text, {
      documentId: options.documentId,
      documentVersion: options.documentVersion || 1,
      tenantId: options.tenantId,
      mode,
      metadata: {
        title: options.title || options.documentId,
        ...options.metadata,
      },
    });

    if (chunks.length === 0) {
      return [];
    }

    const textsToEmbed = chunks.map((c) => c.content);
    const { embeddings } = await this.embeddingProvider.embedChunks(textsToEmbed, {
      tenantId: options.tenantId,
      mode,
    });

    const records: VectorIndexRecord[] = chunks.map((chunk, idx) => ({
      id: `vec_${chunk.id}`,
      chunkId: chunk.id,
      embedding: embeddings[idx],
      tenantId: options.tenantId,
      mode,
      documentId: chunk.documentId,
      version: chunk.documentVersion,
      content: chunk.content,
      contentHash: chunk.hash,
      metadata: {
        startOffset: chunk.startOffset,
        endOffset: chunk.endOffset,
        title: options.title || options.documentId,
        ...options.metadata,
      },
    }));

    this.vectorStore.addRecords(records);
    return chunks;
  }

  public async retrieve(
    query: string,
    options: RagQueryOptions
  ): Promise<RagRetrievalOutput> {
    const mode = options.mode || 'demo';
    const topK = options.topK ?? 5;
    const scoreThreshold = options.scoreThreshold ?? 0.70;

    const { embedding: queryVector } = await this.embeddingProvider.embedText(query, {
      tenantId: options.tenantId,
      mode,
    });

    const results = this.vectorStore.similaritySearch(
      queryVector,
      {
        tenantId: options.tenantId,
        mode,
        documentId: options.documentId,
      },
      topK,
      scoreThreshold
    );

    const citations: Citation[] = results.map((r) => r.citation);
    const formattedContext = results
      .map((r, i) => {
        const title = r.citation.title || r.chunk.documentId;
        return `[Tài liệu ${i + 1}: ${title}] (Đoạn: ${r.chunk.id}, Độ tương đồng: ${r.score.toFixed(2)})\n${r.chunk.content}`;
      })
      .join('\n\n');

    return {
      results,
      citations,
      formattedContext,
    };
  }

  public getVectorStore(): TenantIsolatedVectorStore {
    return this.vectorStore;
  }
}

export const globalRagPipeline = new RagRetrieverPipeline();
