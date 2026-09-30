import type { FieldPatch } from './types.ts';

export interface PatchValidationInput {
  patches: FieldPatch[];
  serverPayload: Record<string, unknown>;
  expectedPayloadVersion: number;
  actualPayloadVersion: number;
  productFacts?: Record<string, unknown>;
}

export interface PatchValidationResult {
  valid: boolean;
  validatedPatches: FieldPatch[];
  rejectedPatches: Array<{ patch: FieldPatch; reason: string }>;
  needsInput: boolean;
  missingInformation: string[];
  warnings: string[];
}

const ALLOWED_EXACT_FIELDS = new Set(['title', 'description']);

export function isValidFieldPath(fieldPath: string): boolean {
  if (!fieldPath || typeof fieldPath !== 'string') return false;

  // Exact fields
  if (ALLOWED_EXACT_FIELDS.has(fieldPath)) {
    return true;
  }

  // attributes.<attributeId>
  if (fieldPath.startsWith('attributes.')) {
    const attrId = fieldPath.slice('attributes.'.length);
    // Must be non-empty and alphanumeric/hyphen/underscore
    if (/^[A-Za-z0-9_-]+$/.test(attrId)) {
      // Disallow sensitive attribute names
      const lower = attrId.toLowerCase();
      if (
        lower.includes('price') ||
        lower.includes('stock') ||
        lower.includes('quantity') ||
        lower.includes('sku') ||
        lower.includes('permission') ||
        lower.includes('role')
      ) {
        return false;
      }
      return true;
    }
  }

  return false;
}

export function validateFieldPatches(input: PatchValidationInput): PatchValidationResult {
  const result: PatchValidationResult = {
    valid: true,
    validatedPatches: [],
    rejectedPatches: [],
    needsInput: false,
    missingInformation: [],
    warnings: [],
  };

  // Check 1: Stale version check
  if (input.expectedPayloadVersion !== input.actualPayloadVersion) {
    result.valid = false;
    result.warnings.push(
      `Phiên bản dữ liệu không khớp. Kỳ vọng phiên bản ${input.expectedPayloadVersion} nhưng hiện tại là ${input.actualPayloadVersion}.`
    );
    return result;
  }

  const facts = input.productFacts || {};

  for (const patch of input.patches) {
    // Check 2: Allowed field path
    if (!isValidFieldPath(patch.fieldPath)) {
      result.valid = false;
      result.rejectedPatches.push({
        patch,
        reason: `Trường '${patch.fieldPath}' không nằm trong danh sách cho phép sửa đổi hoặc là vùng dữ liệu nhạy cảm.`,
      });
      continue;
    }

    // Check 3: Check Brand or fact availability
    if (patch.fieldPath.toLowerCase().includes('brand')) {
      const factBrand = facts['brand'] || facts['thuong_hieu'] || facts['Brand'];
      if (!factBrand) {
        result.needsInput = true;
        result.missingInformation.push('Brand');
        result.warnings.push(
          'Hồ sơ sự thật sản phẩm chưa có thông tin Brand. Cần người bán bổ sung, không được tự suy đoán.'
        );
        continue;
      }
    }

    // Check 4: Value type validation
    if (typeof patch.proposedValue !== 'string') {
      result.valid = false;
      result.rejectedPatches.push({
        patch,
        reason: `Giá trị bản vá cho '${patch.fieldPath}' phải là kiểu chuỗi văn bản.`,
      });
      continue;
    }

    // Passed checks
    result.validatedPatches.push(patch);
  }

  if (result.rejectedPatches.length > 0) {
    result.valid = false;
  }

  return result;
}
