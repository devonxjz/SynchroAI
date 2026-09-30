import type { KeywordItem } from './types.ts';

export interface RankingConfig {
  maxItems?: number;
}

/**
 * Xếp hạng ổn định dựa trên mức độ xác minh nguồn gốc và cắt tỉa theo ngưỡng cấu hình
 * Ưu tiên các từ khóa có groundingStatus là 'verified' trước 'unverified_semantic'
 */
export function rankAndCapKeywords<T extends KeywordItem>(
  items: T[],
  config?: RankingConfig
): T[] {
  const maxItems = config?.maxItems ?? 10;

  // Tách thành hai nhóm: verified và unverified_semantic nhưng vẫn bảo toàn thứ tự ban đầu của mỗi nhóm
  const verified: T[] = [];
  const unverified: T[] = [];

  for (const item of items) {
    if (item.groundingStatus === 'verified') {
      verified.push(item);
    } else {
      unverified.push(item);
    }
  }

  // Kết hợp danh sách có ưu tiên
  const ranked = [...verified, ...unverified];

  // Cắt tỉa theo ngưỡng tối đa, không tự ý bù số lượng nếu danh sách ngắn hơn ngưỡng
  return ranked.slice(0, maxItems);
}
