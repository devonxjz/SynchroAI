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

    if (request.agentName === 'assistant_agent') {
      const p = request.userPayload as {
        intent?: string;
        toolData?: Record<string, unknown>;
        userMessage?: string;
      };
      const intent = p.intent ?? 'unknown';
      const toolData = p.toolData ?? {};

      let answer: string;
      switch (intent) {
        case 'batch_publish_guard':
          answer =
            'Hệ thống không hỗ trợ đăng hàng loạt tự động để đảm bảo kiểm soát chất lượng. ' +
            'Vui lòng duyệt và xuất bản từng bài đăng thủ công qua trang Quản lý Bài đăng.';
          break;
        case 'listing_confirm': {
          const title = (toolData.extractedTitle as string) || 'bài đăng';
          answer =
            `Tôi đã nhận nội dung bài đăng **"${title}"**! ✅\n\n` +
            `Bạn muốn làm gì tiếp theo?\n` +
            `- 📤 **Đăng lên Shopee** – Tôi có thể khởi tạo quy trình xuất bản\n` +
            `- ✏️ **Chỉnh sửa** – Cho tôi biết điểm nào cần thay đổi\n` +
            `- 💾 **Lưu nháp** – Lưu lại để dùng sau\n\n` +
            `Chỉ cần nhắn cho tôi bạn muốn gì!`;
          break;
        }
        case 'prepare_listing': {
          const productName = (toolData.productName as string) || 'Sản phẩm mới';
          answer =
            `**${productName} – Hàng chính hãng, chất lượng cao**\n\n` +
            `📝 **Mô tả sản phẩm:**\n${productName} là lựa chọn hàng đầu cho những ai tìm kiếm sản phẩm chất lượng với mức giá hợp lý. Được sản xuất theo quy trình nghiêm ngặt, sản phẩm đảm bảo an toàn và hiệu quả sử dụng.\n\n` +
            `✅ **Điểm nổi bật:**\n- Chất lượng cao cấp, đạt tiêu chuẩn xuất khẩu\n- Đóng gói chắc chắn, bảo quản tốt\n- Phù hợp làm quà tặng hoặc sử dụng hàng ngày\n- Giao hàng nhanh toàn quốc qua Shopee\n\n` +
            `🏷️ **Gợi ý từ khóa Shopee:** ${productName}, mua ${productName}, ${productName} chính hãng, ${productName} giá rẻ, ${productName} chất lượng, hàng Việt Nam chất lượng cao`;
          break;
        }
        case 'revenue': {
          const groups =
            (toolData.revenueGroups as Array<{ totalAmount: number; currency: string; orderCount: number }>) ?? [];
          const summary = groups
            .map((g) => `${g.totalAmount.toLocaleString('vi-VN')} ${g.currency} (${g.orderCount} đơn)`)
            .join('; ');
          answer = `Doanh thu đã xác nhận: ${summary || '0 VND'}. Xem chi tiết tại trang Đơn hàng.`;
          break;
        }
        case 'tasks_today': {
          const total = (toolData.totalPendingInDb as number) ?? 0;
          const today = (toolData.tasksCreatedToday as number) ?? 0;
          answer =
            `Hôm nay doanh nghiệp có ${total} công việc đang chờ xử lý (${today} việc phát sinh trong ngày). ` +
            'Truy cập trang Việc cần duyệt để xử lý.';
          break;
        }
        case 'order_issue': {
          const order = toolData.order as Record<string, unknown> | undefined;
          if (order) {
            const piiRedacted = Boolean(order.piiRedacted);
            answer =
              `Đơn hàng #${order.id} đang ở trạng thái ${order.status}. ` +
              `Ghi chú: ${order.issueDescription ?? 'Không có'}.` +
              (piiRedacted
                ? ' (Thông tin khách hàng đã được ẩn theo quyền Viewer)'
                : ` Liên hệ: ${order.customerName} – ${order.customerPhone}.`);
          } else {
            answer = 'Không tìm thấy thông tin đơn hàng này.';
          }
          break;
        }
        case 'order_not_found':
          answer = 'Không tìm thấy thông tin sự cố cho đơn hàng này.';
          break;
        case 'search': {
          const results = (toolData.results as Array<{ title: string; type: string }>) ?? [];
          const listingDetail = toolData.listingDetail as Record<string, unknown> | undefined;
          if (listingDetail && Object.keys(listingDetail).length > 0) {
            answer = `Bài đăng ${listingDetail.title} trên ${listingDetail.store} đang ở trạng thái ${listingDetail.status}.`;
          } else {
            answer = `Tìm thấy ${results.length} kết quả: ${results.map((r) => r.title).join(', ')}.`;
          }
          break;
        }
        default:
          answer =
            'Tôi chưa tìm được câu trả lời phù hợp. Bạn có thể hỏi về doanh thu, công việc hôm nay, hoặc tìm kiếm tên sản phẩm cụ thể.';
      }

      return {
        rawJson: { answer },
        usage: { inputTokens: 60, outputTokens: 40, estimatedCostUsd: 0.0 },
        providerRequestId: `fixture_assistant_${Date.now()}`,
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
