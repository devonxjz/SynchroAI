import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  RagRetrieverPipeline,
  OpenAIEmbeddingProvider,
  globalEmbeddingBudgetLedger,
  globalContextManager,
} from '../../src/ai/chatbot/index.ts';
import { classifyChatRoute, CHAT_MESSAGE_ENDPOINT } from '../../src/ai/chatbot/router.ts';
import { handleIntakeRequest } from '../../src/ai/chatbot/intake-handler.ts';
import { ModelCallGateway } from '../../src/ai/model-call/gateway.ts';
import { FixtureModelProvider } from '../../src/ai/model-call/providers/fixture-provider.ts';
import { runAssistant } from '../../src/ai/agents/assistant/agent.ts';

class RecordingFixtureProvider extends FixtureModelProvider {
  recordedRequests = [];

  async call(request, context) {
    this.recordedRequests.push({ request, context });
    return super.call(request, context);
  }
}

const adminContext = {
  tenantId: 'tenant_vietnam',
  userId: 'user_admin_1',
  role: 'admin',
  mode: 'demo',
  permissions: ['manage_all'],
  userTimezone: 'Asia/Ho_Chi_Minh',
};

const SPEC_TEXT =
  'Tên sản phẩm: Trà Ô Long Bảo Lộc\n' +
  'Trọng lượng: 250g\n' +
  'Xuất xứ: Lâm Đồng, Việt Nam\n' +
  'Thương hiệu: Bảo Lộc Tea\n' +
  'Quy cách: Hộp giấy kraft 250g, bảo quản nơi khô ráo.';

function makeRecordingGateway() {
  const recordingProvider = new RecordingFixtureProvider();
  const gateway = new ModelCallGateway({
    fixtureProvider: recordingProvider,
    liveProvider: recordingProvider,
    liveApiKeyConfigured: true,
  });
  return { gateway, recordingProvider };
}

describe('R1-01: Bộ định tuyến chat được quyết định ở máy chủ', () => {
  it('R1-01a: Kèm tài liệu thì phân loại sang intake, không thì sang assistant', () => {
    assert.equal(classifyChatRoute({ message: 'Xin chào', documentText: '' }), 'assistant');
    assert.equal(
      classifyChatRoute({ message: 'Dán quy cách', documentText: 'Tên sản phẩm: Trà' }),
      'intake'
    );
  });

  it('R1-01b: Chỉ có khoảng trắng trong documentText vẫn là assistant', () => {
    assert.equal(classifyChatRoute({ message: 'Hello', documentText: '   \n ' }), 'assistant');
  });

  it('R1-01c: Endpoint chat hợp nhất tồn tại cho UI gọi tới', async () => {
    assert.equal(CHAT_MESSAGE_ENDPOINT, '/api/chatbot/message');
    const mod = await import('../../src/app/api/chatbot/message/route.ts');
    assert.equal(typeof mod.POST, 'function');
  });

  it('R1-01d: UI chỉ gọi một endpoint duy nhất, không phân loại bằng documentText phía client', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(
      new URL('../../src/app/dashboard/ai/page.tsx', import.meta.url),
      'utf8'
    );
    assert.ok(
      source.includes(CHAT_MESSAGE_ENDPOINT),
      'UI phải gửi tới endpoint chat hợp nhất'
    );
    assert.ok(
      !source.includes('isIntakeRequest'),
      'UI không được tự phân loại endpoint theo documentText'
    );
  });
});

