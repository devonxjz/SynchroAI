import { NextResponse } from 'next/server';
import type { ServerContext, UserRole } from '../../../../ai/agents/assistant/types.ts';
import { runAssistant } from '../../../../ai/agents/assistant/agent.ts';
import {
  globalIdempotencyManager,
  IdempotencyConflictError,
} from '../../../../ai/agents/assistant/idempotency.ts';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { message, idempotencyKey, conversationId, targetProposalId } = body;

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Nội dung tin nhắn không được để trống.' }, { status: 400 });
    }

    if (!idempotencyKey || typeof idempotencyKey !== 'string') {
      return NextResponse.json({ error: 'Thiếu idempotencyKey trong yêu cầu.' }, { status: 400 });
    }

    // Resolve context from headers or fallback to safe defaults
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
      permissions: role === 'admin' ? ['manage_all'] : role === 'editor' ? ['edit_content'] : ['view_only'],
      userTimezone,
    };

    // Check idempotency lock
    let lockAcquired = false;
    try {
      const lockRes = globalIdempotencyManager.acquireLock(serverContext, idempotencyKey, message);
      if (!lockRes.acquired) {
        if (lockRes.existingResponse) {
          return NextResponse.json(lockRes.existingResponse);
        }
        return NextResponse.json(
          { error: 'Yêu cầu đang được xử lý, vui lòng chờ trong giây lát.' },
          { status: 429 }
        );
      }
      lockAcquired = true;
    } catch (err) {
      if (err instanceof IdempotencyConflictError) {
        return NextResponse.json({ error: err.message }, { status: 409 });
      }
      throw err;
    }

    // Execute assistant
    const response = await runAssistant(serverContext, message, conversationId, targetProposalId);

    // Save idempotent response
    if (lockAcquired) {
      globalIdempotencyManager.complete(serverContext, idempotencyKey, response);
    }

    return NextResponse.json(response);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Lỗi hệ thống';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
