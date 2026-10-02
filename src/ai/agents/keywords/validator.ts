import type { ProductSnapshot } from '../../workflows/prepare-listing/types.ts';
import type { ProductFact } from '../content/types.ts';
import { isForbiddenKeyword } from './forbidden.ts';
import { deduplicateKeywords, normalizeKeyword } from './normalizer.ts';
import { rankAndCapKeywords } from './ranker.ts';
import type {
  ForbiddenKeywordList,
  KeywordItem,
  KeywordOutput,
  KeywordValidationResult,
  MeasuredMetricDataset,
} from './types.ts';

export interface KeywordValidationContext {
  snapshot: ProductSnapshot;
  facts: ProductFact[];
  factLookup: Map<string, ProductFact>;
  forbiddenList: ForbiddenKeywordList;
  brand?: string;
  measuredDataset?: MeasuredMetricDataset;
  maxPhraseLength?: number;
}

const METRIC_CLAIM_PATTERN = /\d+[\d.,]*\s*(lượt tìm kiếm|search volume|lượt search|truy cập|lượt xem)/i;
const QUANTITY_PATTERN = /\b(\d+(?:\.\d+)?)\s*(g|kg|ml|l|gam|gram)\b/i;

/**
 * Kiểm tra xem cụm từ có chứa số lượng khối lượng/thể tích bị lệch với fact nguồn không
 */
function hasConflictingQuantity(phrase: string, matchedFacts: ProductFact[]): boolean {
  const match = phrase.match(QUANTITY_PATTERN);
  if (!match) return false;

  const phraseNumber = match[1];
  const phraseUnit = match[2].toLowerCase();
  const phraseQuantity = `${phraseNumber}${phraseUnit === 'gram' || phraseUnit === 'gam' ? 'g' : phraseUnit}`;

  // Kiểm tra với các fact có giá trị số lượng
  for (const fact of matchedFacts) {
    const factMatch = fact.value.match(QUANTITY_PATTERN);
    if (factMatch) {
      const factNumber = factMatch[1];
      const factUnit = factMatch[2].toLowerCase();
      const factQuantity = `${factNumber}${factUnit === 'gram' || factUnit === 'gam' ? 'g' : factUnit}`;
      if (phraseQuantity !== factQuantity) {
        return true; // Phát hiện lệch số liệu
      }
    }
  }

  return false;
}

/**
 * Kiểm tra tính hợp lệ và nguồn gốc của đầu ra từ tác nhân từ khóa
 */
