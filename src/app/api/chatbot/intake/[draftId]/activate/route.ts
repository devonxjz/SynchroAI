import type { ServerContext, UserRole } from '../../../../../../ai/agents/assistant/types.ts';
import { globalIntakeDispatcher } from '../../../../../../ai/chatbot/dispatcher.ts';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ draftId: string }> }
) {
  try {
    const { draftId } = await params;
    const body = await req.json();
    const {
      expectedVersion,
      expectedHash,
      idempotencyKey,
      retryRunId,
      retryStepName,
    } = body;

    if (!draftId) {
      return Response.json({ error: 'Mã bản nháp draftId không hợp lệ.' }, { status: 400 });
    }

    if (typeof expectedVersion !== 'number' || !expectedHash || !idempotencyKey) {
      return Response.json(
        { error: 'Thiếu expectedVersion, expectedHash hoặc idempotencyKey trong yêu cầu kích hoạt.' },
        { status: 400 }
      );
    }

    const tenantId = req.headers.get('x-tenant-id') || 'tenant_vietnam';
    const userId = req.headers.get('x-user-id') || 'user_demo_1';
    const role = (req.headers.get('x-user-role') || 'admin') as UserRole;
    const mode = (req.headers.get('x-mode') || 'demo') as 'live' | 'demo';
    const userTimezone = req.headers.get('x-timezone') || 'Asia/Ho_Chi_Minh';

    if (role === 'viewer') {
      return Response.json(
        { error: 'Người dùng vai trò Viewer không có quyền kích hoạt quy trình soạn bài.' },
        { status: 403 }
      );
    }

    const serverContext: ServerContext = {
      tenantId,
      userId,
      role,
      mode,
      permissions: role === 'admin' ? ['manage_all'] : ['edit_content'],
      userTimezone,
    };

    const result = await globalIntakeDispatcher.activateDraft({
      draftId,
      expectedVersion,
      expectedHash,
      idempotencyKey,
      context: serverContext,
      retryRunId,
      retryStepName,
    });

    return Response.json(result);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    if (errorMsg.includes('Xung đột') || errorMsg.includes('không khớp')) {
      return Response.json({ error: errorMsg }, { status: 409 });
    }
    return Response.json({ error: errorMsg }, { status: 500 });
  }
}
