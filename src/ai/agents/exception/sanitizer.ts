import type { SanitizedErrorPayload } from './types.ts';

const SENSITIVE_PATTERNS = [
  /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
  /(?:password|passwd|secret|api[_-]?key|access[_-]?token|refresh[_-]?token)["']?\s*[:=]\s*["']?([^"'\s&]+)/gi,
  /\b0\d{9,10}\b/g, // Vietnamese phone format
  /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, // Standard phone format
];

export function redactString(input: string): string {
  if (!input || typeof input !== 'string') return '';
  let result = input;
  for (const pattern of SENSITIVE_PATTERNS) {
    result = result.replace(pattern, '[REDACTED]');
  }
  return result;
}

export function sanitizeErrorPayload(rawError: unknown, correlationId?: string): SanitizedErrorPayload {
  const now = new Date().toISOString();
  const corrId = correlationId || `corr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  if (!rawError) {
    return {
      code: 'UNKNOWN_ERROR',
      safeMessage: 'Lỗi không xác định.',
      correlationId: corrId,
      timestamp: now,
    };
  }

  if (typeof rawError === 'string') {
    return {
      code: 'RAW_STRING_ERROR',
      safeMessage: redactString(rawError),
      correlationId: corrId,
      timestamp: now,
    };
  }

  if (typeof rawError === 'object') {
    const obj = rawError as Record<string, unknown>;
    const code = typeof obj.code === 'string' ? obj.code : 'UNKNOWN_ERROR';
    const subCode = typeof obj.subCode === 'string' ? obj.subCode : undefined;

    let message = '';
    if (typeof obj.message === 'string') {
      message = obj.message;
    } else if (typeof obj.safeMessage === 'string') {
      message = obj.safeMessage;
    } else if (typeof obj.error_description === 'string') {
      message = obj.error_description;
    } else {
      message = 'Sự cố trong quá trình giao tiếp hệ thống.';
    }

    return {
      code: code.slice(0, 100),
      subCode: subCode ? subCode.slice(0, 100) : undefined,
      safeMessage: redactString(message).slice(0, 500),
      correlationId: corrId,
      timestamp: now,
    };
  }

  return {
    code: 'UNKNOWN_FORMAT_ERROR',
    safeMessage: 'Định dạng lỗi không được hỗ trợ.',
    correlationId: corrId,
    timestamp: now,
  };
}