export function validateKeywordOutput(
  raw: unknown,
  context: KeywordValidationContext
): KeywordValidationResult {
  const warnings: string[] = [];

  if (typeof raw !== 'object' || raw === null) {
    return {
      valid: false,
      errors: ['Đầu ra mô hình phải là một đối tượng JSON hợp lệ'],
      warnings: [],
    };
  }

  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.keywords)) {
    return {
      valid: false,
      errors: ['Trường "keywords" là bắt buộc và phải là một mảng'],
      warnings: [],
    };
  }

  const rawKeywords = obj.keywords;
  const processedItems: KeywordItem[] = [];

  for (let i = 0; i < rawKeywords.length; i++) {
    const item = rawKeywords[i];
    if (typeof item !== 'object' || item === null) {
      warnings.push(`Bỏ qua mục từ khóa không hợp lệ tại vị trí ${i}`);
      continue;
    }

    const itemObj = item as Record<string, unknown>;
    const rawPhrase = typeof itemObj.phrase === 'string' ? itemObj.phrase : '';
    const { display: phrase } = normalizeKeyword(rawPhrase, {
      maxPhraseLength: context.maxPhraseLength ?? 100,
    });

    if (!phrase) {
      warnings.push(`Bỏ qua từ khóa rỗng tại vị trí ${i}`);
      continue;
    }

    // 1. Kiểm tra từ cấm
    const forbiddenCheck = isForbiddenKeyword(phrase, context.forbiddenList);
    if (forbiddenCheck.isForbidden) {
      warnings.push(`Loại bỏ từ khóa vi phạm danh sách cấm: "${phrase}" (khớp với "${forbiddenCheck.matchedTerm}")`);
      continue;
    }

    let reason = typeof itemObj.reason === 'string' ? itemObj.reason.trim() : 'Từ khóa phù hợp sản phẩm';

    // 2. Quét tuyên bố số đo ngầm trong trường reason
    if (METRIC_CLAIM_PATTERN.test(reason)) {
      warnings.push(`Phát hiện và loại bỏ tuyên bố số đo chưa kiểm chứng trong lý do của từ khóa "${phrase}"`);
      reason = reason.replace(METRIC_CLAIM_PATTERN, '[số đo chưa kiểm chứng]');
    }

    // 3. Kiểm tra ranh giới số đo & dataset
    let basis = itemObj.basis === 'measured_dataset' ? 'measured_dataset' : 'product_fact';
    let metricRef = typeof itemObj.metricRef === 'string' ? itemObj.metricRef.trim() : undefined;

    // Trong MVP chưa có dataset đo lường chính thức, hoặc không tìm thấy dataset trong context
    if (basis === 'measured_dataset' || metricRef) {
      if (!context.measuredDataset || !context.measuredDataset.metrics[phrase]) {
        warnings.push(`Từ chối số đo hoặc metricRef của từ khóa "${phrase}" do chưa có bộ dữ liệu đo kiểm thực tế`);
        basis = 'product_fact';
        metricRef = undefined;
      }
    }

    // 4. Đối soát nguồn gốc fact (Fact Grounding)
    const rawRefs = Array.isArray(itemObj.sourceRefs) ? itemObj.sourceRefs.map(String) : [];
    const validRefs = rawRefs.filter((refId) => context.factLookup.has(refId));
    const matchedFacts = validRefs.map((id) => context.factLookup.get(id)!);

    // Kiểm tra lệch số liệu
    const quantityMismatch = hasConflictingQuantity(phrase, matchedFacts);

    let groundingStatus: 'verified' | 'unverified_semantic' = 'verified';

    if (validRefs.length === 0) {
      groundingStatus = 'unverified_semantic';
      warnings.push(`Từ khóa "${phrase}" không có mã fact tham chiếu hợp lệ trong sản phẩm`);
    } else if (quantityMismatch) {
      groundingStatus = 'unverified_semantic';
      warnings.push(`Từ khóa "${phrase}" có số lượng hoặc đơn vị không khớp với fact nguồn`);
    }

    // Kiểm tra tuyên bố chứng nhận y tế / hữu cơ chưa có fact
    if (/hữu cơ|organic/i.test(phrase) && !matchedFacts.some((f) => /hữu cơ|organic/i.test(f.value))) {
      groundingStatus = 'unverified_semantic';
      warnings.push(`Từ khóa "${phrase}" có tuyên bố hữu cơ nhưng không có fact chứng minh`);
    }

    if (basis === 'product_fact') {
      processedItems.push({
        phrase,
        reason,
        sourceRefs: validRefs,
        basis: 'product_fact',
        groundingStatus,
      });
    } else if (metricRef && context.measuredDataset) {
      processedItems.push({
        phrase,
        reason,
        sourceRefs: validRefs,
        basis: 'measured_dataset',
        groundingStatus: 'verified',
        metricRef,
        datasetId: context.measuredDataset.id,
      });
    }
  }

  // 5. Khử trùng lặp (ưu tiên mục verified)
  const deduped = deduplicateKeywords(processedItems, context.snapshot.language);

  // 6. Xếp hạng và cắt tỉa tối đa 10 mục
  const finalKeywords = rankAndCapKeywords(deduped, { maxItems: 10 });

  const data: KeywordOutput = {
    status: 'completed',
    keywords: finalKeywords,
    warnings,
    snapshotVersion: context.snapshot.version,
    forbiddenListVersion: context.forbiddenList.version,
  };

  return {
    valid: true,
    data,
    warnings,
  };
}
