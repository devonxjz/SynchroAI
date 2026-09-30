import { createHash, randomUUID } from 'node:crypto';
import type { ServerContext } from '../agents/assistant/types.ts';
import { PrepareListingOrchestrator } from '../workflows/prepare-listing/orchestrator.ts';
import type {
  ProductSnapshot,
  WorkflowInput,
  WorkflowIntent,
  WorkflowState,
} from '../workflows/prepare-listing/types.ts';
import type {
  DispatchedIntakeResult,
  DocumentChunk,
  ExtractedProductFact,
  IntakeActivationResult,
  IntakeTaskDraft,
  SourceReference,
} from './types.ts';

export interface CreateDraftOptions {
  context: ServerContext;
  text: string;
  retrievedChunks?: DocumentChunk[];
  store?: string;
  targetLocale?: string;
  intent?: WorkflowIntent;
  documentId?: string;
  documentVersion?: number;
}

export interface ActivateDraftOptions {
  draftId: string;
  expectedVersion: number;
  expectedHash: string;
  idempotencyKey: string;
  context: ServerContext;
  orchestrator?: PrepareListingOrchestrator;
  retryRunId?: string;
  retryStepName?: string;
}

interface StoredActivation {
  idempotencyKey: string;
  draftId: string;
  expectedHash: string;
  runId: string;
  status: string;
  activatedAt: string;
}

export class IntakeTaskDispatcher {
  private drafts = new Map<string, IntakeTaskDraft>();
  private activations = new Map<string, StoredActivation>();
  private orchestrator: PrepareListingOrchestrator;

  constructor(orchestrator?: PrepareListingOrchestrator) {
    this.orchestrator = orchestrator || new PrepareListingOrchestrator();
  }

  public getOrchestrator(): PrepareListingOrchestrator {
    return this.orchestrator;
  }

  public getDraft(draftId: string, context: ServerContext): IntakeTaskDraft | null {
    const draft = this.drafts.get(draftId);
    if (!draft) return null;
    if (draft.tenantId !== context.tenantId || draft.mode !== context.mode) {
      return null;
    }
    return draft;
  }