describe('R2: Câu trả lời intake do model tạo, có dùng ngữ cảnh RAG', () => {
  let gateway;
  let recordingProvider;

  beforeEach(() => {
    globalEmbeddingBudgetLedger.setTenantLimit(adminContext.tenantId, 10.0);
    globalEmbeddingBudgetLedger.release(
      adminContext.tenantId,
      globalEmbeddingBudgetLedger.getBalance(adminContext.tenantId).reservedUsd
    );
    const made = makeRecordingGateway();
    gateway = made.gateway;
    recordingProvider = made.recordingProvider;
  });

  it('R2-01: handleIntakeRequest phải đi qua ModelCallGateway, không trả chuỗi template cứng', async () => {
    const { status } = await handleIntakeRequest(
      adminContext,
      {
        message: 'Tạo bài đăng cho Trà Ô Long Bảo Lộc',
        documentText: SPEC_TEXT,
        idempotencyKey: 'key_r2_01',
      },
      { gateway }
    );

    assert.equal(status, 200);

    const intakeCalls = recordingProvider.recordedRequests.filter(
      (r) => r.request.agentName === 'intake_answer'
    );
    assert.equal(
      intakeCalls.length,
      1,
      `Phải gọi đúng 1 model call intake_answer, thực tế ${intakeCalls.length}`
    );
    assert.ok(intakeCalls[0].context.mode === 'demo', 'Demo phải chạy qua fixture provider');
  });

  it('R2-02: Model phải nhận ngữ cảnh RAG chứa nội dung tài liệu vừa dán', async () => {
    await handleIntakeRequest(
      adminContext,
      { message: 'Tạo bài đăng', documentText: SPEC_TEXT, idempotencyKey: 'key_r2_02' },
      { gateway }
    );

    const intakeCall = recordingProvider.recordedRequests.find(
      (r) => r.request.agentName === 'intake_answer'
    );
    assert.ok(intakeCall, 'Chưa có model call intake_answer');

    const payload = intakeCall.request.userPayload;
    assert.ok(
      typeof payload.formattedContext === 'string' && payload.formattedContext.length > 0,
      'formattedContext không được rỗng khi người dùng đã dán tài liệu'
    );
    assert.ok(
      payload.formattedContext.includes('Bảo Lộc') || payload.formattedContext.includes('Lâm Đồng'),
      'formattedContext phải chứa nội dung thực của tài liệu'
    );
  });

  it('R2-03: Câu trả lời cuối do model sinh ra, không phải chuỗi template', async () => {
    const { body } = await handleIntakeRequest(
      adminContext,
      { message: 'Tạo bài đăng', documentText: SPEC_TEXT, idempotencyKey: 'key_r2_03' },
      { gateway }
    );

    assert.ok(body.generatedBy, 'Phải trả về generatedBy để phân biệt demo/live');
    assert.equal(body.generatedBy, 'demo_fixture');
    assert.ok(
      body.answer.includes('Trà Ô Long Bảo Lộc'),
      'Câu trả lời phải lấy từ model call với tiêu đề sản phẩm thực'
    );
  });
});

describe('R3: Ký ức dài hạn được ghi và trả về từ intake', () => {
  beforeEach(() => {
    globalContextManager.clear();
  });

  it('R3-01: Draft ready ghi default_store và packaging_pref, response trả về ký ức', async () => {
    const { gateway } = makeRecordingGateway();

    const first = await handleIntakeRequest(
      adminContext,
      { message: 'Tạo bài đăng', documentText: SPEC_TEXT, idempotencyKey: 'key_r3_01' },
      { gateway }
    );

    assert.equal(first.status, 200);
    assert.equal(first.body.draft.status, 'ready');

    const keys = first.body.longTermMemories.map((m) => m.key);
    assert.ok(keys.includes('default_store'), `Thiếu default_store: ${keys.join(', ')}`);
    assert.ok(keys.includes('packaging_pref'), `Thiếu packaging_pref: ${keys.join(', ')}`);

    const storeMemory = first.body.longTermMemories.find((m) => m.key === 'default_store');
    assert.equal(storeMemory.value, 'Shopee VN');

    const packagingMemory = first.body.longTermMemories.find((m) => m.key === 'packaging_pref');
    assert.equal(packagingMemory.value, '250g');
  });

  it('R3-02: Ký ức tồn tại giữa hai lần gọi intake khác nhau', async () => {
    const { gateway } = makeRecordingGateway();

    await handleIntakeRequest(
      adminContext,
      { message: 'Tạo bài đăng', documentText: SPEC_TEXT, idempotencyKey: 'key_r3_02_a' },
      { gateway }
    );

    const second = await handleIntakeRequest(
      adminContext,
      { message: 'Tạo bài đăng cho sản phẩm khác', documentText: SPEC_TEXT, idempotencyKey: 'key_r3_02_b' },
      { gateway }
    );

    const storeMemory = second.body.longTermMemories.find((m) => m.key === 'default_store');
    assert.ok(storeMemory, 'Ký ức phải được giữ giữa các phiên');
    assert.equal(storeMemory.version, 2, 'Ký ức trùng key phải được cộng phiên bản');
  });

  it('R3-03: Mở đầu UI không còn hiển thị ký ức giả cứng', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(
      new URL('../../src/app/dashboard/ai/page.tsx', import.meta.url),
      'utf8'
    );
    assert.ok(!source.includes('packaging_pref'), 'UI không được hardcode ký ức packaging_pref');
    assert.ok(!source.includes('default_store'), 'UI không được hardcode ký ức default_store');
  });
});

