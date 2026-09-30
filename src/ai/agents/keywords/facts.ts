import type { ProductSnapshot } from '../../workflows/prepare-listing/types.ts';
import type { ContentSnapshot, ProductFact } from '../content/types.ts';
import { buildProductFacts, createFactLookup } from '../content/facts.ts';
import type { ResolvedProductAttributes } from './types.ts';

export { createFactLookup };
export type { ProductFact };

/**
 * Chuyển đổi ProductSnapshot sang ContentSnapshot để tái sử dụng logic trích xuất facts chuẩn
 */
function toContentSnapshot(snapshot: ProductSnapshot, resolvedBrand?: string): ContentSnapshot {
  const brand = resolvedBrand || snapshot.attributes?.brand || snapshot.attributes?.Brand || undefined;
  return {
    id: snapshot.id,
    version: snapshot.version,
    hash: snapshot.hash,
    title: snapshot.title,
    brand,
    language: snapshot.language,
    attributes: snapshot.attributes || {},
  };
}

/**
 * Phân giải các thuộc tính chính từ bản chụp và các giá trị ghi đè đã xác minh
 */
export function resolveProductAttributes(
  snapshot: ProductSnapshot,
  overrides?: { brand?: string; confirmedCategory?: string }
): ResolvedProductAttributes {
  const brand =
    overrides?.brand?.trim() ||
    snapshot.attributes?.brand?.trim() ||
    snapshot.attributes?.Brand?.trim() ||
    undefined;

  // Chỉ chấp nhận danh mục đã được xác nhận rõ ràng, không tự suy đoán
  const confirmedCategory = overrides?.confirmedCategory?.trim() || undefined;

  const weight =
    snapshot.attributes?.weight?.trim() ||
    snapshot.attributes?.Weight?.trim() ||
    undefined;

  return {
    brand,
    confirmedCategory,
    weight,
  };
}

/**
 * Trích xuất danh sách fact cho từ khóa tái sử dụng hoàn toàn logic từ content/facts.ts
 */
export function buildKeywordFacts(
  snapshot: ProductSnapshot,
  resolvedBrand?: string
): ProductFact[] {
  const contentSnapshot = toContentSnapshot(snapshot, resolvedBrand);
  const facts = buildProductFacts(contentSnapshot);

  // Nếu có danh mục trong attributes, đảm bảo có fact tương ứng
  const category = snapshot.attributes?.category || snapshot.attributes?.Category;
  if (category && !facts.some((f) => f.fieldPath === 'category')) {
    facts.push({
      id: 'fact-category',
      fieldPath: 'category',
      value: category.trim(),
    });
  }

  return facts;
}
