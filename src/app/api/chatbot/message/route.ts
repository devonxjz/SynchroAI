import type { ServerContext, UserRole } from '../../../../ai/agents/assistant/types.ts';
import { runAssistant } from '../../../../ai/agents/assistant/agent.ts';
import {
  globalIdempotencyManager,
  IdempotencyConflictError,
} from '../../../../ai/agents/assistant/idempotency.ts';
import { classifyChatRoute } from '../../../../ai/chatbot/router.ts';
import { handleIntakeRequest } from '../../../../ai/chatbot/intake-handler.ts';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      message = '',
      documentText = '',
      idempotencyKey,
      conversationId,
      targetProposalId,
      store = 'Shopee VN',
      targetLocale = 'vi',
      intent = 'prepare_listing',
    } = body;

    if (!message && !documentText) {
      return Response.json(
        { error: 'Nội dung tin nhắn hoặc tài liệu không được để trống.' },
        { status: 400 }
      );
    }

    if (!idempotencyKey || typeof idempotencyKey !== 'string') {
      return Response.json(
        { error: 'Thiếu idempotencyKey trong yêu cầu.' },
        { status: 400 }
      );
    }

    const tenantId = req.headers.get('x-tenant-id') || 'tenant_vietnam';
    const userId = req.headers.get('x-user-id') || 'user_demo_1';
    const role = (req.headers.get('x-user-role') || 'admin') as UserRole;
    const defaultMode = process.env.OPENAI_API_KEY ? 'live' : 'demo';
    const mode = (req.headers.get('x-mode') || defaultMode) as 'live' | 'demo';
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

    const route = classifyChatRoute({ message, documentText });

    // Enforce idempotency across all requests
    const payloadToHash = JSON.stringify({ message, documentText, route });
    let lockAcquired = false;
    try {
      const lockRes = globalIdempotencyManager.acquireLock(serverContext, idempotencyKey, payloadToHash);
      if (!lockRes.acquired) {
        if (lockRes.existingResponse) {
          return Response.json(lockRes.existingResponse, { status: 200 });
        }
        return Response.json(
          { error: 'Yêu cầu đang được xử lý, vui lòng chờ trong giây lát.' },
          { status: 429 }
        );
      }
      lockAcquired = true;
    } catch (err) {
      if (err instanceof IdempotencyConflictError) {
        return Response.json({ error: err.message }, { status: 409 });
      }
      throw err;
    }

    let responsePayload: unknown;

    if (route === 'intake') {
      const intakeRes = await handleIntakeRequest(serverContext, {
        message,
        documentText,
        idempotencyKey,
        conversationId,
        store,
        targetLocale,
        intent,
      });
      responsePayload = intakeRes.body;
    } else {
      responsePayload = await runAssistant(serverContext, message, conversationId, targetProposalId);
    }

    if (lockAcquired) {
      globalIdempotencyManager.complete(serverContext, idempotencyKey, responsePayload);
    }

    return Response.json(responsePayload);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Lỗi hệ thống';
    return Response.json({ error: msg }, { status: 500 });
  }
}
