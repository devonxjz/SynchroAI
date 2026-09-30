import type { ServerContext, UserRole } from '../../../../ai/agents/assistant/types.ts';
import { globalContextManager } from '../../../../ai/chatbot/context-manager.ts';
import { globalIntakeDispatcher } from '../../../../ai/chatbot/dispatcher.ts';
import { globalRagPipeline } from '../../../../ai/chatbot/rag.ts';
import type {
  DocumentChunk,
  IntakeApiRequest,
  IntakeApiResponse,
  VectorSearchResult,
} from '../../../../ai/chatbot/types.ts';

export async function POST(req: Request) {
  try {
    const body: IntakeApiRequest = await req.json();
    const {
      message = '',
      documentText = '',
      documentId,
      conversationId,
      store = 'Shopee VN',
      targetLocale = 'vi',
      intent = 'prepare_listing',
    } = body;

    if (!message && !documentText) {
      return Response.json(
        { error: 'Vui lòng cung cấp nội dung tin nhắn hoặc tài liệu quy cách sản phẩm.' },
        { status: 400 }
      );
    }

    const tenantId = req.headers.get('x-tenant-id') || 'tenant_vietnam';
    const userId = req.headers.get('x-user-id') || 'user_demo_1';
    const role = (req.headers.get('x-user-role') || 'admin') as UserRole;
    const mode = (req.headers.get('x-mode') || 'demo') as 'live' | 'demo';
    const userTimezone = req.headers.get('x-timezone') || 'Asia/Ho_Chi_Minh';

    const serverContext: ServerContext = {
      tenantId,
      userId,
      role,
      mode,
      permissions:
        role === 'admin' ? ['manage_all'] : role === 'editor' ? ['edit_content'] : ['view_only'],
      userTimezone,
    };

    const convId = conversationId || `conv_intake_${Date.now()}`;
    const effectiveDocId = documentId || `doc_${Date.now()}`;

    // 1. Ingest document if supplied
    let ingestedChunks: DocumentChunk[] = [];
    if (documentText && documentText.trim().length > 0) {
      ingestedChunks = await globalRagPipeline.ingestDocument(documentText, {
        documentId: effectiveDocId,
        tenantId,
        mode,
        title: message ? message.slice(0, 50) : effectiveDocId,
      });
    }

    // 2. Perform RAG retrieval
    const query = message || documentText.slice(0, 200);
    const ragOutput = await globalRagPipeline.retrieve(query, {
      tenantId,
      mode,
      topK: 3,
      scoreThreshold: 0.65,
    });

    // 3. Manage Context
    globalContextManager.recordTurn(convId, 'user', message || 'Cung cấp tài liệu quy cách sản phẩm');

    // 4. Create Draft via Dispatcher (Never starts workflow automatically)
    const combinedText = [documentText, message].filter(Boolean).join('\n\n');
    const chunksForDraft =
      ingestedChunks.length > 0
        ? ingestedChunks
        : ragOutput.results.map((r: VectorSearchResult) => r.chunk);

    const draftResult = globalIntakeDispatcher.createDraft({
      context: serverContext,
      text: combinedText,
      retrievedChunks: chunksForDraft,
      store,
      targetLocale,
      intent,
      documentId: effectiveDocId,
    });

    // 5. Query long-term memories
    const longTermMemories = globalContextManager
      .getLongTermStore()
      .getMemories(tenantId, userId);

    const answer =
      draftResult.draft.status === 'ready'
        ? `Đã tiếp nhận và phân tích thông tin sản phẩm "${draftResult.draft.productSnapshot.title}". Bản nháp nhiệm vụ đã sẵn sàng xem trước và kích hoạt.`
        : `Đã tiếp nhận thông tin nhưng còn thiếu một số chi tiết: ${draftResult.draft.clarificationQuestions?.join(', ')}`;

    globalContextManager.recordTurn(convId, 'assistant', answer);

    const responsePayload: IntakeApiResponse = {
      conversationId: convId,
      answer,
      ragCitations: ragOutput.citations,
      longTermMemories,
      draft: draftResult.draft,
      status: draftResult.draft.status === 'ready' ? 'draft_ready' : 'needs_clarification',
      asOf: new Date().toISOString(),
    };

    return Response.json(responsePayload);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: errorMsg }, { status: 500 });
  }
}
