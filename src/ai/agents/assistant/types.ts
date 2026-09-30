export type UserRole = 'admin' | 'editor' | 'viewer';

export interface ServerContext {
  tenantId: string;
  userId: string;
  role: UserRole;
  mode: 'live' | 'demo';
  permissions: string[];
  userTimezone: string; // e.g. 'Asia/Ho_Chi_Minh'
}

export interface Citation {
  recordType: 'task' | 'product' | 'listing' | 'order' | 'inventory';
  recordId: string;
  version: number;
  internalUrl: string;
  title?: string;
}

export type AssistantResponseStatus =
  | 'answered'
  | 'needs_clarification'
  | 'preview_ready'
  | 'partial_deadline_exceeded'
  | 'partial_budget_exceeded'
  | 'unavailable';

export interface ServerStructuredAssertion {
  assertionType: 'task_count' | 'order_revenue' | 'listing_status';
  verifiedData: Record<string, unknown>;
  isAuthoritative: boolean;
}

export interface AssistantMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  citations?: Citation[];
  actionPreviewId?: string;
  createdAt: string;
}

export interface AssistantResponse {
  conversationId: string;
  answer: string;
  citations: Citation[];
  actionPreviewId?: string;
  status: AssistantResponseStatus;
  asOf: string;
  structuredAssertions?: ServerStructuredAssertion[];
  clarificationOptions?: string[];
}

export interface AssistantApiRequest {
  conversationId?: string;
  message: string;
  idempotencyKey: string;
  targetProposalId?: string;
}