  public createDraft(options: CreateDraftOptions): DispatchedIntakeResult {
    const { context, text, retrievedChunks = [] } = options;
    const store = options.store || 'Shopee VN';
    const targetLocale = options.targetLocale || 'vi';
    const intent = options.intent || 'prepare_listing';
    const docId = options.documentId || `doc_${Date.now()}`;
    const docVersion = options.documentVersion || 1;

    const extracted = this.extractProductInfo(text, retrievedChunks);
    const warnings: string[] = [];

    // Construct ProductSnapshot
    const snapshotRaw = JSON.stringify({
      title: extracted.title,
      description: extracted.description,
      attributes: extracted.attributes,
      language: 'vi',
    });
    const snapshotHash = createHash('sha256').update(snapshotRaw).digest('hex');
    const snapshotId = `prod_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    const productSnapshot: ProductSnapshot = {
      id: snapshotId,
      version: 1,
      hash: snapshotHash,
      title: extracted.title,
      description: extracted.description,
      attributes: extracted.attributes,
      language: 'vi',
    };

    // Construct SourceReferences linking facts to chunks
    const sourceRefs: SourceReference[] = extracted.facts.map((fact) => ({
      documentId: docId,
      version: docVersion,
      chunkId: fact.sourceChunkId,
      startOffset: fact.startOffset,
      endOffset: fact.endOffset,
      factId: fact.id,
    }));

    // If no chunks provided, add a default fallback source ref
    if (sourceRefs.length === 0 && retrievedChunks.length > 0) {
      const firstChunk = retrievedChunks[0];
      sourceRefs.push({
        documentId: firstChunk.documentId,
        version: firstChunk.documentVersion,
        chunkId: firstChunk.id,
        startOffset: firstChunk.startOffset,
        endOffset: firstChunk.endOffset,
      });
    }

    // Determine status & clarification questions
    let status: IntakeTaskDraft['status'] = 'ready';
    const clarificationQuestions: string[] = [];

    if (!extracted.title || extracted.title === 'Sản phẩm chưa đặt tên') {
      status = 'needs_clarification';
      clarificationQuestions.push('Vui lòng cung cấp tên sản phẩm cụ thể.');
    }
    if (Object.keys(extracted.attributes).length === 0) {
      warnings.push('Chưa tìm thấy thông số kỹ thuật hoặc quy cách đóng gói cụ thể.');
    }

    const draftId = `draft_${randomUUID()}`;
    const draftHash = createHash('sha256')
      .update(
        JSON.stringify({
          snapshotId,
          snapshotVersion: 1,
          snapshotHash,
          intent,
          store,
          targetLocale,
        })
      )
      .digest('hex');

    const draft: IntakeTaskDraft = {
      draftId,
      tenantId: context.tenantId,
      userId: context.userId,
      mode: context.mode,
      intent,
      store,
      targetLocale,
      productSnapshot,
      sourceRefs,
      status,
      version: 1,
      draftHash,
      clarificationQuestions: clarificationQuestions.length > 0 ? clarificationQuestions : undefined,
      createdAt: new Date().toISOString(),
    };

    this.drafts.set(draftId, draft);

    return {
      draft,
      warnings,
    };
  }

  public async activateDraft(options: ActivateDraftOptions): Promise<IntakeActivationResult> {
    const { draftId, expectedVersion, expectedHash, idempotencyKey, context } = options;

    // 1. Role verification
    if (context.role === 'viewer') {
      throw new Error('Người dùng vai trò Viewer không có quyền kích hoạt quy trình soạn bài.');
    }

    // 2. Idempotency and concurrency check first
    const existingActivation = this.activations.get(idempotencyKey);
    if (existingActivation) {
      if (
        existingActivation.draftId !== draftId ||
        existingActivation.expectedHash !== expectedHash
      ) {
        throw new Error('Xung đột khóa bất biến với nội dung bản nháp khác.');
      }
      return {
        draftId: existingActivation.draftId,
        runId: existingActivation.runId,
        status: existingActivation.status,
        activatedAt: existingActivation.activatedAt,
      };
    }

    // 3. Fetch draft with tenant and mode isolation
    const draft = this.getDraft(draftId, context);
    if (!draft) {
      throw new Error(`Bản nháp ${draftId} không tồn tại hoặc không thuộc doanh nghiệp.`);
    }

    // 4. Verify version and hash consistency
    if (draft.version !== expectedVersion || draft.draftHash !== expectedHash) {
      throw new Error(
        `Bản nháp đã thay đổi hoặc không khớp phiên bản. Dự kiến: v${expectedVersion} (${expectedHash}), hiện tại: v${draft.version} (${draft.draftHash})`
      );
    }

    // If draft was already activated under another key, return its runId
    if (draft.status === 'activated' && draft.runId) {
      return {
        draftId: draft.draftId,
        runId: draft.runId,
        status: 'already_activated',
        activatedAt: draft.createdAt,
      };
    }

    const orchestrator = options.orchestrator || this.orchestrator;
    let state: WorkflowState;

    if (options.retryRunId && options.retryStepName) {
      state = await orchestrator.retryStep(
        options.retryRunId,
        options.retryStepName,
        draft.productSnapshot
      );
    } else if (draft.intent === 'retry_step') {
      throw new Error('Yêu cầu thử lại bước (retry_step) bắt buộc cung cấp runId và stepName.');
    } else {
      const workflowInput: WorkflowInput = {
        eventId: `evt_${randomUUID()}`,
        tenantId: draft.tenantId,
        mode: draft.mode,
        store: draft.store,
        targetLocale: draft.targetLocale,
        intent: draft.intent,
        productSnapshot: draft.productSnapshot,
      };
      state = await orchestrator.start(workflowInput);
    }

    const activatedAt = new Date().toISOString();
    draft.status = 'activated';
    draft.runId = state.runId;

    const activationRecord: StoredActivation = {
      idempotencyKey,
      draftId,
      expectedHash,
      runId: state.runId,
      status: state.status,
      activatedAt,
    };
    this.activations.set(idempotencyKey, activationRecord);

    return {
      draftId,
      runId: state.runId,
      status: state.status,
      activatedAt,
    };
  }

  public clear(): void {
    this.drafts.clear();
    this.activations.clear();
  }

  private extractProductInfo(
    text: string,
    chunks: DocumentChunk[]
  ): {
    title: string;
    description: string;
    attributes: Record<string, string>;
    facts: ExtractedProductFact[];
  } {
    const attributes: Record<string, string> = {};
    const facts: ExtractedProductFact[] = [];
    let title = '';

    // Title extraction heuristics
    const titleMatch = text.match(/(?:tên sản phẩm|sản phẩm|tiêu đề):\s*([^\n.,;]+)/i);
    if (titleMatch) {
      title = titleMatch[1].trim();
    } else {
      // First line if short
      const firstLine = text.split('\n')[0].trim();
      if (firstLine.length > 5 && firstLine.length <= 100) {
        title = firstLine;
      } else {
        title = 'Sản phẩm mới';
      }
    }

    // Weight extraction: e.g. 500g, 250g, 1kg
    const weightMatch = text.match(/(\d+(?:\.\d+)?)\s*(g|kg|gram|gam|ml|l)\b/i);
    if (weightMatch) {
      const weightVal = `${weightMatch[1]}${weightMatch[2].toLowerCase()}`;
      attributes['weight'] = weightVal;
      const chunk = this.findMatchingChunk(weightMatch[0], chunks);
      facts.push({
        id: 'fact_weight',
        fieldPath: 'weight',
        value: weightVal,
        unit: weightMatch[2].toLowerCase(),
        sourceChunkId: chunk ? chunk.id : 'chk_inline',
        startOffset: weightMatch.index || 0,
        endOffset: (weightMatch.index || 0) + weightMatch[0].length,
      });
    }

    // Origin extraction: e.g. Đắk Lắk, Lâm Đồng, Việt Nam
    const originMatch = text.match(/(?:xuất xứ|nguồn gốc|tại|từ)\s*:?\s*([^\n.,;]+)/i);
    if (originMatch) {
      const originVal = originMatch[1].trim();
      attributes['origin'] = originVal;
      const chunk = this.findMatchingChunk(originVal, chunks);
      facts.push({
        id: 'fact_origin',
        fieldPath: 'origin',
        value: originVal,
        sourceChunkId: chunk ? chunk.id : 'chk_inline',
        startOffset: originMatch.index || 0,
        endOffset: (originMatch.index || 0) + originMatch[0].length,
      });
    }

    // Brand extraction
    const brandMatch = text.match(/(?:thương hiệu|brand|nhãn hiệu):\s*([^\n.,;]+)/i);
    if (brandMatch) {
      const brandVal = brandMatch[1].trim();
      attributes['brand'] = brandVal;
      const chunk = this.findMatchingChunk(brandVal, chunks);
      facts.push({
        id: 'fact_brand',
        fieldPath: 'brand',
        value: brandVal,
        sourceChunkId: chunk ? chunk.id : 'chk_inline',
        startOffset: brandMatch.index || 0,
        endOffset: (brandMatch.index || 0) + brandMatch[0].length,
      });
    }

    const description = text.trim();

    return {
      title,
      description,
      attributes,
      facts,
    };
  }

  private findMatchingChunk(keyword: string, chunks: DocumentChunk[]): DocumentChunk | undefined {
    const kw = keyword.toLowerCase();
    return chunks.find((c) => c.content.toLowerCase().includes(kw));
  }
}

export const globalIntakeDispatcher = new IntakeTaskDispatcher();