describe('R4: Idempotency được thực thi trên route intake', () => {
  it('R4-01: Cùng key + cùng payload trả về cùng một draftId', async () => {
    const reqBody = {
      message: 'Tạo bài đăng',
      documentText: SPEC_TEXT,
      idempotencyKey: 'key_r4_shared',
    };
    const makeReq = () =>
      new Request('http://localhost:3000/api/chatbot/intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-mode': 'demo' },
        body: JSON.stringify(reqBody),
      });

    const { POST } = await import('../../src/app/api/chatbot/intake/route.ts');
    const first = await POST(makeReq());
    const second = await POST(makeReq());

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);

    const a = await first.json();
    const b = await second.json();

    assert.ok(a.draft, 'Lần gọi đầu phải có draft');
    assert.ok(b.draft, 'Lần gọi thứ hai phải là bản replay');
    assert.equal(a.draft.draftId, b.draft.draftId, 'Cùng key phải trả về cùng draft');
  });

  it('R4-02: Cùng key nhưng payload khác bị từ chối 409', async () => {
    const { POST } = await import('../../src/app/api/chatbot/intake/route.ts');
    const first = await POST(
      new Request('http://localhost:3000/api/chatbot/intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-mode': 'demo' },
        body: JSON.stringify({
          message: 'Tạo bài đăng A',
          documentText: SPEC_TEXT,
          idempotencyKey: 'key_r4_conflict',
        }),
      })
    );
    assert.equal(first.status, 200);

    const second = await POST(
      new Request('http://localhost:3000/api/chatbot/intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-mode': 'demo' },
        body: JSON.stringify({
          message: 'Tạo bài đăng KHÁC HOÀN TOÀN',
          documentText: SPEC_TEXT,
          idempotencyKey: 'key_r4_conflict',
        }),
      })
    );
    assert.equal(second.status, 409, 'Cùng key khác payload phải trả 409');
  });

  it('R4-03: Thiếu idempotencyKey bị từ chối 400', async () => {
    const { POST } = await import('../../src/app/api/chatbot/intake/route.ts');
    const res = await POST(
      new Request('http://localhost:3000/api/chatbot/intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-mode': 'demo' },
        body: JSON.stringify({ message: 'Tạo bài đăng', documentText: SPEC_TEXT }),
      })
    );
    assert.equal(res.status, 400);
  });
});

