import { createHash } from 'node:crypto';
import { BudgetLedger } from '../model-call/budget.ts';
import type { ChatbotMode } from './types.ts';

export const globalEmbeddingBudgetLedger = new BudgetLedger();

export interface EmbeddingOptions {
  model?: string;
  dimensions?: number;
  budgetLedger?: BudgetLedger;
  apiKey?: string;
}

export interface EmbeddingResult {
  embedding: number[];
  tokensUsed: number;
  cached: boolean;
}

export interface BatchEmbeddingResult {
  embeddings: number[][];
  totalTokensUsed: number;
  cacheHits: number;
}

export class EmbeddingCache {
  private cache = new Map<string, number[]>();

  public get(key: string): number[] | undefined {
    return this.cache.get(key);
  }

  public set(key: string, embedding: number[]): void {
    this.cache.set(key, embedding);
  }

  public clear(): void {
    this.cache.clear();
  }

  public size(): number {
    return this.cache.size;
  }
}

export class OpenAIEmbeddingProvider {
  private model: string;
  private dimensions: number;
  private apiKey?: string;
  private budgetLedger?: BudgetLedger;
  private cache: EmbeddingCache;

  constructor(options: EmbeddingOptions = {}) {
    this.model = options.model ?? 'text-embedding-3-small';
    this.dimensions = options.dimensions ?? 1536;
    this.apiKey = options.apiKey || process.env.OPENAI_API_KEY;
    this.budgetLedger = options.budgetLedger ?? globalEmbeddingBudgetLedger;
    this.cache = new EmbeddingCache();
  }

  public getCache(): EmbeddingCache {
    return this.cache;
  }

  public async embedText(
    text: string,
    context?: { tenantId?: string; mode?: ChatbotMode }
  ): Promise<EmbeddingResult> {
    const trimmed = text.trim();
    const contentHash = createHash('sha256').update(trimmed).digest('hex');
    const cacheKey = `${this.model}:${contentHash}`;

    const cached = this.cache.get(cacheKey);
    if (cached) {
      return {
        embedding: [...cached],
        tokensUsed: 0,
        cached: true,
      };
    }

    const estimatedTokens = Math.max(1, Math.ceil(trimmed.length / 4));
    let embedding: number[];

    if (this.apiKey && context?.mode === 'live') {
      embedding = await this.callLiveApi(trimmed);
    } else {
      embedding = this.generateDeterministicVector(trimmed);
    }

    // Normalize embedding vector to unit length
    embedding = this.normalizeVector(embedding);

    // Save to cache
    this.cache.set(cacheKey, embedding);

    // Record token usage if budget ledger provided
    if (this.budgetLedger && context?.tenantId) {
      const costUsd = (estimatedTokens * 0.00002) / 1000;
      this.budgetLedger.reserve(context.tenantId, costUsd);
      this.budgetLedger.commit(context.tenantId, costUsd, costUsd);
    }

    return {
      embedding,
      tokensUsed: estimatedTokens,
      cached: false,
    };
  }

  public async embedChunks(
    texts: string[],
    context?: { tenantId?: string; mode?: ChatbotMode }
  ): Promise<BatchEmbeddingResult> {
    const embeddings: number[][] = [];
    let totalTokensUsed = 0;
    let cacheHits = 0;

    // Batch in chunks of up to 20
    const batchSize = 20;
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      for (const text of batch) {
        const res = await this.embedText(text, context);
        embeddings.push(res.embedding);
        totalTokensUsed += res.tokensUsed;
        if (res.cached) {
          cacheHits++;
        }
      }
    }

    return {
      embeddings,
      totalTokensUsed,
      cacheHits,
    };
  }

  private async callLiveApi(text: string): Promise<number[]> {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        input: text,
        model: this.model,
        dimensions: this.dimensions,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI Embedding API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.data[0].embedding;
  }

  public generateDeterministicVector(text: string): number[] {
    const vector = new Array<number>(this.dimensions).fill(0);
    const words = text.toLowerCase().match(/[\p{L}\d]+/gu) || [text];

    for (const word of words) {
      const wordHash = createHash('sha256').update(word).digest();
      for (let i = 0; i < this.dimensions; i++) {
        const b = wordHash[i % wordHash.length];
        const val = (b / 255) * 2 - 1; // -1.0 to 1.0
        vector[i] += val;
      }
    }

    return this.normalizeVector(vector);
  }

  private normalizeVector(vector: number[]): number[] {
    let sumSq = 0;
    for (let i = 0; i < vector.length; i++) {
      sumSq += vector[i] * vector[i];
    }
    const norm = Math.sqrt(sumSq) || 1.0;
    return vector.map((v) => v / norm);
  }
}
