import type {
  IModelProvider,
  ModelCallRequest,
  ModelUsage,
  ProviderResponse,
  RuntimeContext,
} from '../types.ts';

export class FixtureModelProvider implements IModelProvider {
  public async call(request: ModelCallRequest, _context: RuntimeContext): Promise<ProviderResponse> {
    if (request.agentName === 'localization_agent') {
      const p = request.userPayload as {
        sourceTitle?: string;
        sourceDescription?: string;
        sourceHighlights?: string[];
        sourceClaims?: Array<{ id?: string; text: string; sourceRefs?: string[] }>;
        lockedTokens?: string[];
      };
      const targetLocale = (request.locale || 'th').toUpperCase();
      const rawJson = {
        title: `[${targetLocale}] ${p.sourceTitle || ''}`,
        description: `[${targetLocale}] ${p.sourceDescription || ''}`,
        highlights: p.sourceHighlights || [],
        claimMappings: (p.sourceClaims || []).map((c) => ({
          translatedSegment: c.text,
          sourceFactId: c.id || c.sourceRefs?.[0],
          confidence: 'verified_exact',
        })),
        untranslatedTerms: p.lockedTokens || [],
        warnings: [],
      };

      const usage: ModelUsage = {
        inputTokens: 100,
        outputTokens: 75,
        estimatedCostUsd: 0.0,
      };

      return {
        rawJson,
        usage,
        providerRequestId: `fixture_loc_${Date.now()}`,
      };
    }

    if (request.agentName === 'keyword_agent') {
      const p = request.userPayload as Record<string, unknown>;
      const verifiedFacts = Array.isArray(p.verifiedFacts)
        ? (p.verifiedFacts as Array<{ id: string; field: string; value: string }>)
        : [];
      const firstFactId = verifiedFacts[0]?.id || 'fact-title';
      const brand = typeof p.brand === 'string' && p.brand !== 'None' ? p.brand : '';
      const title = typeof p.productTitle === 'string' ? p.productTitle : 'sản phẩm';

      const rawJson = {
        keywords: [
          {
            phrase: brand ? `${brand} ${title}`.trim() : title,
            reason: 'Gợi ý từ khóa bám sát tên sản phẩm và thương hiệu',
            sourceRefs: [firstFactId],
            basis: 'product_fact',
          },
          {
            phrase: `chính hãng ${title}`.trim(),
            reason: 'Gợi ý tìm kiếm cho dòng sản phẩm chính hãng',
            sourceRefs: [firstFactId],
            basis: 'product_fact',
          },
        ],
      };

      const usage: ModelUsage = {
        inputTokens: 50,
        outputTokens: 30,
        estimatedCostUsd: 0.0,
      };

      return {
        rawJson,
        usage,
        providerRequestId: `fixture_kw_${Date.now()}`,
      };
    }

    if (request.agentName === 'content_writer') {
      const p = request.userPayload as Record<string, unknown>;
      const productTitle = (p.productTitle as string) || (p.title as string) || 'Sản phẩm mẫu';
      const verifiedFacts = Array.isArray(p.verifiedFacts)
        ? (p.verifiedFacts as Array<{ id: string; field: string; value: string }>)
        : [];
      const firstFact = verifiedFacts[0];
      const claims = firstFact
        ? [
            {
              text: firstFact.value,
              outputPath: 'title' as const,
              sourceRefs: [firstFact.id],
            },
          ]
        : [];

      const factValues = verifiedFacts.map((f) => f.value).join(', ');
      const rawJson = {
        title: `[Demo] ${productTitle} - Tối ưu Shopee chuẩn SEO`,
        description: `[Demo] Mô tả tối ưu hóa tự động cho ${productTitle}. Quy cách: ${factValues || 'chuẩn'}. Đầy đủ công dụng, thành phần, và hướng dẫn sử dụng.`,
        highlights: ['Chất lượng cao', 'Chính hãng'],
        claims,
        missingFacts: [],
        warnings: [],
      };

      const usage: ModelUsage = {
        inputTokens: 100,
        outputTokens: 75,
        estimatedCostUsd: 0.0,
      };

      return {
        rawJson,
        usage,
        providerRequestId: `fixture_content_${Date.now()}`,
      };
    }

    const rawJson = {
      title: `[Demo] ${request.userPayload.title || 'Sản phẩm mẫu'} - Tối ưu Shopee chuẩn SEO`,
      description: `[Demo] Mô tả tối ưu hóa tự động cho ${request.userPayload.title || 'sản phẩm'}. Đầy đủ công dụng, thành phần, và hướng dẫn sử dụng.`,
      hashtags: ['#shopee', '#banchay', '#chinhhang', '#sale'],
    };

    const usage: ModelUsage = {
      inputTokens: 100,
      outputTokens: 75,
      estimatedCostUsd: 0.0,
    };

    return {
      rawJson,
      usage,
      providerRequestId: `fixture_demo_${Date.now()}`,
    };
  }
}
