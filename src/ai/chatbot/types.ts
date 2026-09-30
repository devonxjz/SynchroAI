import type { ProductSnapshot, WorkflowInput, WorkflowIntent } from '../workflows/prepare-listing/types.ts';
import type { Citation } from '../agents/assistant/types.ts';

export type ChatbotMode = 'live' | 'demo';

export interface DocumentChunk {
  id: string;
  documentId: string;
  documentVersion: number;
  tenantId: string;
  mode: ChatbotMode;
  content: string;
  startOffset: number;
  endOffset: number;
  hash: string;
  metadata?: Record<string, unknown>;
}

export interface ChunkerConfig {
  chunkSize?: number;
  chunkOverlap?: number;
  separators?: string[];
}

export interface VectorIndexRecord {
  id: string;
  chunkId: string;
  embedding: number[];
  tenantId: string;
  mode: ChatbotMode;
  documentId: string;
  version: number;
  content: string;
  contentHash: string;
  metadata?: Record<string, unknown>;
}

export interface VectorSearchFilter {
  tenantId: string;
  mode: ChatbotMode;
  documentId?: string;
}

export interface VectorSearchResult {
  chunk: DocumentChunk;
  score: number;
  citation: Citation;
}

export interface ShortTermTurn {
  role: 'user' | 'assistant' | 'system';
  content: string;
  estimatedTokens: number;
  timestamp: string;
}

export type MemoryType = 'preference' | 'entity' | 'rule';

export interface LongTermMemoryEntry {
  tenantId: string;
  userId: string;
  memoryType: MemoryType;
  key: string;
  value: Record<string, unknown> | string;
  version: number;
  updatedAt: string;
}

export interface ChatbotSessionContext {
  conversationId: string;
  tenantId: string;
  userId: string;
  mode: ChatbotMode;
  shortTermTurns: ShortTermTurn[];
  longTermMemories: LongTermMemoryEntry[];
}

export interface SourceReference {
  documentId: string;
  version: number;
  chunkId: string;
  startOffset: number;
  endOffset: number;
  factId?: string;
}

export interface ExtractedProductFact {
  id: string;
  fieldPath: string;
  value: string;
  unit?: string;
  sourceChunkId: string;
  startOffset: number;
  endOffset: number;
}

export type DraftStatus = 'draft' | 'needs_clarification' | 'ready' | 'activated';

export interface IntakeTaskDraft {
  draftId: string;
  tenantId: string;
  userId: string;
  mode: ChatbotMode;
  intent: WorkflowIntent;
  store: string;
  targetLocale: string;
  productSnapshot: ProductSnapshot;
  sourceRefs: SourceReference[];
  status: DraftStatus;
  version: number;
  draftHash: string;
  clarificationQuestions?: string[];
  createdAt: string;
  runId?: string;
}

export interface IntakeActivationResult {
  draftId: string;
  runId: string;
  status: string;
  activatedAt: string;
}

export interface DispatchedIntakeResult {
  draft: IntakeTaskDraft;
  workflowInput?: WorkflowInput;
  warnings: string[];
}

export interface IntakeApiRequest {
  message?: string;
  documentText?: string;
  documentId?: string;
  conversationId?: string;
  idempotencyKey?: string;
  store?: string;
  targetLocale?: string;
  intent?: WorkflowIntent;
}

export interface IntakeApiResponse {
  conversationId: string;
  answer: string;
  ragCitations: Citation[];
  longTermMemories: LongTermMemoryEntry[];
  draft?: IntakeTaskDraft;
  status: 'answered' | 'needs_clarification' | 'draft_ready' | 'error';
  asOf: string;
}
