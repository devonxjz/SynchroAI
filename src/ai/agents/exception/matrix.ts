import type { FailureClass, DispatchStatus } from './types.ts';

export interface ErrorMappingRule {
  code: string;
  subCode?: string;
  failureClass: FailureClass;
  expectedDispatchStatus: DispatchStatus;
  isVerifiedSpec: boolean;
  sourceDoc: string;
  descriptionVi: string;
}

export const ERROR_MAPPING_MATRIX: Record<string, ErrorMappingRule> = {
  // Demo fixture rules for development and automated testing
  'DEMO_AUTH_EXPIRED': {
    code: 'DEMO_AUTH_EXPIRED',
    failureClass: 'auth_credential',
    expectedDispatchStatus: 'rejected',
    isVerifiedSpec: false,
    sourceDoc: 'fixture:demo_v1',
    descriptionVi: 'Phiên đăng nhập hoặc token ủy quyền đã hết hạn.',
  },
  'error_auth': {
    code: 'error_auth',
    failureClass: 'auth_credential',
    expectedDispatchStatus: 'rejected',
    isVerifiedSpec: false,
    sourceDoc: 'fixture:shopee_demo_v1',
    descriptionVi: 'Mã lỗi giả lập xác thực phiên Shopee.',
  },
  'DEMO_RATE_LIMIT': {
    code: 'DEMO_RATE_LIMIT',
    failureClass: 'rate_limit',
    expectedDispatchStatus: 'retryable_not_sent',
    isVerifiedSpec: false,
    sourceDoc: 'fixture:demo_v1',
    descriptionVi: 'Chạm giới hạn tần suất gọi API.',
  },
  'DEMO_NETWORK_PRE_DISPATCH': {
    code: 'DEMO_NETWORK_PRE_DISPATCH',
    failureClass: 'network_pre_dispatch',
    expectedDispatchStatus: 'retryable_not_sent',
    isVerifiedSpec: false,
    sourceDoc: 'fixture:demo_v1',
    descriptionVi: 'Ngắt kết nối mạng trước khi gửi yêu cầu tới sàn.',
  },
  'DEMO_TIMEOUT_UNKNOWN': {
    code: 'DEMO_TIMEOUT_UNKNOWN',
    failureClass: 'external_unknown',
    expectedDispatchStatus: 'unknown',
    isVerifiedSpec: false,
    sourceDoc: 'fixture:demo_v1',
    descriptionVi: 'Hết thời gian chờ phản hồi nhưng chưa rõ sàn đã nhận hay chưa.',
  },
  'DEMO_MISSING_ATTRIBUTE': {
    code: 'DEMO_MISSING_ATTRIBUTE',
    failureClass: 'validation_missing_field',
    expectedDispatchStatus: 'rejected',
    isVerifiedSpec: false,
    sourceDoc: 'fixture:demo_v1',
    descriptionVi: 'Thiếu thuộc tính bắt buộc của ngành hàng.',
  },
  'DEMO_POLICY_VIOLATION': {
    code: 'DEMO_POLICY_VIOLATION',
    failureClass: 'policy_claim_violation',
    expectedDispatchStatus: 'rejected',
    isVerifiedSpec: false,
    sourceDoc: 'fixture:demo_v1',
    descriptionVi: 'Nội dung chứa cam kết hoặc từ cấm vi phạm chính sách sàn.',
  },
  'DEMO_SKU_MISMATCH': {
    code: 'DEMO_SKU_MISMATCH',
    failureClass: 'inventory_sku_mismatch',
    expectedDispatchStatus: 'rejected',
    isVerifiedSpec: false,
    sourceDoc: 'fixture:demo_v1',
    descriptionVi: 'Mã biến thể SKU hoặc số lượng tồn kho không đồng bộ.',
  },
};

export function lookupErrorRule(code: string): ErrorMappingRule {
  const match = ERROR_MAPPING_MATRIX[code];
  if (match) {
    return match;
  }
  return {
    code,
    failureClass: 'system_unrecognized',
    expectedDispatchStatus: 'unknown',
    isVerifiedSpec: false,
    sourceDoc: 'fallback:unrecognized',
    descriptionVi: 'Mã lỗi chưa được ghi nhận trong danh mục chính thức.',
  };
}
