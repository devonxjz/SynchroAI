import type { ForbiddenCheckResult, ForbiddenKeywordList } from './types.ts';

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Kiểm tra xem một cụm từ khóa có chứa bất kỳ từ cấm nào theo danh sách có phiên bản không
 */
export function isForbiddenKeyword(
  phrase: string,
  forbiddenList?: ForbiddenKeywordList
): ForbiddenCheckResult {
  if (!forbiddenList || !Array.isArray(forbiddenList.terms) || forbiddenList.terms.length === 0) {
    return { isForbidden: false };
  }

  const normalizedPhrase = phrase.trim().normalize('NFC').toLowerCase();

  for (const term of forbiddenList.terms) {
    if (!term || typeof term !== 'string') continue;
    const cleanTerm = term.trim().normalize('NFC').toLowerCase();
    if (!cleanTerm) continue;

    // Sử dụng regex với ranh giới từ hoặc ranh giới khoảng trắng/dấu câu
    const pattern = new RegExp(`(^|\\s|[.,!?;:/\\-])${escapeRegExp(cleanTerm)}($|\\s|[.,!?;:/\\-])`, 'i');
    if (pattern.test(normalizedPhrase)) {
      return {
        isForbidden: true,
        matchedTerm: term,
        ruleVersion: forbiddenList.version,
      };
    }
  }

  return { isForbidden: false };
}
