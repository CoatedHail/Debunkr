import type {
  Confidence,
  OverallBucket,
  ReliabilityTier
} from '../types/api.js';

const TIER_TO_SCORE: Record<Exclude<ReliabilityTier, 'unknown'>, number> = {
  high: 90,
  medium: 65,
  mixed: 50,
  low: 15
};

export function sourceRepFromTier(tier: ReliabilityTier): number | null {
  if (tier === 'unknown') return null;
  return TIER_TO_SCORE[tier];
}

/**
 * Bias adjustment: 100 - |bias| × 10, clamped to [50, 100].
 * Center (0) → 100 (no penalty). Extreme (±5) → 50 (max penalty).
 * Out-of-range inputs clamp at the ±5 extreme.
 */
export function biasAdjustment(bias: number): number {
  const clamped = Math.max(-5, Math.min(5, bias));
  return 100 - Math.abs(clamped) * 10;
}

export interface OverallInputs {
  sourceRep: number;       // 0-100
  contentQuality: number;  // 0-100
  bias: number;            // -5..+5
}

/**
 * Combined weighted score per spec §6:
 *   Overall = 0.45·SourceRep + 0.45·ContentQuality + 0.10·BiasAdjustment
 * Inputs clamped, output rounded to integer.
 */
export function computeOverall(inputs: OverallInputs): number {
  const sr = Math.max(0, Math.min(100, inputs.sourceRep));
  const cq = Math.max(0, Math.min(100, inputs.contentQuality));
  const ba = biasAdjustment(inputs.bias);
  return Math.round(0.45 * sr + 0.45 * cq + 0.10 * ba);
}

export function bucketLabel(overall: number): OverallBucket {
  if (overall >= 80) return 'highly-credible';
  if (overall >= 60) return 'mostly-credible';
  if (overall >= 40) return 'mixed';
  if (overall >= 20) return 'questionable';
  return 'low';
}

export interface ConfidenceInputs {
  datasetCount: number;      // number of dataset verdicts covering the publisher
  extractionOk: boolean;     // was the article body successfully extracted
}

/**
 * Spec §6 deterministic confidence:
 *   high   — 2+ datasets AND extraction ok
 *   medium — 1 dataset AND extraction ok, OR 2+ datasets without extraction
 *   low    — 0 datasets (cheap-signals fallback only)
 */
export function deriveConfidence(inputs: ConfidenceInputs): Confidence {
  if (inputs.datasetCount === 0) return 'low';
  if (inputs.datasetCount >= 2 && inputs.extractionOk) return 'high';
  return 'medium';
}
