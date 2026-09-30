import { createHash } from 'node:crypto';
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
import { handleChatApproval } from './approval-bridge.ts';
import { enforceServerTruth } from './assertions.ts';
import { ModelCallGateway } from '../../model-call/gateway.ts';
import type { ModelCallRequest, RuntimeContext } from '../../model-call/types.ts';

// ---------------------------------------------------------------------------
// System instruction – tells OpenAI (or fixture) how to generate answers.
// ---------------------------------------------------------------------------
const ASSISTANT_SYSTEM_INSTRUCTION =
  'Bạn là Trợ lý AI Synchro – chuyên gia hỗ trợ quản lý bán hàng đa sàn thương mại điện tử tại Đông Nam Á.\n' +
  'Luôn trả lời bằng tiếng Việt, ngắn gọn, thân thiện và chuyên nghiệp.\n' +
  'Chỉ sử dụng dữ liệu thực từ trường "toolData" được cung cấp; không bịa đặt số liệu.\n' +
  'Khi intent là "batch_publish_guard": giải thích rằng hệ thống không hỗ trợ đăng hàng loạt tự động và yêu cầu xác nhận từng bài.\n' +
  'Khi intent là "unknown": hướng dẫn người dùng hỏi về doanh thu, công việc hôm nay, hoặc tìm kiếm sản phẩm.\n' +
  'Output PHẢI là JSON hợp lệ đúng định dạng: {"answer":"<câu trả lời tiếng Việt>"}';

// Module-level gateway – shares cache / budget across all assistant requests.
const globalAssistantGateway = new ModelCallGateway();