describe('R5: Assistant có trí nhớ hội thoại đưa vào prompt', () => {
  let gateway;
  let recordingProvider;
  const conversationContext = {
    ...adminContext,
    userId: 'user_memory_1',
    mode: 'demo',
  };

  beforeEach(() => {
    const made = makeRecordingGateway();
    gateway = made.gateway;
    recordingProvider = made.recordingProvider;
  });

  it('R5-01: Lượt thứ hai phải thấy lượt thứ nhất trong history gửi lên model', async () => {
    const first = await runAssistant(
      conversationContext,
      'Doanh thu hôm nay bao nhiêu?',
      undefined,
      undefined,
      { gateway }
    );
    assert.ok(first.conversationId);

    await runAssistant(
      conversationContext,
      'Còn bao nhiêu nữa?',
      first.conversationId,
      undefined,
      { gateway }
    );

    const secondCall = recordingProvider.recordedRequests.find(
      (r) => r.request.userPayload.history !== undefined
    );
    assert.ok(secondCall, 'userPayload phải có trường history');

    const history = secondCall.request.userPayload.history;
    assert.ok(Array.isArray(history), 'history phải là mảng');
    assert.ok(
      history.some((m) => m.content.includes('Doanh thu hôm nay bao nhiêu?')),
      'History phải chứa câu hỏi của lượt trước'
    );
  });

  it('R5-02: Câu trả lời của assistant được lưu vào conversation', async () => {
    const first = await runAssistant(
      conversationContext,
      'Doanh thu hôm nay bao nhiêu?',
      undefined,
      undefined,
      { gateway }
    );

    const { globalConversationManager } = await import(
      '../../src/ai/agents/assistant/conversation.ts'
    );
    const conv = globalConversationManager.getConversation(first.conversationId, conversationContext);
    assert.ok(conv, 'Conversation phải tồn tại');
    assert.ok(
      conv.messages.some((m) => m.role === 'assistant'),
      'Phải lưu tin nhắn của assistant'
    );
  });

  it('R5-03: Viewer nhận history đã che PII', async () => {
    const viewerContext = { ...conversationContext, userId: 'user_viewer_9', role: 'viewer' };

    const first = await runAssistant(
      viewerContext,
      'Số điện thoại khách là 0912345678 liên hệ gấp',
      undefined,
      undefined,
      { gateway }
    );
    await runAssistant(
      viewerContext,
      'Nhắc lại số điện thoại giúp tôi',
      first.conversationId,
      undefined,
      { gateway }
    );

    const callWithHistory = recordingProvider.recordedRequests.find(
      (r) => r.request.userPayload.history !== undefined
    );
    assert.ok(callWithHistory);
    const flat = JSON.stringify(callWithHistory.request.userPayload.history);
    assert.ok(!flat.includes('0912345678'), 'Viewer không được thấy PII trong history');
    assert.ok(flat.includes('REDACTED'));
  });
});

describe('R6: Truy xuất RAG không bỏ sót và không giữ chunk cũ', () => {
  const tenant = 'tenant_retrieval_1';

  it('R6-01: Nhập lại cùng documentId phải xóa chunk phiên bản cũ trước', async () => {
    const pipeline = new RagRetrieverPipeline();

    await pipeline.ingestDocument(
      'Tên sản phẩm: Trà Ô Long\nQuy cách 250g\nXuất xứ Lâm Đồng\nMô tả: sản phẩm cao cấp số một.',
      { documentId: 'doc_reingest', tenantId: tenant, mode: 'demo', documentVersion: 1 }
    );
    const afterV1 = pipeline.getVectorStore().getRecordCount(tenant, 'demo');
    assert.ok(afterV1 >= 2, `V1 phải tạo từ 2 chunk, thực tế ${afterV1}`);

    await pipeline.ingestDocument('Tên sản phẩm: Trà Ô Long v2', {
      documentId: 'doc_reingest',
      tenantId: tenant,
      mode: 'demo',
      documentVersion: 2,
    });

    const afterV2 = pipeline.getVectorStore().getRecordCount(tenant, 'demo');
    assert.equal(afterV2, 1, `Sau khi nhập v2 chỉ còn 1 chunk, thực tế ${afterV2}`);

    const { embedding } = await new OpenAIEmbeddingProvider().embedText('Trà Ô Long');
    const results = pipeline.getVectorStore().similaritySearch(
      embedding,
      { tenantId: tenant, mode: 'demo' },
      10,
      0.0
    );
    const versions = [...new Set(results.map((r) => r.chunk.documentVersion))];
    assert.deepEqual(versions, [2], `Không được trả về chunk v1 cũ, thực tế versions=${versions}`);
  });

  it('R6-02: Câu hỏi nhiều động từ vẫn truy xuất được nhờ ngữ cảnh vừa dán', async () => {
    const { gateway, recordingProvider } = makeRecordingGateway();

    const { body } = await handleIntakeRequest(
      adminContext,
      {
        message: 'tạo bài đăng cho trà ô long',
        documentText: SPEC_TEXT,
        idempotencyKey: 'key_r6_02',
      },
      { gateway }
    );

    const intakeCall = recordingProvider.recordedRequests.find(
      (r) => r.request.agentName === 'intake_answer'
    );
    assert.ok(intakeCall);
    assert.ok(
      intakeCall.request.userPayload.formattedContext.length > 0,
      'Ngữ cảnh không được rỗng dù câu hỏi có nhiều động từ'
    );
    assert.ok(body.draft, 'Vẫn phải tạo được draft');
  });

  it('R6-03: Ngưỡng điểm mặc định theo spec là 0.70, không bị hạ âm thầm còn 0.65', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(
      new URL('../../src/app/api/chatbot/intake/route.ts', import.meta.url),
      'utf8'
    );
    assert.ok(
      !source.includes('scoreThreshold: 0.65'),
      'Route intake không được hạ ngưỡng điểm xuống 0.65'
    );
    assert.ok(source.includes('scoreThreshold'), 'Vẫn phải truyền ngưỡng điểm từ spec');
  });

  it('R6-04: Trích xuất CTA dẫn về trang sản phẩm đang có, không phải /dashboard/catalog 404', async () => {
    const pipeline = new RagRetrieverPipeline();
    await pipeline.ingestDocument(SPEC_TEXT, {
      documentId: 'doc_cta',
      tenantId: tenant,
      mode: 'demo',
      title: 'Trà Ô Long Bảo Lộc',
    });

    const output = await pipeline.retrieve('quy cách đóng gói', {
      tenantId: tenant,
      mode: 'demo',
      scoreThreshold: 0.0,
    });

    assert.ok(output.citations.length > 0);
    const url = output.citations[0].internalUrl;
    assert.ok(!url.includes('/dashboard/catalog/'), `CTA trỏ tới route không tồn tại: ${url}`);
    assert.ok(url.includes('/dashboard/products'), `CTA phải trỏ tới /dashboard/products: ${url}`);
  });
});

