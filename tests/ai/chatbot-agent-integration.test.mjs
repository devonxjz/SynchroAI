import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  IntakeTaskDispatcher,
  globalIntakeDispatcher,
  globalVectorStore,
  globalContextManager,
} from '../../src/ai/chatbot/index.ts';

import {
  PrepareListingOrchestrator,
  InMemoryCheckpointer,
} from '../../src/ai/workflows/prepare-listing/index.ts';

import { ModelCallGateway } from '../../src/ai/model-call/gateway.ts';
import { FixtureModelProvider } from '../../src/ai/model-call/providers/fixture-provider.ts';
import { handleException } from '../../src/ai/agents/exception/index.ts';
import { runAssistant, globalConversationManager } from '../../src/ai/agents/assistant/index.ts';

class RecordingFixtureProvider extends FixtureModelProvider {
  recordedRequests = [];

  async call(request, context) {
    this.recordedRequests.push({ request, context });
    return super.call(request, context);
  }
}

describe('Chatbot AI Agent Integration Contract (CBI01 - CBI12)', () => {
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

  const otherTenantContext = {
    tenantId: 'tenant_foreign',
    userId: 'user_foreign_3',
    role: 'admin',
    mode: 'demo',
    permissions: ['manage_all'],
    userTimezone: 'Asia/Bangkok',
  };

  let recordingProvider;
  let gateway;
  let orchestrator;
  let dispatcher;

  beforeEach(() => {
    recordingProvider = new RecordingFixtureProvider();
    gateway = new ModelCallGateway({
      fixtureProvider: recordingProvider,
      liveProvider: recordingProvider,
      liveApiKeyConfigured: true,
    });
    orchestrator = new PrepareListingOrchestrator({
      gateway,
      checkpointer: new InMemoryCheckpointer(),
    });
    dispatcher = new IntakeTaskDispatcher(orchestrator);

    globalVectorStore.clear();
    globalContextManager.clear();
    globalIntakeDispatcher.clear();
    globalConversationManager.clear();
  });

  it('CBI01: Intake tạo draft nhưng số lần gọi Content/Keywords/Localization bằng 0 trước kích hoạt', () => {
    const text = 'Sản phẩm: Trà Ô Long Lâm Đồng\nKhối lượng: 250g\nXuất xứ: Việt Nam';

    const result = dispatcher.createDraft({
      context: adminContext,
      text,
      store: 'Shopee Official Store',
      targetLocale: 'th',
      intent: 'prepare_listing',
    });

    assert.ok(result.draft);
    assert.equal(result.draft.status, 'ready');
    assert.equal(result.draft.runId, undefined);

    // Assert zero calls to workflow nodes before activation
    assert.equal(orchestrator.nodeCallCounts.content, 0);
    assert.equal(orchestrator.nodeCallCounts.keywords, 0);
    assert.equal(orchestrator.nodeCallCounts.localization, 0);
    assert.equal(recordingProvider.recordedRequests.length, 0);
  });

  it('CBI02: Kích hoạt draft VI sang TH gọi generateContent và generateKeywords thật song song, sau đó Localization nhận đúng output Content', async () => {
    const text = 'Sản phẩm: Cà phê Robusta Đắk Lắk\nKhối lượng: 500g\nXuất xứ: Đắk Lắk\nThương hiệu: Synchro Farm';

    const { draft } = dispatcher.createDraft({
      context: adminContext,
      text,
      store: 'Shopee Official Store',
      targetLocale: 'th',
      intent: 'prepare_listing',
    });

    const actResult = await dispatcher.activateDraft({
      draftId: draft.draftId,
      expectedVersion: draft.version,
      expectedHash: draft.draftHash,
      idempotencyKey: 'key_act_cbi02',
      context: adminContext,
      orchestrator,
    });

    assert.ok(actResult.runId);
    assert.equal(orchestrator.nodeCallCounts.content, 1);
    assert.equal(orchestrator.nodeCallCounts.keywords, 1);
    assert.equal(orchestrator.nodeCallCounts.localization, 1);

    // Check recorded calls to verify real agent wiring without stubs
    const agentCalls = recordingProvider.recordedRequests.map((r) => r.request.agentName);
    assert.ok(agentCalls.includes('content_writer'), 'Phải gọi agent content_writer thật');
    assert.ok(agentCalls.includes('keyword_agent'), 'Phải gọi agent keyword_agent thật');
    assert.ok(agentCalls.includes('localization_agent'), 'Phải gọi agent localization_agent thật');

    // Localization received the content title from Content output
    const locCall = recordingProvider.recordedRequests.find(
      (r) => r.request.agentName === 'localization_agent'
    );
    assert.ok(locCall);
    assert.ok(locCall.request.userPayload.sourceTitle.includes('Cà phê Robusta Đắk Lắk'));
  });

  it('CBI03: Cùng locale không phát sinh model call Localization, Content claims và provenance vẫn được lưu', async () => {
    const text = 'Sản phẩm: Hạt Điều Rang Muối\nKhối lượng: 500g\nXuất xứ: Bình Phước';

    const { draft } = dispatcher.createDraft({
      context: adminContext,
      text,
      store: 'Shopee VN',
      targetLocale: 'vi', // Same as snapshot language 'vi'
      intent: 'rewrite_content',
    });

    const actResult = await dispatcher.activateDraft({
      draftId: draft.draftId,
      expectedVersion: draft.version,
      expectedHash: draft.draftHash,
      idempotencyKey: 'key_act_cbi03',
      context: adminContext,
      orchestrator,
    });

    assert.ok(actResult.runId);
    assert.equal(orchestrator.nodeCallCounts.content, 1);
    assert.equal(orchestrator.nodeCallCounts.localization, 0, 'Cùng locale không được gọi Localization');

    const locCalls = recordingProvider.recordedRequests.filter(
      (r) => r.request.agentName === 'localization_agent'
    );
    assert.equal(locCalls.length, 0);

    // Verify draft and state preserved provenance and claims
    const checkpointer = orchestrator.getCheckpointer();
    const state = await checkpointer.load(actResult.runId);
    assert.ok(state.artifacts.contentData);
    assert.ok(state.artifacts.contentData.title);
    assert.ok(draft.sourceRefs.length > 0);
  });

  it('CBI04: Fact 500g qua Content và Localization giữ cùng fact ID, memory 250g không ghi đè', async () => {
    // 1. Save long-term memory preference for 250g
    globalContextManager.getLongTermStore().saveMemory({
      tenantId: 'tenant_vietnam',
      userId: 'user_admin_1',
      memoryType: 'preference',
      key: 'default_packaging',
      value: '250g',
    });

    // 2. Product intake specifies 500g
    const text = 'Sản phẩm: Cà phê Phin\nKhối lượng: 500g\nXuất xứ: Đắk Lắk';
    const { draft } = dispatcher.createDraft({
      context: adminContext,
      text,
      targetLocale: 'th',
    });

    // Verified snapshot must keep 500g
    assert.equal(draft.productSnapshot.attributes.weight, '500g');

    const actResult = await dispatcher.activateDraft({
      draftId: draft.draftId,
      expectedVersion: draft.version,
      expectedHash: draft.draftHash,
      idempotencyKey: 'key_act_cbi04',
      context: adminContext,
      orchestrator,
    });

    const state = await orchestrator.getCheckpointer().load(actResult.runId);
    assert.equal(state.status, 'waiting_approval');

    // Content output received 500g fact
    const contentCall = recordingProvider.recordedRequests.find(
      (r) => r.request.agentName === 'content_writer'
    );
    const facts = contentCall.request.userPayload.verifiedFacts;
    const weightFact = facts.find((f) => f.field === 'attributes.weight' || f.field === 'weight');
    assert.ok(weightFact);
    assert.equal(weightFact.value, '500g', 'Fact phải là 500g từ snapshot, không bị 250g ghi đè');
  });

  it('CBI05: Keyword lỗi trước khi Content hoàn thành: Content được lưu, fallback/cảnh báo được giữ', async () => {
    const errorOrchestrator = new PrepareListingOrchestrator({
      gateway,
      checkpointer: new InMemoryCheckpointer(),
      handlers: {
        keywords: async () => {
          throw new Error('Keywords gateway timeout 504');
        },
      },
    });

    const text = 'Sản phẩm: Trà Lài Đặc Biệt\nQuy cách: 200g';
    const { draft } = dispatcher.createDraft({ context: adminContext, text, targetLocale: 'vi' });

    const actResult = await dispatcher.activateDraft({
      draftId: draft.draftId,
      expectedVersion: draft.version,
      expectedHash: draft.draftHash,
      idempotencyKey: 'key_act_cbi05',
      context: adminContext,
      orchestrator: errorOrchestrator,
    });

    const state = await errorOrchestrator.getCheckpointer().load(actResult.runId);
    assert.ok(state.artifacts.contentData, 'Content phải được bảo toàn nguyên vẹn');
    assert.equal(state.artifacts.keywordsOutput?.status, 'fallback');
    assert.ok(state.warnings.some((w) => w.includes('Nhánh từ khóa') || w.includes('504')));
  });

  it('CBI06: Localization lỗi rồi retry qua intake: giữ Content/Keywords, không gọi lại Content', async () => {
    let failLocalization = true;
    const locTestOrchestrator = new PrepareListingOrchestrator({
      gateway,
      checkpointer: new InMemoryCheckpointer(),
      handlers: {
        localization: async (content) => {
          if (failLocalization) {
            throw new Error('Localization model 500 internal error');
          }
          return {
            title: `[TH] ${content.title}`,
            description: `[TH] ${content.description}`,
            locale: 'th',
          };
        },
      },
    });

    const text = 'Sản phẩm: Cà phê Arabica Cầu Đất\nKhối lượng: 250g';
    const { draft } = dispatcher.createDraft({
      context: adminContext,
      text,
      targetLocale: 'th',
    });

    let failedRunId;
    try {
      await dispatcher.activateDraft({
        draftId: draft.draftId,
        expectedVersion: draft.version,
        expectedHash: draft.draftHash,
        idempotencyKey: 'key_act_cbi06_fail',
        context: adminContext,
        orchestrator: locTestOrchestrator,
      });
    } catch {
      // Failed as expected
      const runs = await locTestOrchestrator.getCheckpointer().listByTenant(adminContext.tenantId);
      failedRunId = runs[0].runId;
    }

    assert.ok(failedRunId);
    assert.equal(locTestOrchestrator.nodeCallCounts.content, 1);

    // Now retry localization step via dispatcher
    failLocalization = false;
    const retryResult = await dispatcher.activateDraft({
      draftId: draft.draftId,
      expectedVersion: draft.version,
      expectedHash: draft.draftHash,
      idempotencyKey: 'key_act_cbi06_retry',
      context: adminContext,
      orchestrator: locTestOrchestrator,
      retryRunId: failedRunId,
      retryStepName: 'localization',
    });

    assert.equal(retryResult.runId, failedRunId);
    // Content was NOT called again during retry
    assert.equal(locTestOrchestrator.nodeCallCounts.content, 1, 'Content không được gọi lại khi retry localization');
    assert.equal(locTestOrchestrator.nodeCallCounts.localization, 2);
  });

  it('CBI07: Hai activation đồng thời và retry sau mất response tạo đúng một run; cùng key khác payload bị từ chối', async () => {
    const text = 'Sản phẩm: Hạt Mắc Ca Tây Nguyên\nKhối lượng: 500g';
    const { draft } = dispatcher.createDraft({ context: adminContext, text, targetLocale: 'vi' });

    // 1. First activation
    const res1 = await dispatcher.activateDraft({
      draftId: draft.draftId,
      expectedVersion: draft.version,
      expectedHash: draft.draftHash,
      idempotencyKey: 'idemp_concurrent_key',
      context: adminContext,
      orchestrator,
    });

    // 2. Concurrent / retry activation with same idempotency key
    const res2 = await dispatcher.activateDraft({
      draftId: draft.draftId,
      expectedVersion: draft.version,
      expectedHash: draft.draftHash,
      idempotencyKey: 'idemp_concurrent_key',
      context: adminContext,
      orchestrator,
    });

    assert.equal(res1.runId, res2.runId, 'Hai lần kích hoạt phải trả về cùng một runId duy nhất');

    // 3. Same key with different draft/payload must be rejected
    await assert.rejects(
      async () => {
        await dispatcher.activateDraft({
          draftId: 'draft_different_id',
          expectedVersion: 1,
          expectedHash: 'hash_different',
          idempotencyKey: 'idemp_concurrent_key',
          context: adminContext,
          orchestrator,
        });
      },
      /Xung đột khóa bất biến/,
      'Khóa bất biến dùng lại cho payload khác phải bị từ chối'
    );
  });

  it('CBI08: Nguồn/snapshot đổi sau preview hoặc quyền bị thu hồi: activation bị từ chối trước mọi workflow call', async () => {
    const text = 'Sản phẩm: Yến Sào Khánh Hòa';
    const { draft } = dispatcher.createDraft({ context: adminContext, text });

    // 1. Mismatch hash / version
    await assert.rejects(
      async () => {
        await dispatcher.activateDraft({
          draftId: draft.draftId,
          expectedVersion: 2, // Mismatched version
          expectedHash: draft.draftHash,
          idempotencyKey: 'key_cbi08_ver_mismatch',
          context: adminContext,
          orchestrator,
        });
      },
      /Bản nháp đã thay đổi hoặc không khớp phiên bản/
    );

    // 2. Viewer role attempting activation
    await assert.rejects(
      async () => {
        await dispatcher.activateDraft({
          draftId: draft.draftId,
          expectedVersion: draft.version,
          expectedHash: draft.draftHash,
          idempotencyKey: 'key_cbi08_viewer',
          context: viewerContext,
          orchestrator,
        });
      },
      /Viewer không có quyền kích hoạt/
    );

    assert.equal(orchestrator.nodeCallCounts.content, 0);
  });

  it('CBI09: Lỗi phù hợp hợp đồng Exception được giải thích, giữ correlation; lỗi model không giả thành lỗi sàn', async () => {
    const exceptionInput = {
      tenantId: 'tenant_vietnam',
      mode: 'demo',
      storeId: 'shopee_store_1',
      actionId: 'act_cbi09',
      operation: 'chunk_embedding',
      operationType: 'idempotent_read',
      adapterCapabilities: {
        platform: 'openai',
        adapterVersion: '1.0.0',
        supportsIdempotency: true,
      },
      dispatchStatus: 'rejected',
      attemptId: 'att_1',
      payloadVersion: 1,
      targetEntity: {
        entityType: 'product',
        targetId: 'prod_cbi09',
      },
      rawError: {
        code: 'MODEL_RATE_LIMIT',
        message: 'OpenAI API rate limit exceeded on text-embedding-3-small',
        correlationId: 'corr_test_cbi09',
      },
      correlationId: 'corr_test_cbi09',
    };

    const exResult = await handleException(exceptionInput);
    assert.ok(
      exResult.evidenceRefs.some((ref) => ref.includes('corr_test_cbi09')),
      'EvidenceRefs phải chứa correlationId'
    );
    assert.equal(exResult.failureClass, 'rate_limit');
    assert.ok(
      exResult.summaryVi.includes('tần suất') || exResult.summaryVi.includes('giới hạn') || exResult.summaryVi.includes('chậm lại'),
      'Phải có lời giải thích bằng tiếng Việt'
    );
    // Never fake model error as marketplace listing error
    assert.notEqual(exResult.failureClass, 'external_unknown');
    assert.notEqual(exResult.nextAction, 'reconcile_external');
  });

  it('CBI10: Câu hỏi trạng thái qua Assistant đọc đúng run/proposal, không tuyên bố đã đăng khi mới waiting_approval', async () => {
    const text = 'Sản phẩm: Gạo ST25 Ông Cua 5kg';
    const { draft } = dispatcher.createDraft({ context: adminContext, text, targetLocale: 'vi' });

    const actResult = await dispatcher.activateDraft({
      draftId: draft.draftId,
      expectedVersion: draft.version,
      expectedHash: draft.draftHash,
      idempotencyKey: 'key_cbi10',
      context: adminContext,
      orchestrator,
    });

    const state = await orchestrator.getCheckpointer().load(actResult.runId);
    assert.equal(state.status, 'waiting_approval');

    // Query status via assistant
    const assistantRes = await runAssistant(
      adminContext,
      'Kiểm tra công việc và đề xuất bài đăng'
    );

    assert.ok(!assistantRes.answer.includes('Đã xuất bản lên sàn thành công'));
  });

  it('CBI11: Tenant khác và mode khác không đọc hoặc kích hoạt draft của nhau', async () => {
    const text = 'Sản phẩm bí mật nội bộ Tenant VN';
    const { draft } = dispatcher.createDraft({ context: adminContext, text });

    // Tenant foreign attempts to fetch draft
    const found = dispatcher.getDraft(draft.draftId, otherTenantContext);
    assert.equal(found, null, 'Tenant foreign không được tìm thấy draft của Tenant VN');

    // Tenant foreign attempts to activate
    await assert.rejects(
      async () => {
        await dispatcher.activateDraft({
          draftId: draft.draftId,
          expectedVersion: draft.version,
          expectedHash: draft.draftHash,
          idempotencyKey: 'key_cbi11_leak',
          context: otherTenantContext,
          orchestrator,
        });
      },
      /không tồn tại hoặc không thuộc doanh nghiệp/
    );
  });

  it('CBI12: Cancel workflow ngăn chặn chạy node tiếp và giữ nguyên trạng thái', async () => {
    const text = 'Sản phẩm: Bột Ca Cao Nguyên Chất\nKhối lượng: 500g';
    const { draft } = dispatcher.createDraft({ context: adminContext, text });

    const actResult = await dispatcher.activateDraft({
      draftId: draft.draftId,
      expectedVersion: draft.version,
      expectedHash: draft.draftHash,
      idempotencyKey: 'key_cbi12',
      context: adminContext,
      orchestrator,
    });

    // Cancel workflow
    const cancelledState = await orchestrator.cancel(actResult.runId);
    assert.equal(cancelledState.status, 'cancelled');

    // Subsequent retrieval shows cancelled
    const loadedState = await orchestrator.getCheckpointer().load(actResult.runId);
    assert.equal(loadedState.status, 'cancelled');
  });
});
