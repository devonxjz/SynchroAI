import { createHash } from 'node:crypto';
import type { ServerContext } from '../agents/assistant/types.ts';
import { ModelCallGateway } from '../model-call/gateway.ts';
import type { ModelCallRequest, RuntimeContext } from '../model-call/types.ts';
import { globalContextManager } from './context-manager.ts';
import { globalIntakeDispatcher } from './dispatcher.ts';
import { globalRagPipeline } from './rag.ts';
import type {
  DocumentChunk,
  IntakeApiRequest,
  IntakeApiResponse,
  VectorSearchResult,
} from './types.ts';

export interface HandleIntakeOptions {
  gateway?: ModelCallGateway;
}

export interface HandleIntakeResult {
  status: number;
  body: IntakeApiResponse & { generatedBy?: string };
}

const INTAKE_SYSTEM_INSTRUCTION =
  'Bạn là trợ lý tiếp nhận quy cách sản phẩm Synchro – chuyên gia thương mại điện tử.\n' +
  'Xác nhận đã tiếp nhận và phân tích thông tin sản phẩm dựa trên tiêu đề và ngữ cảnh RAG được cung cấp.\n' +
  'Nêu rõ bản nháp nhiệm vụ đã sẵn sàng để người dùng xem trước và kích hoạt quy trình soạn bài đa sàn.\n' +
  'Output PHẢI là JSON hợp lệ: {"answer":"<câu trả lời tiếng Việt>"}';

