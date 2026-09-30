import type {
  ExceptionAgentInput,
  ExceptionAnalysisResult,
  DeterministicClassification,
  FieldPatch,
} from './types.ts';
import { classifyFailure } from './classifier.ts';
import { EXCEPTION_TEMPLATES } from './prompt.ts';
import { validateFieldPatches } from './patch-validator.ts';
import { globalSuppressionStore } from './suppression.ts';
import { globalRetryBudget } from './budget.ts';
import { sanitizeErrorPayload } from './sanitizer.ts';

export async function handleException(input: ExceptionAgentInput): Promise<ExceptionAnalysisResult> {
  const budgetRecord = globalRetryBudget.getRecord(input.actionId);
  const classification: DeterministicClassification = classifyFailure(input, budgetRecord);
  const rawCorr =
    (input as unknown as Record<string, unknown>).correlationId ||
    (typeof input.rawError === 'object' && input.rawError !== null
      ? (input.rawError as Record<string, unknown>).correlationId
      : undefined);
  const sanitized = sanitizeErrorPayload(
    input.rawError,
    typeof rawCorr === 'string' ? rawCorr : undefined
  );

  const baseResult: ExceptionAnalysisResult = {
    failureClass: classification.failureClass,
    nextAction: classification.nextAction,
    summaryVi: classification.reasonVi,
    evidenceRefs: [`error:${sanitized.code}`, `corr:${sanitized.correlationId}`],
    fieldPatches: [],
    warnings: [],
    needsHumanReview: classification.nextAction === 'halt_for_human' || classification.nextAction === 'reconnect_auth',
    requiresReconciliation: classification.requiresReconciliation,
  };

  // Case 1: Simple deterministic errors use static templates
  const template = EXCEPTION_TEMPLATES[classification.failureClass];
  if (template) {
    baseResult.summaryVi = template;
  }

  // Case 2: If action is retry, attach retry schedule
  if (classification.canRetry && classification.nextAction === 'retry_with_backoff') {
    const delayMs = 1000 * Math.pow(2, (budgetRecord?.retriesUsed || 0) + 1);
    const nextAllowedAt = new Date(Date.now() + delayMs).toISOString();
    baseResult.retrySchedule = {
      attemptNumber: (budgetRecord?.retriesUsed || 0) + 1,
      delayMs,
      nextAllowedAt,
    };
  }

  // Case 3: If create_repair_task, analyze patches
  if (classification.nextAction === 'create_repair_task') {
    // Check if missing attribute like Brand
    const missingBrand =
      sanitized.code.includes('MISSING') &&
      (sanitized.safeMessage.toLowerCase().includes('brand') || sanitized.safeMessage.toLowerCase().includes('thương hiệu'));

    if (missingBrand) {
      const factBrand = input.productFacts?.['brand'] || input.productFacts?.['Brand'];
      if (!factBrand) {
        baseResult.missingInformation = ['Brand'];
        baseResult.needsHumanReview = true;
        baseResult.summaryVi =
          'Sàn từ chối bài đăng do thiếu thuộc tính bắt buộc Thương hiệu (Brand). Hồ sơ sản phẩm hiện chưa có thông tin này, vui lòng bổ sung.';
        baseResult.warnings.push('Hồ sơ fact chưa có Brand. Cần người bán bổ sung, hệ thống không tự suy đoán.');
        return baseResult;
      } else {
        const patch: FieldPatch = {
          fieldPath: 'attributes.brand',
          previousValue: '',
          proposedValue: String(factBrand),
          factSourceVersion: input.payloadVersion,
        };

        const validation = validateFieldPatches({
          patches: [patch],
          serverPayload: {},
          expectedPayloadVersion: input.payloadVersion,
          actualPayloadVersion: input.payloadVersion,
          productFacts: input.productFacts,
        });

        if (validation.valid) {
          // Check suppression
          const diffHash = `attributes.brand:${String(factBrand)}`;
          if (globalSuppressionStore.isSuppressed(input.targetEntity.targetId, diffHash, input.payloadVersion)) {
            baseResult.warnings.push(
              'Bản vá này đã từng bị người bán từ chối trước đó. Hệ thống không tạo lại để ép duyệt.'
            );
            baseResult.needsHumanReview = true;
          } else {
            baseResult.fieldPatches = validation.validatedPatches;
            baseResult.summaryVi = `Phát hiện thiếu thuộc tính Brand. Đã đề xuất bổ sung '${String(factBrand)}' từ hồ sơ sự thật sản phẩm.`;
          }
        }
      }
    }
  }

  // Crucial rule: failureClass and nextAction are strictly enforced by deterministic classification
  baseResult.failureClass = classification.failureClass;
  baseResult.nextAction = classification.nextAction;

  return baseResult;
}
