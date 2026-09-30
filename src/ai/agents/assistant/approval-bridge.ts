import type { ServerContext } from './types.ts';
import { globalProposalStore } from './tools/action-preview.ts';

export interface ApprovalBridgeResult {
  success: boolean;
  status: 'approved' | 'needs_clarification' | 'stale_rejected' | 'permission_denied' | 'not_found';
  messageVi: string;
  proposalId?: string;
  pendingProposals?: string[];
}

export function handleChatApproval(
  context: ServerContext,
  targetProposalId?: string,
  currentPayloadHash?: string
): ApprovalBridgeResult {
  // Permission check: Viewer cannot approve actions
  if (context.role === 'viewer') {
    return {
      success: false,
      status: 'permission_denied',
      messageVi: 'Tài khoản của bạn chỉ có quyền người xem (Viewer), không được phép phê duyệt đề xuất.',
    };
  }

  const pending = globalProposalStore.listPending(context.tenantId);

  // If no target proposal specified and multiple proposals pending
  if (!targetProposalId) {
    if (pending.length === 0) {
      return {
        success: false,
        status: 'not_found',
        messageVi: 'Hiện không có bản xem trước đề xuất nào đang chờ phê duyệt.',
      };
    }

    if (pending.length > 1) {
      return {
        success: false,
        status: 'needs_clarification',
        messageVi: `Hiện có ${pending.length} bản xem trước đang chờ duyệt. Bạn muốn phê duyệt bản xem trước nào?`,
        pendingProposals: pending.map((p) => p.proposalId),
      };
    }

    // Exactly 1 pending proposal
    targetProposalId = pending[0].proposalId;
  }

  const draft = globalProposalStore.getDraft(targetProposalId);
  if (!draft || draft.tenantId !== context.tenantId) {
    return {
      success: false,
      status: 'not_found',
      messageVi: `Không tìm thấy bản xem trước đề xuất #${targetProposalId}.`,
    };
  }

  // Check stale payload hash if provided
  if (currentPayloadHash && currentPayloadHash !== draft.proposalHash) {
    return {
      success: false,
      status: 'stale_rejected',
      messageVi:
        'Nội dung đề xuất đã bị thay đổi sau khi tạo bản xem trước. Lệnh duyệt bị từ chối, vui lòng tạo lại bản xem trước mới.',
      proposalId: targetProposalId,
    };
  }

  draft.status = 'approved';
  globalProposalStore.saveDraft(draft);

  return {
    success: true,
    status: 'approved',
    messageVi: `Đã phê duyệt đề xuất #${targetProposalId} thành công qua dịch vụ Khối 10. Tiến trình gửi sàn đã được kích hoạt.`,
    proposalId: targetProposalId,
  };
}
