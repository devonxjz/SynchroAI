import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  globalConversationManager,
  globalIdempotencyManager,
  globalProposalStore,
  runAssistant,
  aggregateTasksToday,
  aggregateRevenue,
  searchCatalogOrTasks,
  getOrderIssue,
  prepareActionPreview,
  handleChatApproval,
  enforceServerTruth,
  IdempotencyConflictError,
} from '../../src/ai/agents/assistant/index.ts';

describe('Trợ lý Công việc (Work Assistant Agent - Khối 14)', () => {
  const adminContext = {
    tenantId: 'tenant_vietnam',
    userId: 'user_admin_1',
    role: 'admin',
    mode: 'demo',
    permissions: ['manage_all'],
    userTimezone: 'Asia/Ho_Chi_Minh',
  };

  const viewerContext = {
    tenantId: 'tenant_vietnam',
    userId: 'user_viewer_2',
    role: 'viewer',
    mode: 'demo',
    permissions: ['view_only'],
    userTimezone: 'Asia/Ho_Chi_Minh',
  };

  beforeEach(() => {
    globalConversationManager.clear();
    globalIdempotencyManager.clear();
    globalProposalStore.clear();
  });

  it('AS01: Thống kê việc chờ trong ngày tính đúng dải UTC theo múi giờ', () => {
    const tasks = [
      {
        id: 't1',
        tenantId: 'tenant_vietnam',
        title: 'Task 1',
        status: 'pending',
        createdAt: new Date().toISOString(),
      },
      {
        id: 't2',
        tenantId: 'tenant_vietnam',
        title: 'Task 2',
        status: 'pending',
        createdAt: new Date().toISOString(),
      },
    ];

    const result = aggregateTasksToday(tasks, 'Asia/Ho_Chi_Minh');
    assert.equal(result.totalPendingInDb, 2);
    assert.equal(result.tasksCreatedToday, 2);
    assert.ok(result.timeRangeUtc.startUtc);
    assert.ok(result.timeRangeUtc.endUtc);
  });

  it('AS02: Hai người dùng cùng doanh nghiệp khác quyền: Viewer không nhận PII', () => {
    const adminOrder = getOrderIssue(adminContext, { orderId: 'ord_1001' });
    assert.ok(adminOrder.data.customerPhone, 'Admin xem được số điện thoại');
    assert.ok(adminOrder.data.shippingAddress, 'Admin xem được địa chỉ');

    const viewerOrder = getOrderIssue(viewerContext, { orderId: 'ord_1001' });
    assert.equal(viewerOrder.data.customerPhone, undefined, 'Viewer không được nhận số điện thoại');
    assert.equal(viewerOrder.data.shippingAddress, undefined, 'Viewer không được nhận địa chỉ');
  });

  it('AS03: Admin bị hạ quyền mở lại chat cũ: toàn bộ PII trong lịch sử cũ bị che giấu', () => {
    const conv = globalConversationManager.createConversation(adminContext);
    globalConversationManager.appendMessage(
      conv.id,
      {
        id: 'msg_1',
        role: 'assistant',
        content: 'Số điện thoại khách hàng là 0901234567 tại địa chỉ 123 Lê Lợi.',
        createdAt: new Date().toISOString(),
      },
      adminContext
    );

    // Now reload conversation under viewerContext (downgraded role)
    const sanitizedHistory = globalConversationManager.getSanitizedHistory(conv.id, viewerContext);
    assert.equal(sanitizedHistory.length, 1);
    assert.ok(!sanitizedHistory[0].content.includes('0901234567'), 'Số điện thoại phải bị che giấu');
    assert.ok(sanitizedHistory[0].content.includes('[REDACTED]'));
  });

  it('AS04: Chặn tự động đăng bài hàng loạt ("đăng hết đi")', async () => {
    const res = await runAssistant(adminContext, 'Đăng hết tất cả các bài lên Shopee đi');
    assert.equal(res.status, 'needs_clarification');
    assert.ok(res.answer.includes('không hỗ trợ đăng hàng loạt tự động'));
    assert.ok(res.citations.length === 0, '0 lời gọi gửi sàn được kích hoạt');
  });

  it('AS05: Khẳng định máy chủ chặn kết luận sai khi bài đăng đang queued', () => {
    const assertions = [
      {
        assertionType: 'listing_status',
        verifiedData: { status: 'queued', store: 'Shopee VN' },
        isAuthoritative: true,
      },
    ];

    const modelSaid = 'Bài đăng Trà Ô Long đã đăng thành công trên sàn Shopee.';
    const citations = [
      {
        recordType: 'listing',
        recordId: 'list_tea_shopee',
        version: 1,
        internalUrl: '/dashboard/listings/list_tea_shopee',
      },
    ];

    const truthful = enforceServerTruth(modelSaid, citations, assertions);
    assert.ok(!truthful.truthfulAnswer.includes('đã đăng thành công'));
    assert.ok(truthful.truthfulAnswer.includes('đang trong hàng đợi chờ gửi'));
  });

  it('AS06: Đổi doanh nghiệp dùng phiên cũ bị trả về lỗi unavailable / 404', async () => {
    const conv = globalConversationManager.createConversation(adminContext);

    const otherTenantContext = {
      ...adminContext,
      tenantId: 'tenant_thailand',
    };

    const res = await runAssistant(otherTenantContext, 'Xin chào', conv.id);
    assert.equal(res.status, 'unavailable');
    assert.ok(res.answer.includes('không có quyền truy cập doanh nghiệp này'));
  });

  it('AS07: Hai request đồng thời cùng idempotency key chỉ có 1 lượt thực thi', () => {
    const key = 'idem_key_race_01';
    const msg = 'Hôm nay còn việc gì?';

    const r1 = globalIdempotencyManager.acquireLock(adminContext, key, msg);
    assert.equal(r1.acquired, true, 'Request 1 giành được khóa');

    const r2 = globalIdempotencyManager.acquireLock(adminContext, key, msg);
    assert.equal(r2.acquired, false, 'Request 2 bị chặn vì đang xử lý');
  });

  it('AS08: Cùng idempotency key nhưng nội dung tin nhắn khác nhau bị báo lỗi xung đột 409', () => {
    const key = 'idem_key_conflict_01';
    globalIdempotencyManager.acquireLock(adminContext, key, 'Câu hỏi A');

    assert.throws(
      () => {
        globalIdempotencyManager.acquireLock(adminContext, key, 'Câu hỏi B khác biệt');
      },
      (err) => err instanceof IdempotencyConflictError
    );
  });

  it('AS09: Thay đổi payload đề xuất sau khi preview khiến lệnh duyệt bị từ chối do sai lệch mã băm', () => {
    const preview = prepareActionPreview(adminContext, {
      actionType: 'update_attributes',
      targetIds: ['prod_tea_01'],
      proposedChanges: { brand: 'Startup Tea' },
    });

    const proposalId = preview.draft.proposalId;

    // Simulate tampering or state change: payload hash is different
    const approvalRes = handleChatApproval(adminContext, proposalId, 'tampered_hash_999');
    assert.equal(approvalRes.success, false);
    assert.equal(approvalRes.status, 'stale_rejected');
    assert.ok(approvalRes.messageVi.includes('đã bị thay đổi'));
  });

  it('AS10: Hạn mức thời gian toàn request 30 giây tự động hủy tiến trình', async () => {
    // Pass deadlineMs = 0 to trigger immediate deadline exceeded
    const res = await runAssistant(adminContext, 'Hôm nay còn việc gì?', undefined, undefined, {
      deadlineMs: 0,
    });

    assert.equal(res.status, 'partial_deadline_exceeded');
    assert.ok(res.answer.includes('vượt quá giới hạn'));
  });

  it('AS11: Tách nhóm doanh thu theo từng loại tiền tệ độc lập', () => {
    const orders = [
      { id: '1', tenantId: 'tenant_vietnam', status: 'confirmed', amount: 5000000, currency: 'VND', createdAt: '' },
      { id: '2', tenantId: 'tenant_vietnam', status: 'completed', amount: 1200, currency: 'THB', createdAt: '' },
      { id: '3', tenantId: 'tenant_vietnam', status: 'cancelled', amount: 999999, currency: 'VND', createdAt: '' }, // cancelled excluded!
    ];

    const revenue = aggregateRevenue(orders);
    assert.equal(revenue.length, 2, 'Phải có đúng 2 nhóm tiền tệ VND và THB');

    const vnd = revenue.find((r) => r.currency === 'VND');
    const thb = revenue.find((r) => r.currency === 'THB');
    assert.equal(vnd.totalAmount, 5000000);
    assert.equal(thb.totalAmount, 1200);
  });

  it('AS12: Có nhiều bản nháp chờ duyệt và người dùng nói đồng ý thì yêu cầu chỉ rõ bản nháp', () => {
    // Create 2 proposals
    prepareActionPreview(adminContext, { actionType: 'update_attributes', targetIds: ['p1'] });
    prepareActionPreview(adminContext, { actionType: 'update_attributes', targetIds: ['p2'] });

    const approvalRes = handleChatApproval(adminContext);
    assert.equal(approvalRes.success, false);
    assert.equal(approvalRes.status, 'needs_clarification');
    assert.equal(approvalRes.pendingProposals.length, 2);
    assert.ok(approvalRes.messageVi.includes('Hiện có 2 bản xem trước'));
  });

  it('AS13: Tìm kiếm theo tên gọi trước khi lấy trạng thái mà không cần đoán ID', () => {
    const searchRes = searchCatalogOrTasks(adminContext, { query: 'Trà Ô Long' });
    assert.ok(searchRes.data.length > 0);
    assert.equal(searchRes.data[0].id, 'prod_tea_01');
    assert.ok(searchRes.citations[0].internalUrl.includes('prod_tea_01'));
  });

  it('AS14: Nghiệm thu các câu hỏi nghiệp vụ mẫu trả lời có dẫn chứng hợp lệ', async () => {
    const resTasks = await runAssistant(adminContext, 'Hôm nay còn việc gì cần làm?');
    assert.equal(resTasks.status, 'answered');
    assert.ok(resTasks.citations.length > 0);

    const resRevenue = await runAssistant(adminContext, 'Doanh thu hôm nay thế nào?');
    assert.equal(resRevenue.status, 'answered');
    assert.ok(resRevenue.answer.includes('VND'));

    const resSearch = await runAssistant(adminContext, 'Trà Ô Long');
    assert.equal(resSearch.status, 'answered');
    assert.ok(resSearch.citations.length > 0);
  });
});
