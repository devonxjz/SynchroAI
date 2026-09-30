import type { AssistantMessage, ServerContext } from './types.ts';
import { redactString } from '../exception/sanitizer.ts';

export interface StoredConversation {
  id: string;
  tenantId: string;
  userId: string;
  mode: 'live' | 'demo';
  messages: AssistantMessage[];
  createdAt: string;
  updatedAt: string;
}

export class ConversationManager {
  private conversations = new Map<string, StoredConversation>();

  public createConversation(context: ServerContext): StoredConversation {
    const id = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();
    const conv: StoredConversation = {
      id,
      tenantId: context.tenantId,
      userId: context.userId,
      mode: context.mode,
      messages: [],
      createdAt: now,
      updatedAt: now,
    };
    this.conversations.set(id, conv);
    return conv;
  }

  public getConversation(id: string, context: ServerContext): StoredConversation | null {
    const conv = this.conversations.get(id);
    if (!conv) return null;

    // Strict cross-tenant and mode isolation
    if (conv.tenantId !== context.tenantId || conv.mode !== context.mode) {
      return null;
    }

    return conv;
  }

  public getSanitizedHistory(id: string, context: ServerContext): AssistantMessage[] {
    const conv = this.getConversation(id, context);
    if (!conv) return [];

    const isViewer = context.role === 'viewer';

    return conv.messages.map((msg) => {
      if (!isViewer) {
        return { ...msg };
      }

      // If user is currently a Viewer, sanitize past messages to purge historical PII
      return {
        ...msg,
        content: redactString(msg.content),
      };
    });
  }

  public appendMessage(id: string, message: AssistantMessage, context: ServerContext): boolean {
    const conv = this.getConversation(id, context);
    if (!conv) return false;

    conv.messages.push(message);
    conv.updatedAt = new Date().toISOString();
    this.conversations.set(id, conv);
    return true;
  }

  public clear(): void {
    this.conversations.clear();
  }
}

export const globalConversationManager = new ConversationManager();