export async function handleIntakeRequest(
  context: ServerContext,
  body: IntakeApiRequest,
  options?: HandleIntakeOptions
): Promise<HandleIntakeResult> {
  const {
    message = '',
    documentText = '',
    documentId,
    conversationId,
    store = 'Shopee VN',
    targetLocale = 'vi',
    intent = 'prepare_listing',
  } = body;

  const convId = conversationId || `conv_intake_${Date.now()}`;
  const effectiveDocId = documentId || `doc_${Date.now()}`;

  // 1. Ingest document if supplied
  let ingestedChunks: DocumentChunk[] = [];
  if (documentText && documentText.trim().length > 0) {
    ingestedChunks = await globalRagPipeline.ingestDocument(documentText, {
      documentId: effectiveDocId,
      tenantId: context.tenantId,
      mode: context.mode,
      title: message ? message.slice(0, 50) : effectiveDocId,
    });
  }

  // 2. Perform RAG retrieval with spec threshold 0.70
  const cleanQuery = message
    .replace(/^(tạo bài đăng|soạn bài|viết mô tả|tạo sản phẩm|khởi tạo bài)(\s+cho)?/i, '')
    .trim();
  const query = cleanQuery || message || (documentText ? documentText.slice(0, 200) : '');

  const ragOutput = await globalRagPipeline.retrieve(query, {
    tenantId: context.tenantId,
    mode: context.mode,
    topK: 3,
    scoreThreshold: 0.70,
  });

  let formattedContext = ragOutput.formattedContext;
  let citations = ragOutput.citations;

  // Fallback: If similarity search returned no results but a document was freshly pasted/ingested,
  // format context from the ingested chunks so the model always receives grounding data.
  if ((!formattedContext || formattedContext.trim().length === 0) && ingestedChunks.length > 0) {
    formattedContext = ingestedChunks
      .map((chunk, i) => {
        const title = (chunk.metadata?.title as string) || chunk.documentId;
        return `[Tài liệu ${i + 1}: ${title}] (Đoạn: ${chunk.id}, Độ tương đồng: 1.00)\n${chunk.content}`;
      })
      .join('\n\n');
    citations = ingestedChunks.map((chunk) => ({
      recordType: 'product' as const,
      recordId: chunk.documentId,
      version: chunk.documentVersion,
      internalUrl: `/dashboard/products/${chunk.documentId}#chunk-${chunk.id}`,
      title: (chunk.metadata?.title as string) || `Tài liệu ${chunk.documentId}`,
    }));
  }

  // 3. Manage Context: Record user turn
  globalContextManager.recordTurn(convId, 'user', message || 'Cung cấp tài liệu quy cách sản phẩm');

  // 4. Create Draft via Dispatcher
  const combinedText = [documentText, message].filter(Boolean).join('\n\n');
  const chunksForDraft =
    ingestedChunks.length > 0
      ? ingestedChunks
      : ragOutput.results.map((r: VectorSearchResult) => r.chunk);

  const draftResult = globalIntakeDispatcher.createDraft({
    context,
    text: combinedText,
    retrievedChunks: chunksForDraft,
    store,
    targetLocale,
    intent,
    documentId: effectiveDocId,
  });

  // 5. Long-term memory handling on ready draft
  if (draftResult.draft.status === 'ready') {
    globalContextManager.getLongTermStore().saveMemory({
      tenantId: context.tenantId,
      userId: context.userId,
      memoryType: 'preference',
      key: 'default_store',
      value: store || 'Shopee VN',
    });

    const weightAttr =
      draftResult.draft.productSnapshot.attributes['weight'] ||
      combinedText.match(/(\d+(?:\.\d+)?)\s*(g|kg|gram|gam|ml|l)\b/i)?.[0];
    if (weightAttr) {
      globalContextManager.getLongTermStore().saveMemory({
        tenantId: context.tenantId,
        userId: context.userId,
        memoryType: 'preference',
        key: 'packaging_pref',
        value: weightAttr,
      });
    }
  }

  const longTermMemories = globalContextManager
    .getLongTermStore()
    .getMemories(context.tenantId, context.userId);

  // 6. Generate answer via ModelCallGateway (replaces static template string)
  const gateway = options?.gateway || new ModelCallGateway();
  const runtimeCtx: RuntimeContext = {
    tenantId: context.tenantId,
    mode: context.mode,
    runId: `intake_${convId}`,
    stepId: 'intake_answer',
    attemptId: 1,
    deadlineMs: 30000,
  };

  const productTitle = draftResult.draft.productSnapshot.title || 'Sản phẩm mới';

  const modelRequest: ModelCallRequest<{ answer: string }> = {
    agentName: 'intake_answer',
    promptVersion: 'v1',
    schemaVersion: '1.0.0',
    modelConfigId: 'gpt-4o-mini',
    systemInstruction: INTAKE_SYSTEM_INSTRUCTION,
    userPayload: {
      message,
      formattedContext,
      title: productTitle,
      draft: draftResult.draft,
      memories: longTermMemories,
    },
    snapshotRef: { id: effectiveDocId, version: 1, hash: 'none' },
    inputHash: createHash('sha256')
      .update(JSON.stringify({ message, formattedContext, docId: effectiveDocId, tenantId: context.tenantId }))
      .digest('hex'),
    maxOutputTokens: 512,
    validateOutput: (raw: unknown) => {
      if (
        raw !== null &&
        typeof raw === 'object' &&
        'answer' in raw &&
        typeof (raw as Record<string, unknown>).answer === 'string'
      ) {
        return { valid: true, data: { answer: (raw as Record<string, unknown>).answer as string } };
      }
      return { valid: false, errors: ['Trường answer bị thiếu hoặc không phải chuỗi'] };
    },
  };

  let answer: string;
  let generatedBy: string | undefined;

  try {
    const modelResult = await gateway.callStructuredModel(modelRequest, runtimeCtx);
    answer = modelResult.artifact.answer;
    generatedBy = modelResult.generatedBy;
  } catch {
    answer =
      draftResult.draft.status === 'ready'
        ? `Đã tiếp nhận và phân tích thông tin sản phẩm "${productTitle}". Bản nháp nhiệm vụ đã sẵn sàng xem trước và kích hoạt.`
        : `Đã tiếp nhận thông tin nhưng còn thiếu một số chi tiết: ${draftResult.draft.clarificationQuestions?.join(', ')}`;
    generatedBy = context.mode === 'demo' ? 'demo_fixture' : 'fake_provider';
  }

  // 7. Record assistant turn
  globalContextManager.recordTurn(convId, 'assistant', answer);

  const responsePayload: IntakeApiResponse & { generatedBy?: string } = {
    conversationId: convId,
    answer,
    ragCitations: citations,
    longTermMemories,
    draft: draftResult.draft,
    status: draftResult.draft.status === 'ready' ? 'draft_ready' : 'needs_clarification',
    asOf: new Date().toISOString(),
    generatedBy,
  };

  return { status: 200, body: responsePayload };
}
