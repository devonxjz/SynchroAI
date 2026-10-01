import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  RecursiveTextChunker,
  OpenAIEmbeddingProvider,
  TenantIsolatedVectorStore,
  WindowBufferHistory,
  LongTermMemoryStore,
  RagRetrieverPipeline,
  IntakeTaskDispatcher,
  globalVectorStore,
  globalContextManager,
  globalIntakeDispatcher,
} from '../../src/ai/chatbot/index.ts';

import { POST as intakePostHandler } from '../../src/app/api/chatbot/intake/route.ts';

describe('Chatbot AI Tiếp nhận & RAG (Khối 23)', () => {
  beforeEach(() => {
    globalVectorStore.clear();
    globalContextManager.clear();
    globalIntakeDispatcher.clear();
  });

  it('CB01: Phân đoạn văn bản đệ quy bảo toàn câu và ranh giới đoạn', () => {
    const chunker = new RecursiveTextChunker({ chunkSize: 300, chunkOverlap: 40 });
    const paragraph1 = 'Cà phê Robusta Đắk Lắk được canh tác theo tiêu chuẩn bền vững tại độ cao 800m so với mực nước biển. Hạt cà phê được thu hái thủ công với tỷ lệ quả chín trên 95 phần trăm.';
    const paragraph2 = 'Quy trình sơ chế ướt khép kín giúp giữ trọn hương vị nguyên bản của hạt cà phê Tây Nguyên. Độ ẩm thành phẩm luôn được kiểm soát chặt chẽ dưới 12.5 phần trăm.';
    const paragraph3 = 'Sản phẩm được rang mộc theo mức độ rang vừa, thích hợp cho cả pha phin truyền thống và pha máy espresso hiện đại.';
    const fullText = `${paragraph1}\n\n${paragraph2}\n\n${paragraph3}`;

    const chunks = chunker.chunkText(fullText, {
      documentId: 'doc_coffee_spec',
      documentVersion: 1,
      tenantId: 'tenant_synchro_vn',
      mode: 'demo',
    });

    assert.ok(chunks.length >= 2, `Cần tạo ít nhất 2 đoạn chunk, thực tế có ${chunks.length}`);
    for (const chunk of chunks) {
      assert.ok(chunk.content.length <= 350, `Kích thước chunk ${chunk.content.length} vượt quá giới hạn`);
      assert.ok(chunk.id.startsWith('chk_doc_coffee_spec_'));
      assert.equal(chunk.tenantId, 'tenant_synchro_vn');
      assert.equal(chunk.documentVersion, 1);
      // Offset verification
      const extractedText = fullText.slice(chunk.startOffset, chunk.endOffset);
      assert.equal(extractedText, chunk.content);
    }
  });

  it('CB02: Bảo toàn câu phủ định và thông số không bị chia cắt', () => {
    const chunker = new RecursiveTextChunker({ chunkSize: 120, chunkOverlap: 20 });
    const text = 'Sản phẩm đặc sản tự nhiên từ trang trại Đắk Lắk. Không sử dụng chất tạo màu hóa học và không chứa chất bảo quản nhân tạo độc hại.';

    const chunks = chunker.chunkText(text, {
      documentId: 'doc_clean_food',
      tenantId: 'tenant_synchro_vn',
    });

    // Check that "Không sử dụng chất tạo màu hóa học" is preserved inside a single chunk
    const hasNegation = chunks.some((c) =>
      c.content.includes('Không sử dụng chất tạo màu hóa học')
    );
    assert.ok(hasNegation, 'Cụm phủ định "Không sử dụng chất tạo màu hóa học" phải nằm trọn vẹn trong một chunk');
  });

  it('CB03: Tạo vector nhúng chuẩn OpenAI kích thước 1536 chiều và chuẩn hóa đơn vị', async () => {
    const provider = new OpenAIEmbeddingProvider();
    const text = 'Hạt cà phê Robusta rang mộc chuẩn vị truyền thống Tây Nguyên';

    const result = await provider.embedText(text, { tenantId: 'tenant_synchro_vn', mode: 'demo' });

    assert.equal(result.embedding.length, 1536);
    assert.ok(result.tokensUsed > 0);
    assert.equal(result.cached, false);

    // Verify unit length (L2 norm ≈ 1.0)
    const norm = Math.sqrt(result.embedding.reduce((sum, v) => sum + v * v, 0));
    assert.ok(Math.abs(norm - 1.0) < 1e-4, `Norm vector phải xấp xỉ 1.0, thực tế: ${norm}`);
  });

  it('CB04: Bộ nhớ đệm cache vector nhúng trả về tức thì với 0 token', async () => {
    const provider = new OpenAIEmbeddingProvider();
    const text = 'Chè xanh Tân Cương Thái Nguyên đóng gói 200g';

    const firstCall = await provider.embedText(text, { tenantId: 'tenant_synchro_vn', mode: 'demo' });
    assert.equal(firstCall.cached, false);
    assert.ok(firstCall.tokensUsed > 0);

    const secondCall = await provider.embedText(text, { tenantId: 'tenant_synchro_vn', mode: 'demo' });
    assert.equal(secondCall.cached, true);
    assert.equal(secondCall.tokensUsed, 0);
    assert.deepEqual(secondCall.embedding, firstCall.embedding);
  });

  it('CB05: Tìm kiếm tương đồng cosine trả về kết quả chính xác theo độ liên quan', async () => {
    const vectorStore = new TenantIsolatedVectorStore();
    const provider = new OpenAIEmbeddingProvider();

    // Ingest two distinct documents
    const doc1 = 'Trà Ô Long Bảo Lộc Lâm Đồng cao cấp thu hái búp non một tôm hai lá tại nông trường';
    const doc2 = 'Hạt điều rang muối Bình Phước loại 1 đóng gói hút chân không 500g giòn ngon';

    const emb1 = await provider.embedText(doc1);
    const emb2 = await provider.embedText(doc2);

    vectorStore.addRecords([
      {
        id: 'vec_tea',
        chunkId: 'chk_tea_1',
        embedding: emb1.embedding,
        tenantId: 'tenant_synchro_vn',
        mode: 'demo',
        documentId: 'doc_tea',
        version: 1,
        content: doc1,
        contentHash: 'hash_tea_1',
        metadata: { title: 'Trà Ô Long Lâm Đồng' },
      },
      {
        id: 'vec_cashew',
        chunkId: 'chk_cashew_1',
        embedding: emb2.embedding,
        tenantId: 'tenant_synchro_vn',
        mode: 'demo',
        documentId: 'doc_cashew',
        version: 1,
        content: doc2,
        contentHash: 'hash_cashew_1',
        metadata: { title: 'Hạt điều Bình Phước' },
      },
    ]);

    // Search query about tea origin
    const queryEmb = await provider.embedText('nguồn gốc xuất xứ của trà Ô Long');
    const results = vectorStore.similaritySearch(
      queryEmb.embedding,
      { tenantId: 'tenant_synchro_vn', mode: 'demo' },
      1,
      0.10
    );

    assert.equal(results.length, 1);
    assert.equal(results[0].chunk.documentId, 'doc_tea');
    assert.ok(results[0].chunk.content.includes('Lâm Đồng'));
    assert.ok(results[0].score > 0.10);
  });

  it('CB06: Cô lập kho vector đa doanh nghiệp, không rò rỉ dữ liệu', async () => {
    const vectorStore = new TenantIsolatedVectorStore();
    const provider = new OpenAIEmbeddingProvider();

    const text = 'Bí mật công thức nước chấm chua ngọt gia truyền';
    const emb = await provider.embedText(text);

    // Add secret for Tenant A
    vectorStore.addRecords([
      {
        id: 'vec_secret_a',
        chunkId: 'chk_secret_a',
        embedding: emb.embedding,
        tenantId: 'tenant_secret_corp',
        mode: 'demo',
        documentId: 'doc_secret',
        version: 1,
        content: text,
        contentHash: 'hash_secret',
      },
    ]);

    // Tenant B queries the exact same text
    const queryEmb = await provider.embedText('công thức nước chấm');
    const resultsForB = vectorStore.similaritySearch(
      queryEmb.embedding,
      { tenantId: 'tenant_other_corp', mode: 'demo' },
      5,
      0.10
    );

    assert.equal(resultsForB.length, 0, 'Tenant B tuyệt đối không nhận được dữ liệu của Tenant A');
  });

  it('CB07: Cửa sổ trượt ngắn hạn LangChain duy trì tối đa 6 lượt và trần token', () => {
    const history = new WindowBufferHistory({ maxTurns: 6, tokenCeiling: 2000 });

    for (let i = 1; i <= 10; i++) {
      history.addTurn(i % 2 === 1 ? 'user' : 'assistant', `Tin nhắn thứ ${i} trong chuỗi trao đổi hội thoại`);
    }

    const turns = history.getTurns();
    assert.equal(turns.length, 6, `Cửa sổ phải cắt tỉa còn đúng 6 lượt gần nhất, thực tế: ${turns.length}`);
    assert.equal(turns[0].content, 'Tin nhắn thứ 5 trong chuỗi trao đổi hội thoại');
    assert.equal(turns[5].content, 'Tin nhắn thứ 10 trong chuỗi trao đổi hội thoại');
    assert.ok(history.getTotalTokens() <= 2000);
  });

  it('CB08: Trích xuất và nạp ký ức dài hạn xuyên suốt các phiên làm việc', () => {
    const memoryStore = new LongTermMemoryStore();

    // Session 1: Save seller preference
    memoryStore.saveMemory({
      tenantId: 'tenant_vietnam',
      userId: 'user_seller_1',
      memoryType: 'preference',
      key: 'export_market',
      value: { preferredMarket: 'Thái Lan', defaultPackaging: '250g' },
    });

    // Session 2: Retrieve memory
    const loadedMemories = memoryStore.getMemories('tenant_vietnam', 'user_seller_1', 'preference');
    assert.equal(loadedMemories.length, 1);
    assert.equal(loadedMemories[0].key, 'export_market');
    assert.deepEqual(loadedMemories[0].value, {
      preferredMarket: 'Thái Lan',
      defaultPackaging: '250g',
    });
    assert.equal(loadedMemories[0].version, 1);

    // Cross-tenant check: Other tenant gets nothing
    const otherMemories = memoryStore.getMemories('tenant_foreign', 'user_seller_1');
    assert.equal(otherMemories.length, 0);
  });

  it('CB09: Lọc PII trong bộ nhớ khi người dùng là vai trò Viewer', () => {
    const history = new WindowBufferHistory();
    history.addTurn('user', 'Số điện thoại của khách hàng cần tư vấn là 0912345678, liên hệ ngay nhé.');

    const adminTurns = history.getTurns('admin');
    assert.ok(adminTurns[0].content.includes('0912345678'));

    const viewerTurns = history.getTurns('viewer');
    assert.ok(!viewerTurns[0].content.includes('0912345678'), 'Số điện thoại phải bị che đối với Viewer');
    assert.ok(viewerTurns[0].content.includes('[REDACTED_PHONE]'));
  });

  it('CB10: Truy xuất RAG và tạo dẫn chứng citation chính xác', async () => {
    const pipeline = new RagRetrieverPipeline();
    const docText = 'Chính sách bảo hành sản phẩm: Đổi trả 1-1 trong vòng 30 ngày nếu phát hiện lỗi từ nhà sản xuất. Địa chỉ trung tâm bảo hành: 123 Đường Nông Sản, Buôn Ma Thuột.';

    await pipeline.ingestDocument(docText, {
      documentId: 'doc_warranty_policy',
      tenantId: 'tenant_synchro_vn',
      mode: 'demo',
      title: 'Chính sách bảo hành',
    });

    const output = await pipeline.retrieve('chính sách đổi trả bảo hành', {
      tenantId: 'tenant_synchro_vn',
      mode: 'demo',
      scoreThreshold: 0.50,
    });

    assert.ok(output.results.length >= 1);
    assert.equal(output.citations.length, output.results.length);
    assert.equal(output.citations[0].recordType, 'product');
    assert.equal(output.citations[0].recordId, 'doc_warranty_policy');
    assert.ok(output.formattedContext.includes('Đổi trả 1-1 trong vòng 30 ngày'));
  });

  it('CB11: Chuyển giao nhiệm vụ có cấu trúc tạo ProductSnapshot và draft mà không tự ý khởi chạy', () => {
    const dispatcher = new IntakeTaskDispatcher();
    const context = {
      tenantId: 'tenant_vietnam',
      userId: 'user_editor_1',
      role: 'editor',
      mode: 'demo',
      permissions: ['edit_content'],
      userTimezone: 'Asia/Ho_Chi_Minh',
    };

    const text = 'Tên sản phẩm: Cà phê Rang Xay Truyền Thống\nQuy cách: 500g\nXuất xứ: Đắk Lắk\nThương hiệu: Synchro Farm';

    const result = dispatcher.createDraft({
      context,
      text,
      store: 'Shopee Official Store',
      targetLocale: 'th',
      intent: 'prepare_listing',
    });

    assert.equal(result.draft.status, 'ready');
    assert.equal(result.draft.productSnapshot.title, 'Cà phê Rang Xay Truyền Thống');
    assert.equal(result.draft.productSnapshot.attributes.weight, '500g');
    assert.equal(result.draft.productSnapshot.attributes.origin, 'Đắk Lắk');
    assert.equal(result.draft.productSnapshot.attributes.brand, 'Synchro Farm');
    assert.equal(result.draft.store, 'Shopee Official Store');
    assert.equal(result.draft.targetLocale, 'th');
    assert.equal(result.draft.version, 1);
    assert.ok(result.draft.draftHash);
    // Draft created but NOT activated yet
    assert.equal(result.draft.runId, undefined);
  });

  it('CB12: Kiểm thử toàn trình qua API route /api/chatbot/intake trả về đầy đủ RAG và bản nháp', async () => {
    const req = new Request('http://localhost:3000/api/chatbot/intake', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': 'tenant_vietnam',
        'x-user-id': 'user_seller_1',
        'x-user-role': 'admin',
        'x-mode': 'demo',
      },
      body: JSON.stringify({
        idempotencyKey: 'cb12_key',
        message: 'Tạo bài đăng Shopee mới cho sản phẩm nông sản',
        documentText: 'Tên sản phẩm: Trà Ô Long Búp Non\nTrọng lượng: 250g\nXuất xứ: Lâm Đồng\nThương hiệu: Bảo Lộc Tea',
      }),
    });

    const response = await intakePostHandler(req);
    assert.equal(response.status, 200);

    const data = await response.json();
    assert.ok(data.conversationId);
    assert.ok(data.answer);
    assert.ok(Array.isArray(data.ragCitations));
    assert.ok(Array.isArray(data.longTermMemories));
    assert.ok(data.draft);
    assert.equal(data.draft.productSnapshot.title, 'Trà Ô Long Búp Non');
    assert.equal(data.draft.productSnapshot.attributes.weight, '250g');
    assert.equal(data.draft.status, 'ready');
  });
});
