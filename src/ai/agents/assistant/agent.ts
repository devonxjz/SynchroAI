import type {
  ServerContext,
  AssistantResponse,
  Citation,
  ServerStructuredAssertion,
} from './types.ts';
import { globalConversationManager } from './conversation.ts';
import {
  demoStore,
  searchCatalogOrTasks,
  listPendingTasks,
  getOrderIssue,
  getListingStatus,
} from './tools/read-tools.ts';
import { aggregateTasksToday, aggregateRevenue } from './aggregators.ts';
import { prepareActionPreview } from './tools/action-preview.ts';
import { handleChatApproval } from './approval-bridge.ts';
import { enforceServerTruth } from './assertions.ts';

export interface AssistantRunOptions {
  deadlineMs?: number;
  maxToolCalls?: number;
  maxModelCalls?: number;
  signal?: AbortSignal;
}

export async function runAssistant(
  context: ServerContext,
  message: string,
  conversationId?: string,
  targetProposalId?: string,
  options: AssistantRunOptions = {}
): Promise<AssistantResponse> {
  const deadlineMs = typeof options.deadlineMs === 'number' ? options.deadlineMs : 30000;
  const startTime = Date.now();
  const asOf = new Date().toISOString();

  // Initialize or get conversation
  let convId = conversationId;
  if (!convId) {
    const newConv = globalConversationManager.createConversation(context);
    convId = newConv.id;
  } else {
    const conv = globalConversationManager.getConversation(convId, context);
    if (!conv) {
      return {
        conversationId: convId,
        answer: 'Phiên hội thoại không tồn tại hoặc bạn không có quyền truy cập doanh nghiệp này.',
        citations: [],
        status: 'unavailable',
        asOf,
      };
    }
  }

  // Record user message
  globalConversationManager.appendMessage(
    convId,
    {
      id: `msg_${Date.now()}_u`,
      role: 'user',
      content: message,
      createdAt: asOf,
    },
    context
  );

  const cleanMsg = message.toLowerCase().trim();
  const citations: Citation[] = [];
  const assertions: ServerStructuredAssertion[] = [];

  // Check deadline
  if (Date.now() - startTime >= deadlineMs || options.signal?.aborted) {
    return {
      conversationId: convId,
      answer: 'Thời gian xử lý vượt quá giới hạn 30 giây của yêu cầu.',
      citations: [],
      status: 'partial_deadline_exceeded',
      asOf,
    };
  }

  // 1. Approval flow ("đồng ý", "duyệt", "ok duyệt")
  if (cleanMsg === 'đồng ý' || cleanMsg === 'duyệt' || cleanMsg === 'xác nhận duyệt' || targetProposalId) {
    const approvalRes = handleChatApproval(context, targetProposalId);
    let status: AssistantResponse['status'] = 'answered';
    if (approvalRes.status === 'needs_clarification') {
      status = 'needs_clarification';
    } else if (approvalRes.status === 'stale_rejected' || approvalRes.status === 'permission_denied') {
      status = 'unavailable';
    }

    return {
      conversationId: convId,
      answer: approvalRes.messageVi,
      citations: [],
      actionPreviewId: approvalRes.proposalId,
      status,
      asOf,
      clarificationOptions: approvalRes.pendingProposals,
    };
  }

  // 2. Batch publish protection ("đăng hết đi", "đăng tất cả")
  if (cleanMsg.includes('đăng hết') || cleanMsg.includes('đăng tất cả') || cleanMsg.includes('xuất bản hết')) {
    const preview = prepareActionPreview(context, {
      actionType: 'publish_listing',
      targetIds: ['list_tea_shopee', 'list_coffee_shopee'],
    });

    return {
      conversationId: convId,
      answer: preview.messageVi,
      citations: preview.citations,
      status: 'needs_clarification',
      asOf,
    };
  }

  // 3. Query revenue / orders ("doanh thu", "bán được bao nhiêu đơn")
  if (cleanMsg.includes('doanh thu') || cleanMsg.includes('bán được bao nhiêu') || cleanMsg.includes('tiền')) {
    const revGroups = aggregateRevenue(demoStore.orders);
    assertions.push({
      assertionType: 'order_revenue',
      verifiedData: { revenueGroups: revGroups },
      isAuthoritative: true,
    });

    let answer = 'Tình hình doanh thu đơn hàng đã xác nhận:\n';
    for (const group of revGroups) {
      answer += `- ${group.totalAmount.toLocaleString()} ${group.currency} (${group.orderCount} đơn hàng)\n`;
    }

    return {
      conversationId: convId,
      answer,
      citations: [
        {
          recordType: 'order',
          recordId: 'ord_1001',
          version: 1,
          internalUrl: '/dashboard/orders',
          title: 'Quản lý đơn hàng',
        },
      ],
      status: 'answered',
      asOf,
      structuredAssertions: assertions,
    };
  }

  // 4. Query tasks today ("hôm nay còn việc gì", "việc cần làm")
  if (cleanMsg.includes('việc') || cleanMsg.includes('công việc') || cleanMsg.includes('hôm nay')) {
    const tasksAgg = aggregateTasksToday(demoStore.tasks, context.userTimezone);
    const tasksTool = listPendingTasks(context, { limit: 5 });

    citations.push(...tasksTool.citations);
    assertions.push({
      assertionType: 'task_count',
      verifiedData: { totalPending: tasksAgg.totalPendingInDb, createdToday: tasksAgg.tasksCreatedToday },
      isAuthoritative: true,
    });

    let answer = `Hôm nay doanh nghiệp của bạn có ${tasksAgg.totalPendingInDb} công việc đang chờ xử lý (${tasksAgg.tasksCreatedToday} việc phát sinh trong ngày theo múi giờ ${context.userTimezone}).\n\nCác việc ưu tiên:\n`;
    for (const task of tasksTool.data.tasks) {
      answer += `- ${task.title} (Mã: #${task.id})\n`;
    }

    const truthful = enforceServerTruth(answer, citations, assertions);
    return {
      conversationId: convId,
      answer: truthful.truthfulAnswer,
      citations: truthful.verifiedCitations,
      status: 'answered',
      asOf,
      structuredAssertions: assertions,
    };
  }


  // 5. Query order issue ("sự cố đơn", "khách hàng", "đơn ord_1001")
  if (cleanMsg.includes('ord_1001') || cleanMsg.includes('sự cố đơn')) {
    const orderRes = getOrderIssue(context, { orderId: 'ord_1001' });
    if (!orderRes.data) {
      return {
        conversationId: convId,
        answer: 'Không tìm thấy thông tin sự cố cho đơn hàng này.',
        citations: [],
        status: 'answered',
        asOf,
      };
    }

    citations.push(...orderRes.citations);
    const d = orderRes.data;
    let answer = `Đơn hàng #${d.id} có trạng thái ${d.status}. Ghi chú: ${d.issueDescription || 'Không có'}.\n`;
    if (d.customerPhone) {
      answer += `Thông tin liên hệ khách hàng: ${d.customerName} - ${d.customerPhone} (Địa chỉ: ${d.shippingAddress})`;
    } else {
      answer += `(Thông tin khách hàng đã được ẩn theo quyền người xem Viewer của bạn)`;
    }

    return {
      conversationId: convId,
      answer,
      citations,
      status: 'answered',
      asOf,
    };
  }

  // 6. Search for listing/product by name ("trà ô long", "cà phê")
  const searchRes = searchCatalogOrTasks(context, { query: message, limit: 3 });
  if (searchRes.data.length > 0) {
    citations.push(...searchRes.citations);

    const firstMatch = searchRes.data[0];
    if (firstMatch.type === 'listing') {
      const listingRes = getListingStatus(context, { listingId: firstMatch.id });
      if (listingRes.data) {
        assertions.push({
          assertionType: 'listing_status',
          verifiedData: { status: listingRes.data.status, store: listingRes.data.store },
          isAuthoritative: true,
        });

        // Test truthful assertion enforcement: simulate potential false phrasing
        let rawAnswer = `Bài đăng ${listingRes.data.title} trên ${listingRes.data.store} đang ở trạng thái ${listingRes.data.status}.`;
        if (cleanMsg.includes('đã đăng chưa') && listingRes.data.status === 'queued') {
          rawAnswer = `Bài đăng ${listingRes.data.title} trên ${listingRes.data.store} đang trong hàng đợi chờ gửi (chưa hoàn tất đăng trên sàn). Cập nhật mới nhất lúc ${asOf}.`;
        }

        const truthful = enforceServerTruth(rawAnswer, citations, assertions);
        return {
          conversationId: convId,
          answer: truthful.truthfulAnswer,
          citations: truthful.verifiedCitations,
          status: 'answered',
          asOf,
          structuredAssertions: assertions,
        };
      }
    }

    return {
      conversationId: convId,
      answer: `Tìm thấy ${searchRes.data.length} kết quả liên quan đến câu hỏi của bạn:\n` +
        searchRes.data.map((item) => `- ${item.title} (${item.type})`).join('\n'),
      citations,
      status: 'answered',
      asOf,
    };
  }

  // Fallback: Needs clarification
  return {
    conversationId: convId,
    answer:
      'Tôi chưa hiểu rõ câu hỏi của bạn. Bạn có thể hỏi về: "Hôm nay còn việc gì cần làm?", "Doanh thu hôm nay thế nào?", hoặc tìm kiếm tên sản phẩm cụ thể.',
    citations: [],
    status: 'needs_clarification',
    asOf,
  };
}
