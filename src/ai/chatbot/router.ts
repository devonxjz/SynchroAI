export type ChatRoute = 'intake' | 'assistant';

/** The single endpoint the UI posts every chat turn to. */
export const CHAT_MESSAGE_ENDPOINT = '/api/chatbot/message';

export interface ClassifyChatInput {
  message: string;
  documentText?: string | null;
}

/**
 * Server-side intent classification: a pasted spec goes to the RAG/intake
 * path, plain text goes to the assistant. The UI must never decide this.
 */
export function classifyChatRoute(input: ClassifyChatInput): ChatRoute {
  const hasDocument = Boolean(input.documentText && input.documentText.trim().length > 0);
  return hasDocument ? 'intake' : 'assistant';
}
