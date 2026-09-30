import type {
  ExceptionAgentInput,
  DeterministicClassification,
  FailureClass,
  ActionBudgetRecord,
} from './types.ts';
import { lookupErrorRule } from './matrix.ts';
import { sanitizeErrorPayload } from './sanitizer.ts';

export function classifyFailure(
  input: ExceptionAgentInput,
  budgetRecord?: ActionBudgetRecord | null
): DeterministicClassification {
  const sanitized = sanitizeErrorPayload(input.rawError);
  const rule = lookupErrorRule(sanitized.code);
  const failureClass: FailureClass = rule.failureClass;

  // Rule 1: Unknown dispatch on write operations must always route to reconciliation
  if (
    input.dispatchStatus === 'unknown' &&
    (input.operationType === 'non_idempotent_write' ||
      (input.operationType === 'idempotent_write' && !input.adapterCapabilities.supportsIdempotency))
  ) {
    return {
      failureClass: 'external_unknown',
      nextAction: 'reconcile_external',
      reasonVi: 'Thao tác ghi có trạng thái sàn chưa xác định. Chuyển sang đối soát kỹ thuật, cấm gửi lại yêu cầu.',
      dispatchStatus: 'unknown',
      canRetry: false,
      requiresReconciliation: true,
    };
  }

  // Rule 2: Auth credential issues require human reconnection
  if (failureClass === 'auth_credential') {
    return {
      failureClass,
      nextAction: 'reconnect_auth',
      reasonVi: 'Phiên đăng nhập hoặc quyền ủy quyền đã hết hạn. Yêu cầu kết nối lại tài khoản.',
      dispatchStatus: input.dispatchStatus,
      canRetry: false,
      requiresReconciliation: false,
    };
  }

  // Rule 3: Validation and policy violations require proposal draft repair
  if (failureClass === 'validation_missing_field' || failureClass === 'policy_claim_violation') {
    return {
      failureClass,
      nextAction: 'create_repair_task',
      reasonVi: 'Nội dung thiếu trường bắt buộc hoặc vi phạm quy tắc sàn. Cần tạo bản vá sửa đổi.',
      dispatchStatus: input.dispatchStatus,
      canRetry: false,
      requiresReconciliation: false,
    };
  }

  // Rule 4: Inventory SKU mismatch
  if (failureClass === 'inventory_sku_mismatch') {
    return {
      failureClass,
      nextAction: 'halt_for_human',
      reasonVi: 'Lệch cấu trúc phân loại biến thể SKU hoặc tồn kho. Cần quản lý đơn hàng và kho xử lý.',
      dispatchStatus: input.dispatchStatus,
      canRetry: false,
      requiresReconciliation: false,
    };
  }

  // Rule 5: Retryable errors (network pre-dispatch or rate limit)
  if (input.dispatchStatus === 'retryable_not_sent') {
    if (budgetRecord && budgetRecord.exhausted) {
      return {
        failureClass,
        nextAction: 'halt_for_human',
        reasonVi: 'Đã dùng hết ngân sách thử lại tối đa. Dừng tiến trình chờ người xử lý.',
        dispatchStatus: input.dispatchStatus,
        canRetry: false,
        requiresReconciliation: false,
      };
    }

    const isSafeToRetry =
      input.operationType === 'idempotent_read' ||
      input.operationType === 'idempotent_write' ||
      input.adapterCapabilities.supportsIdempotency;

    if (isSafeToRetry) {
      return {
        failureClass,
        nextAction: 'retry_with_backoff',
        reasonVi: 'Sự cố mạng hoặc tần suất gọi trước khi gửi. Thao tác an toàn được phép thử lại có lùi thời gian.',
        dispatchStatus: input.dispatchStatus,
        canRetry: true,
        requiresReconciliation: false,
      };
    }
  }

  // Default: Unrecognized or unsafe state
  return {
    failureClass: failureClass === 'system_unrecognized' ? 'system_unrecognized' : failureClass,
    nextAction: 'halt_for_human',
    reasonVi: 'Lỗi không nhận diện hoặc thao tác không an toàn để thử lại tự động. Yêu cầu kiểm tra thủ công.',
    dispatchStatus: input.dispatchStatus,
    canRetry: false,
    requiresReconciliation: false,
  };
}
