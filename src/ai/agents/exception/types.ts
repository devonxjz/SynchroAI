export type DispatchStatus = 'confirmed' | 'rejected' | 'retryable_not_sent' | 'unknown';

export type FailureClass =
  | 'network_pre_dispatch'
  | 'rate_limit'
  | 'auth_credential'
  | 'validation_missing_field'
  | 'policy_claim_violation'
  | 'external_unknown'
  | 'inventory_sku_mismatch'
  | 'system_unrecognized';

export type FailureAction =
  | 'retry_immediate'
  | 'retry_with_backoff'
  | 'reconnect_auth'
  | 'create_repair_task'
  | 'reconcile_external'
  | 'halt_for_human';

export type OperationType = 'idempotent_read' | 'idempotent_write' | 'non_idempotent_write';

export interface AdapterCapabilities {
  platform: string;
  adapterVersion: string;
  supportsIdempotency: boolean;
}

export interface SanitizedErrorPayload {
  code: string;
  safeMessage: string;
  subCode?: string;
  correlationId: string;
  timestamp: string;
}

export interface FieldPatch {
  fieldPath: string;
  previousValue: unknown;
  proposedValue: unknown;
  factSourceVersion?: number;
  sourceRef?: string;
}

export interface AttemptToken {
  actionId: string;
  attemptNumber: number;
  maxAttempts: number;
  issuedAt: string;
  token: string;
}

export interface ActionBudgetRecord {
  actionId: string;
  initialAttemptUsed: boolean;
  maxRetries: number;
  retriesUsed: number;
  exhausted: boolean;
  nextAllowedAt?: string;
  lastAttemptId?: string;
}

export interface DeterministicClassification {
  failureClass: FailureClass;
  nextAction: FailureAction;
  reasonVi: string;
  dispatchStatus: DispatchStatus;
  canRetry: boolean;
  requiresReconciliation: boolean;
}

export interface ExceptionAnalysisResult {
  failureClass: FailureClass;
  nextAction: FailureAction;
  summaryVi: string;
  evidenceRefs: string[];
  fieldPatches: FieldPatch[];
  missingInformation?: string[];
  warnings: string[];
  retrySchedule?: {
    nextAllowedAt: string;
    attemptNumber: number;
    delayMs: number;
  };
  needsHumanReview: boolean;
  requiresReconciliation: boolean;
}

export interface ExceptionAgentInput {
  tenantId: string;
  mode: 'live' | 'demo';
  storeId: string;
  actionId: string;
  operation: string;
  operationType: OperationType;
  adapterCapabilities: AdapterCapabilities;
  dispatchStatus: DispatchStatus;
  rawError: unknown;
  attemptId: string;
  payloadVersion: number;
  productFacts?: Record<string, unknown>;
  targetEntity: {
    entityType: 'connection' | 'product' | 'order';
    targetId: string;
  };
}
