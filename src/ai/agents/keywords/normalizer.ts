import type { KeywordItem } from './types.ts';

export interface NormalizedKeyword {
  display: string;
  lookupKey: string;
}

export interface NormalizerOptions {
  maxPhraseLength?: number;
}

/**
 * Chuẩn hóa một cụm từ khóa: trim, gộp khoảng trắng thừa và chuẩn hóa Unicode NFC
 */
export function normalizeKeyword(
  rawPhrase: string,
  options?: NormalizerOptions
): NormalizedKeyword {
  if (!rawPhrase || typeof rawPhrase !== 'string') {
    return { display: '', lookupKey: '' };
  }

  const maxLen = options?.maxPhraseLength ?? 100;

  // 1. Chuẩn hóa Unicode NFC và cắt gọt khoảng trắng thừa
  let display = rawPhrase.normalize('NFC').trim();
  display = display.replace(/\s+/g, ' ');

  // 2. Giới hạn độ dài tối đa
  if (Array.from(display).length > maxLen) {
    display = Array.from(display).slice(0, maxLen).join('').trim();
  }

  // 3. Tạo lookupKey không phân biệt hoa thường để khử trùng lặp
  const lookupKey = display.toLowerCase();

  return { display, lookupKey };
}

/**
 * Khử trùng lặp danh sách từ khóa theo lookupKey
 * Ưu tiên giữ lại mục có groundingStatus là 'verified' nếu xảy ra trùng lặp
 */
export function deduplicateKeywords<T extends KeywordItem>(
  items: T[],
  _locale?: string
): T[] {
  const map = new Map<string, { item: T; index: number }>();

  for (let i = 0; i < items.length; i++) {
    const raw = items[i];
    const norm = normalizeKeyword(raw.phrase);
    if (!norm.lookupKey) continue;

    const existing = map.get(norm.lookupKey);
    if (!existing) {
      map.set(norm.lookupKey, {
        item: { ...raw, phrase: norm.display },
        index: i,
      });
      continue;
    }

    // Nếu mục hiện tại là verified nhưng mục đã lưu là unverified_semantic, thay thế bằng mục verified
    if (
      raw.groundingStatus === 'verified' &&
      existing.item.groundingStatus !== 'verified'
    ) {
      map.set(norm.lookupKey, {
        item: { ...raw, phrase: norm.display },
        index: existing.index, // Giữ vị trí xuất hiện ban đầu
      });
    }
  }

  // Sắp xếp lại theo vị trí xuất hiện ban đầu
  return Array.from(map.values())
    .sort((a, b) => a.index - b.index)
    .map((v) => v.item);
}
