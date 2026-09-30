import type { ServerContext, Citation } from '../types.ts';

export interface ActionPreviewDraft {
  proposalId: string;
  tenantId: string;
  actionType: 'publish_listing' | 'update_attributes' | 'sync_stock';
  targetIds: string[];
  proposedChanges: Record<string, unknown>;
  proposalHash: string;
  requiresIndividualApproval: boolean;
  isBatchBlocked: boolean;
  createdAt: string;
  status: 'pending_approval' | 'approved' | 'rejected';
}

export class ProposalDraftStore {
  private drafts = new Map<string, ActionPreviewDraft>();

  public saveDraft(draft: ActionPreviewDraft): void {
    this.drafts.set(draft.proposalId, draft);
  }

  public getDraft(proposalId: string): ActionPreviewDraft | null {
    const draft = this.drafts.get(proposalId);
    return draft ? { ...draft } : null;
  }

  public listPending(tenantId: string): ActionPreviewDraft[] {
    return Array.from(this.drafts.values()).filter(
      (d) => d.tenantId === tenantId && d.status === 'pending_approval'
    );
  }

  public clear(): void {
    this.drafts.clear();
  }
}

export const globalProposalStore = new ProposalDraftStore();

export function prepareActionPreview(
  context: ServerContext,
  params: {
    actionType: 'publish_listing' | 'update_attributes' | 'sync_stock';
    targetIds: string[];
    proposedChanges?: Record<string, unknown>;
  }
): {
  draft?: ActionPreviewDraft;
  citations: Citation[];
  messageVi: string;
} {
  const citations: Citation[] = [];

  // Batch publish protection: Mass publish is blocked from automated execution
  if (params.targetIds.length > 1 || params.actionType === 'publish_listing' && params.targetIds.length === 0) {
    return {
      citations,
      messageVi:
        'Hệ thống không hỗ trợ đăng hàng loạt tự động nhằm bảo vệ an toàn tài khoản sàn. Dưới đây là danh sách điều kiện dự kiến để bạn duyệt từng bài đăng.',
    };
  }

  const proposalId = `prop_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const proposedChanges = params.proposedChanges || {};
  const payloadStr = JSON.stringify(proposedChanges);

  let hash = 0;
  for (let i = 0; i < payloadStr.length; i++) {
    hash = (hash << 5) - hash + payloadStr.charCodeAt(i);
    hash |= 0;
  }

  const draft: ActionPreviewDraft = {
    proposalId,
    tenantId: context.tenantId,
    actionType: params.actionType,
    targetIds: params.targetIds,
    proposedChanges,
    proposalHash: `hash_${hash}`,
    requiresIndividualApproval: true,
    isBatchBlocked: false,
    createdAt: new Date().toISOString(),
    status: 'pending_approval',
  };

  globalProposalStore.saveDraft(draft);

  citations.push({
    recordType: 'task',
    recordId: proposalId,
    version: 1,
    internalUrl: `/dashboard/tasks#proposal-${proposalId}`,
    title: `Bản xem trước đề xuất #${proposalId}`,
  });

  return {
    draft,
    citations,
    messageVi: `Đã tạo bản xem trước đề xuất #${proposalId}. Vui lòng bấm duyệt trên thẻ xem trước để gửi lên sàn.`,
  };
}