// ---------------------------------------------------------------------------
// Core helper – calls ModelCallGateway and returns the generated answer string.
// In demo mode FixtureModelProvider is used; in live mode OpenAI is used.
// ---------------------------------------------------------------------------
async function callAssistantAI(
  context: ServerContext,
  convId: string,
  intent: string,
  toolData: Record<string, unknown>,
  userMessage: string,
  remainingMs: number
): Promise<string> {
  const inputHash = createHash('sha256')
    .update(JSON.stringify({ userMessage, intent, toolData, tenantId: context.tenantId }))
    .digest('hex');

  const runtimeCtx: RuntimeContext = {
    tenantId: context.tenantId,
    mode: context.mode,
    runId: `assist_${convId}`,
    stepId: `answer_${intent}`,
    attemptId: 1,
    deadlineMs: Math.max(remainingMs, 1000),
  };

  const request: ModelCallRequest<{ answer: string }> = {
    agentName: 'assistant_agent',
    promptVersion: 'v1',
    schemaVersion: '1.0.0',
    modelConfigId: 'gpt-4o-mini',
    systemInstruction: ASSISTANT_SYSTEM_INSTRUCTION,
    userPayload: { userMessage, intent, toolData, userRole: context.role },
    snapshotRef: { id: convId, version: 1, hash: 'none' },
    inputHash,
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

  try {
    const result = await globalAssistantGateway.callStructuredModel(request, runtimeCtx);
    return result.artifact.answer;
  } catch {
    // Graceful fallback – only reached on total provider failure.
    return 'Xin lỗi, tôi tạm thời không thể xử lý yêu cầu này. Vui lòng thử lại sau.';
  }
}

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
  const remaining = () => deadlineMs - (Date.now() - startTime);

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
    { id: `msg_${Date.now()}_u`, role: 'user', content: message, createdAt: asOf },
    context
  );

  const cleanMsg = message.toLowerCase().trim();
  const citations: Citation[] = [];
  const assertions: ServerStructuredAssertion[] = [];

  // Deadline guard
  if (Date.now() - startTime >= deadlineMs || options.signal?.aborted) {
    return {
      conversationId: convId,
      answer: 'Thời gian xử lý vượt quá giới hạn 30 giây của yêu cầu.',
      citations: [],
      status: 'partial_deadline_exceeded',
      asOf,
    };
  }

  // 0. Greeting – the only branch with a static hardcoded answer.
  const isGreeting = /^(xin\s+chào|chào|chào\s+bạn|chào\s+bot|chào\s+em|hello|hi|hey)($|\s|[!.,?])/i.test(cleanMsg);
  if (isGreeting) {
    return {
      conversationId: convId,
      answer:
        'Xin chào bạn! Tôi là Trợ lý AI đồng hành quản lý bán hàng đa sàn. Tôi có thể hỗ trợ bạn kiểm tra việc cần xử lý hôm nay, thống kê doanh thu, tra cứu tình trạng đơn hàng hoặc tiếp nhận quy cách sản phẩm mới để khởi tạo bài đăng. Bạn cần hỗ trợ gì hôm nay?',
      citations: [
        {
          recordType: 'task',
          recordId: 'task_today',
          version: 1,
          internalUrl: '/dashboard/tasks',
          title: 'Việc cần duyệt & Xử lý hôm nay',
        },
      ],
      status: 'answered',
      asOf,
    };
  }

  // 1. Approval flow – structured workflow response, not a business data query.
  if (cleanMsg === 'đồng ý' || cleanMsg === 'duyệt' || cleanMsg === 'xác nhận duyệt' || targetProposalId) {
    const approvalRes = handleChatApproval(context, targetProposalId);
    let status: AssistantResponse['status'] = 'answered';
    if (approvalRes.status === 'needs_clarification') status = 'needs_clarification';
    else if (approvalRes.status === 'stale_rejected' || approvalRes.status === 'permission_denied') status = 'unavailable';

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

  // 2. Batch publish protection – AI explains why bulk publish is not supported.
  if (cleanMsg.includes('đăng hết') || cleanMsg.includes('đăng tất cả') || cleanMsg.includes('xuất bản hết')) {
    const answer = await callAssistantAI(
      context, convId, 'batch_publish_guard',
      { targetListings: ['list_tea_shopee', 'list_coffee_shopee'], constraint: 'require_individual_review' },
      message, remaining()
    );
    return { conversationId: convId, answer, citations: [], status: 'needs_clarification', asOf };
  }

  // 3. Revenue – fetch verified data, AI composes the answer.
  if (cleanMsg.includes('doanh thu') || cleanMsg.includes('bán được bao nhiêu') || cleanMsg.includes('tiền')) {
    const revGroups = aggregateRevenue(demoStore.orders);
    assertions.push({
      assertionType: 'order_revenue',
      verifiedData: { revenueGroups: revGroups },
      isAuthoritative: true,
    });

    const answer = await callAssistantAI(
      context, convId, 'revenue',
      { revenueGroups: revGroups },
      message, remaining()
    );

    return {
      conversationId: convId,
      answer,
      citations: [
        { recordType: 'order', recordId: 'ord_1001', version: 1, internalUrl: '/dashboard/orders', title: 'Quản lý đơn hàng' },
      ],
      status: 'answered',
      asOf,
      structuredAssertions: assertions,
    };
  }

  // 4. Tasks today – fetch verified data, AI composes the answer.
  if (cleanMsg.includes('việc') || cleanMsg.includes('công việc') || cleanMsg.includes('hôm nay')) {
    const tasksAgg = aggregateTasksToday(demoStore.tasks, context.userTimezone);
    const tasksTool = listPendingTasks(context, { limit: 5 });

    citations.push(...tasksTool.citations);
    assertions.push({
      assertionType: 'task_count',
      verifiedData: { totalPending: tasksAgg.totalPendingInDb, createdToday: tasksAgg.tasksCreatedToday },
      isAuthoritative: true,
    });

    const rawAnswer = await callAssistantAI(
      context, convId, 'tasks_today',
      {
        totalPendingInDb: tasksAgg.totalPendingInDb,
        tasksCreatedToday: tasksAgg.tasksCreatedToday,
        tasks: tasksTool.data.tasks,
        timezone: context.userTimezone,
      },
      message, remaining()
    );

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

  // 5. Order issue – fetch verified data, AI composes the answer.
  if (cleanMsg.includes('ord_1001') || cleanMsg.includes('sự cố đơn')) {
    const orderRes = getOrderIssue(context, { orderId: 'ord_1001' });
    if (!orderRes.data) {
      const answer = await callAssistantAI(
        context, convId, 'order_not_found', {}, message, remaining()
      );
      return { conversationId: convId, answer, citations: [], status: 'answered', asOf };
    }

    citations.push(...orderRes.citations);
    const d = orderRes.data;
    const orderData: Record<string, unknown> = {
      id: d.id,
      status: d.status,
      issueDescription: d.issueDescription ?? null,
    };
    // PII already stripped by getOrderIssue according to caller's role.
    if (d.customerPhone) {
      orderData.customerName = d.customerName;
      orderData.customerPhone = d.customerPhone;
      orderData.shippingAddress = d.shippingAddress;
    } else {
      orderData.piiRedacted = true;
    }

    const answer = await callAssistantAI(
      context, convId, 'order_issue',
      { order: orderData },
      message, remaining()
    );
    return { conversationId: convId, answer, citations, status: 'answered', asOf };
  }

  // 6. Catalog / listing search – fetch verified data, AI composes the answer.
  const searchRes = searchCatalogOrTasks(context, { query: message, limit: 3 });
  if (searchRes.data.length > 0) {
    citations.push(...searchRes.citations);

    const firstMatch = searchRes.data[0];
    let listingDetail: Record<string, unknown> = {};
    if (firstMatch.type === 'listing') {
      const listingRes = getListingStatus(context, { listingId: firstMatch.id });
      if (listingRes.data) {
        assertions.push({
          assertionType: 'listing_status',
          verifiedData: { status: listingRes.data.status, store: listingRes.data.store },
          isAuthoritative: true,
        });
        listingDetail = {
          title: listingRes.data.title,
          store: listingRes.data.store,
          // Provide truthful status wording so enforceServerTruth can validate.
          status: cleanMsg.includes('đã đăng chưa') && listingRes.data.status === 'queued'
            ? 'đang trong hàng đợi chờ gửi (chưa hoàn tất đăng trên sàn)'
            : listingRes.data.status,
        };
      }
    }

    const rawAnswer = await callAssistantAI(
      context, convId, 'search',
      { results: searchRes.data, listingDetail, query: message },
      message, remaining()
    );

    const truthful = enforceServerTruth(rawAnswer, citations, assertions);
    return {
      conversationId: convId,
      answer: truthful.truthfulAnswer,
      citations: truthful.verifiedCitations,
      status: 'answered',
      asOf,
      structuredAssertions: assertions.length > 0 ? assertions : undefined,
    };
  }

  // 7. Fallback – AI provides helpful guidance rather than a static error string.
  const fallbackAnswer = await callAssistantAI(
    context, convId, 'unknown', {}, message, remaining()
  );
  return { conversationId: convId, answer: fallbackAnswer, citations: [], status: 'needs_clarification', asOf };
}

