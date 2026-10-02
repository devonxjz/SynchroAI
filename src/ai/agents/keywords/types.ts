import type { ProductSnapshot } from '../../workflows/prepare-listing/types.ts';

export type KeywordBasis = 'product_fact' | 'measured_dataset';
export type GroundingStatus = 'verified' | 'unverified_semantic';

export interface KeywordItemBase {
  phrase: string;
  reason: string;
  sourceRefs: string[];
}

export interface ProductFactKeywordItem extends KeywordItemBase {
  basis: 'product_fact';
  groundingStatus: GroundingStatus;
  metricRef?: never;
}

export interface MeasuredDatasetKeywordItem extends KeywordItemBase {
  basis: 'measured_dataset';
  groundingStatus: 'verified';
  metricRef: string;
  datasetId: string;
}

export type KeywordItem = ProductFactKeywordItem | MeasuredDatasetKeywordItem;

export interface ForbiddenKeywordList {
  version: string;
  terms: string[];
}

export interface ForbiddenCheckResult {
  isForbidden: boolean;
  matchedTerm?: string;
  ruleVersion?: string;
}

export interface MeasuredMetricDataset {
  id: string;
  version: string;
  market: string;
  locale: string;
  updatedAt: string;
  metrics: Record<string, { searchVolume?: number; cpc?: number }>;
}

export interface KeywordInput {
  snapshot: ProductSnapshot;
  targetLocale: string;
  confirmedCategory?: string;
  brand?: string;
  forbiddenList: ForbiddenKeywordList;
  measuredDataset?: MeasuredMetricDataset;
}

export interface KeywordOutput {
  status: 'completed' | 'fallback';
  errorCode?: 'PROVIDER_TIMEOUT' | 'PROVIDER_ERROR' | 'SCHEMA_ERROR';
  keywords: KeywordItem[];
  warnings: string[];
  snapshotVersion: number;
  forbiddenListVersion: string;
}

export type KeywordValidationResult =
  | {
      valid: true;
      data: KeywordOutput;
      warnings: string[];
    }
  | {
      valid: false;
      errors: string[];
      warnings: string[];
      data?: never;
    };

export interface ResolvedProductAttributes {
  brand?: string;
  confirmedCategory?: string;
  weight?: string;
}
