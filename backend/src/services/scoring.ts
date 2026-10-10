import type {
  Confidence,
  OverallBucket,
  ReliabilityTier
} from '../types/api.js';
import type { EvidenceResult, Verdict } from './evidence-aggregator.js';

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
 *
 * Retained for the legacy scoring path (see computeOverallLegacy) and any
 * callers that want a raw bias penalty on the 0-100 scale.
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
 * Legacy v1.0 weighted-sum scoring, retained for tooling that wants the
 * old signal-neutral 0-100 combination:
 *   Overall = 0.45·SourceRep + 0.45·ContentQuality + 0.10·BiasAdjustment
 * Inputs clamped, output rounded to integer. Not used by the /api/check
 * route any more — see computeBayesianScore for the v1.5 replacement.
 */
export function computeOverallLegacy(inputs: OverallInputs): number {
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

// ---------------------------------------------------------------------------
// v1.5 — Bayesian log-odds combination + Beta-posterior confidence interval.
// ---------------------------------------------------------------------------
//
// Each signal (publisher tier, article quality, tone/balance, fact-check
// evidence delta) is mapped to a likelihood ratio LR = P(observed | credible)
// / P(observed | not credible). LRs combine additively in log-odds space; the
// point score is sigmoid(log_odds).
//
// Each signal also carries a *precision* weight — roughly how much evidence
// that signal represents (LLM read the full article vs. a coarse tier flag).
// Precision-weighted |log(LR)| contributions flow into a Beta(α, β) posterior;
// we then read off a 95% CI using the mean/variance-based Wilson-score
// approximation.
//
// Point score is clamped to [5, 95] so the UI preserves room for honest
// extremes rather than saturating at 0/100.

const PUBLISHER_LR: Record<ReliabilityTier, number> = {
  high: 4.0,
  medium: 1.5,
  mixed: 1.0,
  low: 0.25,
  unknown: 1.0
};

/**
 * Exponential ramp: quality=0 → 0.1, quality=50 → 1.325, quality=100 → 5.0.
 * Squared shape means the top-of-scale articles pull hard, while merely-OK
 * articles contribute nearly-neutral evidence.
 */
function qualityLR(q: number): number {
  const cq = Math.max(0, Math.min(100, q));
  const frac = cq / 100;
  return 0.1 + 4.9 * frac * frac;
}

/**
 * Bias penalty: 5% per point of |bias|, floored at 0.5 so extreme lean never
 * fully vetos an otherwise-solid article. |bias| is clamped at 10 (well past
 * the ±5 documented scale) as a defense-in-depth against runaway inputs.
 */
function biasLR(b: number): number {
  const clamped = Math.max(-10, Math.min(10, b));
  return Math.max(0.5, 1 - 0.05 * Math.abs(clamped));
}

/**
 * Fact-check delta → LR: delta=-30 → ~0.135 (strong negative), delta=0 → 1,
 * delta=+10 → ~1.95. Matches the [-30, +10] range the evidence aggregator
 * emits today.
 */
function factCheckLR(delta: number): number {
  const clamped = Math.max(-30, Math.min(10, delta));
  return Math.exp(clamped / 15);
}

export interface BayesianSignals {
  /** Publisher-reputation tier (from curated Wikipedia + IFCN lookup). */
  publisherTier: ReliabilityTier;
  /**
   * True when the publisher appears in the curated dataset (verdicts non-empty).
   * Drives publisher precision — a hit anchors the signal, a miss says our
   * publisher belief is weak evidence.
   */
  publisherInDataset: boolean;
  /** LLM-scored article quality, 0-100. */
  contentQuality: number;
  /** LLM-estimated tone & balance, -5..+5 (clamped internally). */
  bias: number;
  /** Deep-analysis fact-check outcome. Omit when deep hasn't run. */
  factCheck?: {
    scoreDelta: number;
    verdict: Verdict;
  };
}

export interface BayesianScore {
  overall: number;
  confidenceInterval: { lower: number; upper: number };
  confidence: Confidence;
}

interface SignalContribution {
  lr: number;
  precision: number;
}

/**
 * Map 95%-CI width to the legacy confidence enum so the mobile UI's
 * high / medium / low pill keeps its shape:
 *   ≤15 → high (signals converge)
 *   16-30 → medium
 *   >30 → low (posterior still very diffuse — e.g. unknown publisher only)
 */
export function confidenceFromWidth(width: number): Confidence {
  if (width <= 15) return 'high';
  if (width <= 30) return 'medium';
  return 'low';
}

export function computeBayesianScore(signals: BayesianSignals): BayesianScore {
  const contributions: SignalContribution[] = [];

  // Publisher signal — precision downgraded when the publisher isn't in our
  // dataset (so an unknown publisher barely narrows the posterior at all).
  const pubLR = PUBLISHER_LR[signals.publisherTier];
  contributions.push({
    lr: pubLR,
    precision: signals.publisherInDataset ? 4 : 1
  });

  // Article quality — highest precision because the LLM actually reads the
  // whole article body.
  contributions.push({
    lr: qualityLR(signals.contentQuality),
    precision: 6
  });

  // Bias — low precision because it's an LLM estimate without a real dataset.
  contributions.push({
    lr: biasLR(signals.bias),
    precision: 1
  });

  // Fact-check evidence — only when Deep Analysis ran. An "uncorroborated"
  // verdict says we searched and found nothing, so it deserves *some* weight
  // (delta is usually 0 → LR=1 anyway) but far less than a real corroboration
  // or contradiction.
  if (signals.factCheck) {
    contributions.push({
      lr: factCheckLR(signals.factCheck.scoreDelta),
      precision: signals.factCheck.verdict !== 'uncorroborated' ? 8 : 2
    });
  }

  // Point estimate — additive in log-odds space.
  let logOdds = 0;
  for (const c of contributions) logOdds += Math.log(c.lr);
  const pCredible = 1 / (1 + Math.exp(-logOdds));
  const rawOverall = Math.round(pCredible * 100);
  const overall = Math.max(5, Math.min(95, rawOverall));

  // Beta(α, β) posterior — start with a Beta(1,1) uniform prior, then add
  // precision-weighted |log(LR)| evidence to whichever side the signal points.
  let alpha = 1;
  let beta = 1;
  for (const c of contributions) {
    if (c.lr === 1) continue; // exactly-neutral signals shouldn't tighten CI
    const magnitude = c.precision * Math.abs(Math.log(c.lr));
    if (c.lr > 1) alpha += magnitude;
    else beta += magnitude;
  }

  const total = alpha + beta;
  const mean = alpha / total;
  const variance = (alpha * beta) / (total * total * (total + 1));
  const sd = Math.sqrt(variance);

  const lower = Math.max(0, Math.round((mean - 1.96 * sd) * 100));
  const upper = Math.min(100, Math.round((mean + 1.96 * sd) * 100));

  return {
    overall,
    confidenceInterval: { lower, upper },
    confidence: confidenceFromWidth(upper - lower)
  };
}

/**
 * Convenience — recompute a job's Bayesian score after Deep Analysis lands,
 * folding in the aggregator's evidence result. Falls back to the initial
 * scoring signals when `evidence` is missing or its delta is unusable.
 */
export function computeBayesianScoreWithEvidence(
  baseSignals: BayesianSignals,
  evidence?: EvidenceResult
): BayesianScore {
  if (
    !evidence ||
    typeof evidence.scoreDelta !== 'number' ||
    !Number.isFinite(evidence.scoreDelta)
  ) {
    return computeBayesianScore(baseSignals);
  }
  return computeBayesianScore({
    ...baseSignals,
    factCheck: {
      scoreDelta: evidence.scoreDelta,
      verdict: evidence.verdict
    }
  });
}
