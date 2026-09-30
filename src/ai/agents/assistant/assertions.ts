import type { Citation, ServerStructuredAssertion } from './types.ts';

export function enforceServerTruth(
  answer: string,
  citations: Citation[],
  assertions: ServerStructuredAssertion[]
): { truthfulAnswer: string; verifiedCitations: Citation[] } {
  let adjustedAnswer = answer;

  for (const assertion of assertions) {
    if (assertion.assertionType === 'listing_status') {
      const status = String(assertion.verifiedData.status);
      const isPending = status === 'queued' || status === 'pending';

      // Check if text falsely claims successful publication
      const lower = adjustedAnswer.toLowerCase();
      if (isPending && (lower.includes('đã đăng') || lower.includes('đã hoàn tất') || lower.includes('đã xuất bản'))) {
        adjustedAnswer = adjustedAnswer.replace(
          /đã đăng\s*(thành công)?|đã hoàn tất|đã xuất bản/gi,
          'đang trong hàng đợi chờ gửi (chưa hoàn tất đăng trên sàn)'
        );
      }
    }
  }

  // Filter out any citation that does not have a valid internal url or ID
  const verifiedCitations = citations.filter((c) => Boolean(c.recordId && c.internalUrl && c.recordType));

  return {
    truthfulAnswer: adjustedAnswer,
    verifiedCitations,
  };
}
