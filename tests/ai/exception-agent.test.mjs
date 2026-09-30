import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyFailure,
  sanitizeErrorPayload,
  globalRetryBudget,
  globalTaskDedupStore,
  globalSuppressionStore,
  validateFieldPatches,
  handleException,
  computeTaskDedupKey,
  AtomicRetryBudgetManager,
} from '../../src/ai/agents/exception/index.ts';

describe('Tác nhân Ngoại lệ (Exception Handling Agent - Khối 13)', () => {
  beforeEach(() => {
    globalRetryBudget.clear();
    globalTaskDedupStore.clear();
    globalSuppressionStore.clear();
  });

  it('EX01: Token hết hạn trên nhiều sản phẩm gom thành 1 việc kết nối lại duy nhất', () => {
    const products = ['prod_1', 'prod_2', 'prod_3', 'prod_4', 'prod_5'];
    const storeId = 'store_shopee_hcm';

    for (const prodId of products) {
      const dedupKey = computeTaskDedupKey({
        tenantId: 'tenant_vietnam',
        entityType: 'product',
        targetId: prodId,
        storeId,
        mode: 'demo',
        failureClass: 'auth_credential',
      });

      globalTaskDedupStore.recordTask(
        {
          tenantId: 'tenant_vietnam',
          entityType: 'connection',
          targetId: prodId,
          storeId,
          mode: 'demo',
          failureClass: 'auth_credential',
        },
        'Kết nối lại cửa hàng',
        'Token ủy quyền của cửa hàng đã hết hạn.'
      );
    }

    const tasks = globalTaskDedupStore.listTasksByTenant('tenant_vietnam');
    assert.equal(tasks.length, 1, 'Chỉ được tạo 1 task duy nhất cho connection');
    assert.equal(tasks[0].attemptCount, 5, 'Số lần đếm lỗi được gom thành 5');
    assert.equal(tasks[0].targetId, 'conn_store_shopee_hcm');
  });

  it('EX02: Lỗi timeout tạo bài đăng với dispatch unknown chuyển sang đối soát, cấm retry', async () => {
    const input = {
      tenantId: 'tenant_vn',
      mode: 'demo',
      storeId: 'store_1',
      actionId: 'act_create_listing_1',
      operation: 'create_listing',
      operationType: 'non_idempotent_write',
      adapterCapabilities: {
        platform: 'shopee',
        adapterVersion: 'v1.0',
        supportsIdempotency: false,
      },
      dispatchStatus: 'unknown',
      rawError: {
        code: 'DEMO_TIMEOUT_UNKNOWN',
        message: 'Request timed out after 5000ms',
      },
      attemptId: 'att_1',
      payloadVersion: 1,
      targetEntity: {
        entityType: 'product',
        targetId: 'prod_101',
      },
    };

    const classification = classifyFailure(input);
    assert.equal(classification.failureClass, 'external_unknown');
    assert.equal(classification.nextAction, 'reconcile_external');
    assert.equal(classification.canRetry, false, 'Cấm tự ý retry');
    assert.equal(classification.requiresReconciliation, true);

    const result = await handleException(input);
    assert.equal(result.nextAction, 'reconcile_external');
    assert.equal(result.requiresReconciliation, true);
  });

  it('EX03: Thiếu fact Brand chuyển thành needs_input yêu cầu người bán bổ sung', async () => {
    const input = {
      tenantId: 'tenant_vn',
      mode: 'demo',
      storeId: 'store_1',
      actionId: 'act_upload_2',
      operation: 'upload_listing',
      operationType: 'idempotent_write',
      adapterCapabilities: {
        platform: 'shopee',
        adapterVersion: 'v1.0',
        supportsIdempotency: true,
      },
      dispatchStatus: 'rejected',
      rawError: {
        code: 'DEMO_MISSING_ATTRIBUTE',
        message: 'Missing mandatory attribute: Brand',
      },
      attemptId: 'att_2',
      payloadVersion: 1,
      productFacts: {
        origin: 'Vietnam',
        weight: '250g',
        // No brand in facts
      },
      targetEntity: {
        entityType: 'product',
        targetId: 'prod_tea_01',
      },
    };

    const result = await handleException(input);
    assert.equal(result.nextAction, 'create_repair_task');
    assert.deepEqual(result.missingInformation, ['Brand']);
    assert.equal(result.needsHumanReview, true);
    assert.equal(result.fieldPatches.length, 0, 'Không tự ý đoán nhãn hiệu khi fact không có');
  });

  it('EX04: Bản vá can thiệp vào giá bán hoặc phân quyền lập tức bị từ chối', () => {
    const invalidPatches = [
      {
        fieldPath: 'attributes.price',
        previousValue: '100000',
        proposedValue: '120000',
      },
      {
        fieldPath: 'attributes.permissions',
        previousValue: 'viewer',
        proposedValue: 'admin',
      },
      {
        fieldPath: 'sku_quantity',
        previousValue: 10,
        proposedValue: 20,
      },
    ];

    const validation = validateFieldPatches({
      patches: invalidPatches,
      serverPayload: {},
      expectedPayloadVersion: 1,
      actualPayloadVersion: 1,
    });

    assert.equal(validation.valid, false);
    assert.equal(validation.rejectedPatches.length, 3);
    assert.equal(validation.validatedPatches.length, 0);
  });

  it('EX05: Bản vá bị từ chối được lưu suppression bền vững, không dựng lại đề xuất cũ', async () => {
    const targetId = 'prod_coffee_99';
    const diffHash = 'attributes.brand:Trung Nguyen';
    const version = 1;

    // Seller rejects the proposal
    globalSuppressionStore.recordRejection(targetId, diffHash, version);
    assert.equal(globalSuppressionStore.isSuppressed(targetId, diffHash, version), true);

    // Later, the same error occurs on the same product facts
    const input = {
      tenantId: 'tenant_vn',
      mode: 'demo',
      storeId: 'store_1',
      actionId: 'act_retry_brand',
      operation: 'upload_listing',
      operationType: 'idempotent_write',
      adapterCapabilities: { platform: 'shopee', adapterVersion: 'v1.0', supportsIdempotency: true },
      dispatchStatus: 'rejected',
      rawError: { code: 'DEMO_MISSING_ATTRIBUTE', message: 'Missing mandatory attribute: Brand' },
      attemptId: 'att_retry_1',
      payloadVersion: version,
      productFacts: { brand: 'Trung Nguyen' },
      targetEntity: { entityType: 'product', targetId },
    };

    const result = await handleException(input);
    assert.equal(result.fieldPatches.length, 0, 'Bản vá đã bị từ chối không được dựng lại');
    assert.ok(result.warnings.some((w) => w.includes('đã từng bị người bán từ chối')));
  });

  it('EX06: Mô hình khuyên retry lỗi unknown thì mã nguồn vẫn giữ nguyên quyết định đối soát', () => {
    const input = {
      tenantId: 'tenant_vn',
      mode: 'demo',
      storeId: 'store_1',
      actionId: 'act_order_sync',
      operation: 'sync_order',
      operationType: 'non_idempotent_write',
      adapterCapabilities: { platform: 'shopee', adapterVersion: 'v1.0', supportsIdempotency: false },
      dispatchStatus: 'unknown',
      rawError: { code: 'DEMO_TIMEOUT_UNKNOWN', message: 'Connection dropped' },
      attemptId: 'att_sync',
      payloadVersion: 1,
      targetEntity: { entityType: 'order', targetId: 'order_123' },
    };

    const classification = classifyFailure(input);
    assert.equal(classification.nextAction, 'reconcile_external');

    // Simulate LLM attempting to claim "retry_immediate"
    const llmRecommendation = {
      failureClass: 'network_pre_dispatch',
      nextAction: 'retry_immediate',
      advice: 'Hãy thử lại ngay lập tức',
    };

    // Stamping logic: Code strictly overrides LLM
    const finalNextAction = classification.nextAction;
    assert.equal(finalNextAction, 'reconcile_external', 'Mã nguồn phủ quyết khuyến nghị LLM');
  });

  it('EX07: Dữ liệu nhạy cảm bị lọc theo danh sách trường an toàn', () => {
    const rawError = {
      code: 'AUTH_FAILED',
      message: 'Failed to authenticate Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.secret_token with phone 0912345678',
      secret_key: 'super_secret_api_key_do_not_leak',
      headers: {
        Authorization: 'Bearer top_secret',
        Cookie: 'session=123456',
      },
      rawBody: { password: 'user_password_123' },
    };

    const sanitized = sanitizeErrorPayload(rawError, 'corr_test_01');
    assert.equal(sanitized.code, 'AUTH_FAILED');
    assert.equal(sanitized.correlationId, 'corr_test_01');
    assert.ok(!sanitized.safeMessage.includes('secret_token'));
    assert.ok(!sanitized.safeMessage.includes('0912345678'));
    assert.ok(sanitized.safeMessage.includes('[REDACTED]'));

    // Verify headers and body are NOT copied into payload
    assert.equal(sanitized['headers'], undefined);
    assert.equal(sanitized['rawBody'], undefined);
    assert.equal(sanitized['secret_key'], undefined);
  });

  it('EX08: Tranh chấp lượt retry cuối giữa 2 worker chỉ có một worker nhận được token', () => {
    const manager = new AtomicRetryBudgetManager();
    const actionId = 'action_race_01';

    // 1 initial attempt used
    const t1 = manager.claimAttemptToken(actionId, 'attempt_1', 1);
    assert.ok(t1, 'Lần đầu lấy token thành công');
    assert.equal(t1.attemptNumber, 1);

    // Two workers race for attempt 2 (the final retry)
    const tokenWorkerA = manager.claimAttemptToken(actionId, 'attempt_2_workerA', 1, 0);
    const tokenWorkerB = manager.claimAttemptToken(actionId, 'attempt_2_workerB', 1, 0);

    const successfulTokens = [tokenWorkerA, tokenWorkerB].filter(Boolean);
    assert.equal(successfulTokens.length, 1, 'Chỉ đúng 1 worker nhận được lượt retry');

    // Attempt 3 must be blocked as maxRetries = 1 (total attempts = 2)
    const tokenWorkerC = manager.claimAttemptToken(actionId, 'attempt_3', 1, 0);
    assert.equal(tokenWorkerC, null, 'Không được cấp thêm token khi đã hết ngân sách');
  });

  it('EX09: Restart sau khi cạn ngân sách không được cấp lại lượt thử', () => {
    const actionId = 'action_exhaust_test';
    globalRetryBudget.initActionBudget(actionId, 1);

    // Attempt 1 (initial)
    const t1 = globalRetryBudget.claimAttemptToken(actionId, 'att_1', 1, 0);
    assert.ok(t1);

    // Attempt 2 (retry 1 of 1)
    const t2 = globalRetryBudget.claimAttemptToken(actionId, 'att_2', 1, 0);
    assert.ok(t2);

    // Now exhausted
    const record = globalRetryBudget.getRecord(actionId);
    assert.equal(record.exhausted, true);

    // Simulate process restart preserving records
    const postRestartToken = globalRetryBudget.claimAttemptToken(actionId, 'att_3_after_restart', 1, 0);
    assert.equal(postRestartToken, null, 'Restart không được cấp lại lượt thử mới');
  });

  it('EX10: Queue phân phối lại cùng một event không làm tăng số lần lỗi hoặc attempt', () => {
    const actionId = 'action_queue_redeliver';
    const eventId = 'queue_event_unique_uuid_999';

    // First delivery
    const token1 = globalRetryBudget.claimAttemptToken(actionId, eventId, 2);
    assert.ok(token1);
    assert.equal(token1.attemptNumber, 1);

    // Redelivery of same event ID
    const tokenRedelivered = globalRetryBudget.claimAttemptToken(actionId, eventId, 2);
    assert.equal(tokenRedelivered, null, 'Event đã xử lý không được tính thêm attempt mới');

    const record = globalRetryBudget.getRecord(actionId);
    assert.equal(record.retriesUsed, 0, 'Không tiêu tốn lượt retry');
  });

  it('EX11: Bản vá tạo từ phiên bản dữ liệu cũ bị từ chối áp dụng', () => {
    const patch = {
      fieldPath: 'title',
      previousValue: 'Cà phê',
      proposedValue: 'Cà phê Rang Xay',
    };

    const validation = validateFieldPatches({
      patches: [patch],
      serverPayload: { title: 'Cà phê' },
      expectedPayloadVersion: 1,
      actualPayloadVersion: 2, // Server is already at version 2
    });

    assert.equal(validation.valid, false);
    assert.ok(validation.warnings.some((w) => w.includes('Phiên bản dữ liệu không khớp')));
  });

  it('EX12: Mô hình ngôn ngữ gặp sự cố thì tóm tắt từ mẫu cố định vẫn hoạt động', async () => {
    const input = {
      tenantId: 'tenant_vn',
      mode: 'demo',
      storeId: 'store_1',
      actionId: 'act_network_err',
      operation: 'check_status',
      operationType: 'idempotent_read',
      adapterCapabilities: { platform: 'shopee', adapterVersion: 'v1.0', supportsIdempotency: true },
      dispatchStatus: 'retryable_not_sent',
      rawError: { code: 'DEMO_NETWORK_PRE_DISPATCH', message: 'Network offline' },
      attemptId: 'att_net_1',
      payloadVersion: 1,
      targetEntity: { entityType: 'connection', targetId: 'store_1' },
    };

    const result = await handleException(input);
    assert.equal(result.failureClass, 'network_pre_dispatch');
    assert.equal(result.nextAction, 'retry_with_backoff');
    assert.ok(result.summaryVi.includes('Kết nối mạng bị gián đoạn'));
    assert.ok(result.retrySchedule);
  });
});