describe('R7: Lỗi nhúng live không bị nuốt thành vector giả', () => {
  let originalFetch;

  afterEach(() => {
    if (originalFetch) {
      globalThis.fetch = originalFetch;
      originalFetch = undefined;
    }
  });

  it('R7-01: Live mode mà API lỗi phải báo lỗi, không rơi về vector hash', async () => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      throw new Error('ECONNREFUSED fake');
    };

    const provider = new OpenAIEmbeddingProvider({ apiKey: 'sk_fake_test' });
    await assert.rejects(
      async () => provider.embedText('Trà Ô Long Lâm Đồng', { tenantId: 't1', mode: 'live' }),
      /ECONNREFUSED fake|không thể nhúng/i,
      'Lỗi live phải được nêu ra thay vì nuốt'
    );
  });

  it('R7-02: Demo mode vẫn dùng vector tất định không phụ thuộc mạng', async () => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      throw new Error('không được gọi fetch trong demo');
    };

    const provider = new OpenAIEmbeddingProvider({ apiKey: 'sk_fake_test' });
    const res = await provider.embedText('Trà Ô Long Lâm Đồng', {
      tenantId: 'tenant_vietnam',
      mode: 'demo',
    });
    assert.equal(res.embedding.length, 1536);
  });
});

describe('R8: Chi phí nhúng được ghi vào BudgetLedger', () => {
  it('R8-01: Provider không truyền budgetLedger vẫn ghi chi phí vào ledger dùng chung', async () => {
    const before = globalEmbeddingBudgetLedger.getBalance('tenant_budget_1');

    const provider = new OpenAIEmbeddingProvider();
    await provider.embedText('Sản phẩm cà phê Robusta rang mộc 500g', {
      tenantId: 'tenant_budget_1',
      mode: 'demo',
    });

    const after = globalEmbeddingBudgetLedger.getBalance('tenant_budget_1');
    assert.ok(
      after.spentUsd > before.spentUsd,
      `Chi phí nhúng phải được ghi nhận: ${before.spentUsd} -> ${after.spentUsd}`
    );
    assert.equal(after.reservedUsd, 0, 'Không được giữ reservation sau khi commit');
  });
});
