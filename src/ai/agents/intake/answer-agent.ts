import { createHash } from 'node:crypto';
import type { ServerContext } from '../assistant/types.ts';
import type { ModelCallGateway } from '../../model-call/gateway.ts';
import type { ModelCallRequest, RuntimeContext } from '../../model-call/types.ts';
import type { IntakeTaskDraft, LongTermMemoryEntry } from '../../chatbot/types.ts';

export interface IntakeAnswerInput {
  message: string;
  documentText?: string;
  draft: IntakeTaskDraft;
  formattedContext: string;
  longTermMemories: LongTermMemoryEntry[];
}

export interface IntakeAnswerResult {
  answer: string;
  generatedBy?: 'live_provider' | 'demo_fixture' | 'fake_provider' | 'cache';
}

const INTAKE_SYSTEM_INSTRUCTION =
  'Bạn là Trợ lý AI Synchro – chuyên gia hỗ trợ quản lý bán hàng đa sàn thương mại điện tử tại Đông Nam Á.\n' +
  'Luôn trả lời bằng tiếng Việt, ngắn gọn, thân thiện và chuyên nghiệp.\n' +
  'Chỉ sử dụng dữ liệu thực từ trường "draft" và "formattedContext" được cung cấp; không bịa đặt số liệu.\n' +
  'Nếu "longTermMemories" có mục, hãy áp dụng và nêu rõ đã nhớ ưu tiên của người bán trong câu trả lời.\n' +
  'Output PHẢI là JSON hợp lệ đúng định dạng: {"answer":"<câu trả lời tiếng Việt>"}';

/**
 * Generates the intake reply through ModelCallGateway so RAG context, the draft
 * snapshot and long-term memory badges all reach the model. Never bypass the
 * gateway — budget, cache and demo/live routing live there.
 */
export async function generateIntakeAnswer(
  gateway: ModelCallGateway,
  context: ServerContext,
  input: IntakeAnswerInput
): Promise<IntakeAnswerResult> {
  const inputHash = createHash('sha256')
    .update(
      JSON.stringify({
        message: input.message,
        documentText: input.documentText,
        draftId: input.draft.draftId,
        formattedContext: input.formattedContext,
        longTermMemories: input.longTermMemories,
        tenantId: context.tenantId,
      })
    )
    .digest('hex');

  const runtimeCtx: RuntimeContext = {
    tenantId: context.tenantId,
    mode: context.mode,
    runId: `intake_${input.draft.draftId}`,
    stepId: 'answer',
    attemptId: 1,
    deadlineMs: 30000,
  };

  const request: ModelCallRequest<{ answer: string }> = {
    agentName: 'intake_answer',
    promptVersion: 'v1',
    schemaVersion: '1.0.0',
    modelConfigId: 'gpt-4o-mini',
    systemInstruction: INTAKE_SYSTEM_INSTRUCTION,
    userPayload: {
      message: input.message,
      documentText: input.documentText,
      draft: input.draft,
      formattedContext: input.formattedContext,
      longTermMemories: input.longTermMemories,
      userRole: context.role,
    },
    snapshotRef: { id: input.draft.draftId, version: input.draft.version, hash: input.draft.draftHash },
    inputHash,
    maxOutputTokens: 512,
    validateOutput: (raw: unknown) => {
      if (
        raw !== null &&
        typeof raw === 'object' &&
        'answer' in raw &&
        typeof (raw as Record<string, unknown>).answer === 'string'
      ) {
        return { valid: true, data: { answer: (raw as Record<string, unknown>).answer as string } };
      }
      return { valid: false, errors: ['Trường answer bị thiếu hoặc không phải chuỗi'] };
    },
  };

  try {
    const result = await gateway.callStructuredModel(request, runtimeCtx);
    return { answer: result.artifact.answer, generatedBy: result.generatedBy };
  } catch {
    // Degraded mode: report no generatedBy so the answer is never shown as a model reply.
    const readyNote =
      input.draft.status === 'ready'
        ? 'Bản nháp nhiệm vụ đã sẵn sàng xem trước và kích hoạt.'
        : `Bản nháp còn thiếu chi tiết: ${input.draft.clarificationQuestions?.join(', ')}`;
    return {
      answer: `Đã tiếp nhận thông tin sản phẩm "${input.draft.productSnapshot.title}". ${readyNote}`,
    };
  }
}
