import { createHash } from 'node:crypto';
import type {
  IModelProvider,
  ModelCallRequest,
  ModelCallResult,
  RuntimeContext,
} from '../../model-call/types.ts';
import { ModelCallGateway } from '../../model-call/gateway.ts';
import {
  buildKeywordFacts,
  createFactLookup,
  resolveProductAttributes,
} from './facts.ts';
import {
  KEYWORD_PROMPT_VERSION,
  SYSTEM_PROMPT_PEOPLE_FIRST_KEYWORDS,
} from './prompt.ts';
import type { KeywordInput, KeywordOutput } from './types.ts';
import { validateKeywordOutput } from './validator.ts';

/**
 * Điều phối gọi mô hình tạo từ khóa qua cổng ModelCallGateway với mã băm cache đa yếu tố
 */
export async function generateKeywords(
  input: KeywordInput,
  context: RuntimeContext,
  gateway: ModelCallGateway,
  providerOverride?: IModelProvider
): Promise<KeywordOutput> {
  const { snapshot, targetLocale, confirmedCategory, brand, forbiddenList, measuredDataset } = input;

  // 1. Phân giải các thuộc tính chuẩn xác
  const resolved = resolveProductAttributes(snapshot, { brand, confirmedCategory });

  // 2. Trích xuất danh sách fact kiểm chứng
  const facts = buildKeywordFacts(snapshot, resolved.brand);
  const factLookup = createFactLookup(facts);

  // 3. Tính mã băm cache đa yếu tố (Đặc biệt bao gồm version danh sách từ cấm để vô hiệu hóa cache khi đổi luật)
  const rawInput = JSON.stringify({
    snapshotId: snapshot.id,
    snapshotVersion: snapshot.version,
    snapshotHash: snapshot.hash,
    targetLocale: targetLocale || snapshot.language,
    confirmedCategory: resolved.confirmedCategory || '',
    brand: resolved.brand || '',
    forbiddenListVersion: forbiddenList?.version || 'v1.0.0',
    datasetId: measuredDataset?.id || '',
    datasetVersion: measuredDataset?.version || '',
    rankingConfigVersion: 'v1.0.0',
  });
  const inputHash = createHash('sha256').update(rawInput).digest('hex');

  // 4. Chuẩn bị payload gửi mô hình
  const userPayload: Record<string, unknown> = {
    productTitle: snapshot.title,
    brand: resolved.brand || 'None',
    confirmedCategory: resolved.confirmedCategory || 'None',
    language: snapshot.language,
    targetLocale: targetLocale || snapshot.language,
    verifiedFacts: facts.map((f) => ({
      id: f.id,
      field: f.fieldPath,
      value: f.value,
      variantSku: f.variantSku,
    })),
  };

  const request: ModelCallRequest<KeywordOutput> = {
    agentName: 'keyword_agent',
    promptVersion: KEYWORD_PROMPT_VERSION,
    schemaVersion: '1.0.0',
    modelConfigId: 'gpt-4o-mini',
    systemInstruction: SYSTEM_PROMPT_PEOPLE_FIRST_KEYWORDS,
    userPayload,
    snapshotRef: {
      id: snapshot.id,
      version: snapshot.version,
      hash: snapshot.hash,
    },
    inputHash,
    locale: targetLocale || snapshot.language,
    maxOutputTokens: 800,
    validateOutput: (raw: unknown) => {
      const res = validateKeywordOutput(raw, {
        snapshot,
        facts,
        factLookup,
        forbiddenList,
        brand: resolved.brand,
        measuredDataset,
      });

      if (!res.valid || !res.data) {
        return { valid: false, errors: res.errors };
      }
      return { valid: true, data: res.data };
    },
  };

  try {
    const result: ModelCallResult<KeywordOutput> = await gateway.callStructuredModel(
      request,
      context,
      providerOverride
    );

    return result.artifact;
  } catch (error: unknown) {
    const err = error as Error;

    // Tôn trọng trạng thái hủy bỏ (cancellation)
    if (err.name === 'AbortError' || /cancel/i.test(err.message)) {
      throw err;
    }

    // Xử lý timeout có cấu trúc
    const isTimeout =
      err.name === 'TimeoutError' ||
      /timeout|deadline/i.test(err.message);

    if (isTimeout) {
      return {
        status: 'fallback',
        errorCode: 'PROVIDER_TIMEOUT',
        keywords: [],
        warnings: ['Sự cố hết hạn kết nối khi tạo từ khóa; người bán có thể nhập tay'],
        snapshotVersion: snapshot.version,
        forbiddenListVersion: forbiddenList?.version || 'v1.0.0',
      };
    }

    // Xử lý lỗi nhà cung cấp mạng hoặc dịch vụ
    const isProviderFailure =
      /gateway|provider|connection|network|401|429|500|502|503|fetch failed/i.test(err.message) ||
      err.name === 'ModelGatewayError';

    if (isProviderFailure) {
      return {
        status: 'fallback',
        errorCode: 'PROVIDER_ERROR',
        keywords: [],
        warnings: ['Sự cố kết nối nhà cung cấp khi tạo từ khóa; người bán có thể nhập tay'],
        snapshotVersion: snapshot.version,
        forbiddenListVersion: forbiddenList?.version || 'v1.0.0',
      };
    }

    // Lỗi lập trình hoặc input không hợp lệ vẫn phải được nhìn thấy
    throw err;
  }
}
