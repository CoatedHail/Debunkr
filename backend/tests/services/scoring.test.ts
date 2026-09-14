import {
  sourceRepFromTier,
  biasAdjustment,
  computeOverallLegacy,
  bucketLabel,
  computeBayesianScore,
  computeBayesianScoreWithEvidence,
  confidenceFromWidth,
  type BayesianSignals
} from '../../src/services/scoring.js';
import type { EvidenceResult } from '../../src/services/evidence-aggregator.js';

describe('sourceRepFromTier', () => {
  it('maps high → 90', () => expect(sourceRepFromTier('high')).toBe(90));
  it('maps medium → 65', () => expect(sourceRepFromTier('medium')).toBe(65));
  it('maps mixed → 50', () => expect(sourceRepFromTier('mixed')).toBe(50));
  it('maps low → 15', () => expect(sourceRepFromTier('low')).toBe(15));
  it('returns null for unknown', () => expect(sourceRepFromTier('unknown')).toBeNull());
});

describe('biasAdjustment', () => {
  it('center bias (0) → 100', () => expect(biasAdjustment(0)).toBe(100));
  it('full left (-5) → 50', () => expect(biasAdjustment(-5)).toBe(50));
  it('full right (+5) → 50', () => expect(biasAdjustment(5)).toBe(50));
  it('mild lean (+2) → 80', () => expect(biasAdjustment(2)).toBe(80));
  it('clamps out-of-range (10) to 50', () => expect(biasAdjustment(10)).toBe(50));
  it('clamps out-of-range (-10) to 50', () => expect(biasAdjustment(-10)).toBe(50));
});

describe('computeOverallLegacy (v1.0 weighted-sum, retained)', () => {
  it('combines 90 sourceRep + 80 content + 100 biasAdj (center)', () => {
    // 0.45*90 + 0.45*80 + 0.10*100 = 40.5 + 36 + 10 = 86.5 → 87
    expect(computeOverallLegacy({ sourceRep: 90, contentQuality: 80, bias: 0 })).toBe(87);
  });

  it('clamps inputs', () => {
    expect(computeOverallLegacy({ sourceRep: 200, contentQuality: -10, bias: 0 })).toBe(55);
  });
});

describe('bucketLabel', () => {
  it('80-100 → highly-credible', () => {
    expect(bucketLabel(80)).toBe('highly-credible');
    expect(bucketLabel(100)).toBe('highly-credible');
  });
  it('60-79 → mostly-credible', () => {
    expect(bucketLabel(60)).toBe('mostly-credible');
    expect(bucketLabel(79)).toBe('mostly-credible');
  });
  it('40-59 → mixed', () => {
    expect(bucketLabel(40)).toBe('mixed');
    expect(bucketLabel(59)).toBe('mixed');
  });
  it('20-39 → questionable', () => {
    expect(bucketLabel(20)).toBe('questionable');
    expect(bucketLabel(39)).toBe('questionable');
  });
  it('0-19 → low', () => {
    expect(bucketLabel(0)).toBe('low');
    expect(bucketLabel(19)).toBe('low');
  });
});

describe('confidenceFromWidth', () => {
  it('narrow (≤15) → high', () => {
    expect(confidenceFromWidth(0)).toBe('high');
    expect(confidenceFromWidth(15)).toBe('high');
  });
  it('mid (16-30) → medium', () => {
    expect(confidenceFromWidth(16)).toBe('medium');
    expect(confidenceFromWidth(30)).toBe('medium');
  });
  it('wide (>30) → low', () => {
    expect(confidenceFromWidth(31)).toBe('low');
    expect(confidenceFromWidth(100)).toBe('low');
  });
});

describe('computeBayesianScore', () => {
  // Baseline signals — a solid, in-dataset high-tier publisher with a
  // well-written article and no bias. Individual tests override fields.
  const solid: BayesianSignals = {
    publisherTier: 'high',
    publisherInDataset: true,
    contentQuality: 95,
    bias: 0
  };

  it('high-tier + high quality + neutral bias scores ≥ 80', () => {
    const s = computeBayesianScore(solid);
    expect(s.overall).toBeGreaterThanOrEqual(80);
    // With this much converging evidence the CI should sit at the top.
    expect(s.confidenceInterval.lower).toBeGreaterThan(70);
  });

  it('low-tier + low quality + neutral bias scores ≤ 20', () => {
    const s = computeBayesianScore({
      publisherTier: 'low',
      publisherInDataset: true,
      contentQuality: 10,
      bias: 0
    });
    expect(s.overall).toBeLessThanOrEqual(20);
    expect(s.confidenceInterval.upper).toBeLessThan(30);
  });

  it('clamps output to [5, 95] even for maximally-negative signals', () => {
    const worst = computeBayesianScore({
      publisherTier: 'low',
      publisherInDataset: true,
      contentQuality: 0,
      bias: 5,
      factCheck: { scoreDelta: -30, verdict: 'contradicted' }
    });
    expect(worst.overall).toBeGreaterThanOrEqual(5);
    expect(worst.overall).toBeLessThanOrEqual(95);

    const best = computeBayesianScore({
      publisherTier: 'high',
      publisherInDataset: true,
      contentQuality: 100,
      bias: 0,
      factCheck: { scoreDelta: 10, verdict: 'corroborated' }
    });
    expect(best.overall).toBeGreaterThanOrEqual(5);
    expect(best.overall).toBeLessThanOrEqual(95);
  });

  it('contradicted fact-check on a mixed-tier publisher compounds beyond the old ±30 clamp', () => {
    const base: BayesianSignals = {
      publisherTier: 'mixed',
      publisherInDataset: true,
      contentQuality: 60,
      bias: 0
    };
    const before = computeBayesianScore(base);
    const after = computeBayesianScore({
      ...base,
      factCheck: { scoreDelta: -30, verdict: 'contradicted' }
    });

    // Old system was `overall + clamp(-30..+10)` = at most a 30-point drop.
    // Log-odds compounding lets the same evidence pull further.
    const drop = before.overall - after.overall;
    expect(drop).toBeGreaterThan(30);
  });

  it('confidence interval is narrower when signals converge (high-quality known publisher)', () => {
    const narrow = computeBayesianScore(solid);
    const wide = computeBayesianScore({
      publisherTier: 'unknown',
      publisherInDataset: false,
      contentQuality: 50,
      bias: 0
    });
    const narrowW = narrow.confidenceInterval.upper - narrow.confidenceInterval.lower;
    const wideW = wide.confidenceInterval.upper - wide.confidenceInterval.lower;
    expect(narrowW).toBeLessThan(wideW);
  });

  it('unknown publisher without deep analysis yields a wide interval → lower confidence', () => {
    const s = computeBayesianScore({
      publisherTier: 'unknown',
      publisherInDataset: false,
      contentQuality: 50,
      bias: 0
    });
    const width = s.confidenceInterval.upper - s.confidenceInterval.lower;
    expect(width).toBeGreaterThan(30);
    expect(s.confidence).toBe('low');
  });

  it('interval width is monotonic in evidence — adding a corroborating fact-check tightens it', () => {
    const base: BayesianSignals = {
      publisherTier: 'medium',
      publisherInDataset: true,
      contentQuality: 70,
      bias: 0
    };
    const before = computeBayesianScore(base);
    const after = computeBayesianScore({
      ...base,
      factCheck: { scoreDelta: 10, verdict: 'corroborated' }
    });
    const beforeW = before.confidenceInterval.upper - before.confidenceInterval.lower;
    const afterW = after.confidenceInterval.upper - after.confidenceInterval.lower;
    expect(afterW).toBeLessThanOrEqual(beforeW);
  });

  it('confidenceInterval bounds are ordered and in [0, 100]', () => {
    const inputs: BayesianSignals[] = [
      { publisherTier: 'high', publisherInDataset: true, contentQuality: 95, bias: 0 },
      { publisherTier: 'low', publisherInDataset: true, contentQuality: 15, bias: 4 },
      { publisherTier: 'unknown', publisherInDataset: false, contentQuality: 50, bias: 0 },
      { publisherTier: 'mixed', publisherInDataset: false, contentQuality: 30, bias: -3 }
    ];
    for (const s of inputs) {
      const r = computeBayesianScore(s);
      expect(r.confidenceInterval.lower).toBeGreaterThanOrEqual(0);
      expect(r.confidenceInterval.upper).toBeLessThanOrEqual(100);
      expect(r.confidenceInterval.lower).toBeLessThanOrEqual(r.confidenceInterval.upper);
    }
  });
});

describe('computeBayesianScoreWithEvidence', () => {
  function ev(scoreDelta: number, verdict: EvidenceResult['verdict'] = 'contradicted'): EvidenceResult {
    return {
      verdict,
      confidence: 'medium',
      citations: [],
      scoreDelta,
      reasoning: 'test'
    };
  }

  const base: BayesianSignals = {
    publisherTier: 'medium',
    publisherInDataset: true,
    contentQuality: 70,
    bias: 0
  };

  it('leaves score unchanged when evidence is undefined', () => {
    const a = computeBayesianScore(base);
    const b = computeBayesianScoreWithEvidence(base, undefined);
    expect(b.overall).toBe(a.overall);
  });

  it('leaves score unchanged when scoreDelta is not a finite number', () => {
    const a = computeBayesianScore(base);
    const b = computeBayesianScoreWithEvidence(base, ev(NaN));
    const c = computeBayesianScoreWithEvidence(base, ev('big' as unknown as number));
    const d = computeBayesianScoreWithEvidence(base, ev(Infinity));
    expect(b.overall).toBe(a.overall);
    expect(c.overall).toBe(a.overall);
    expect(d.overall).toBe(a.overall);
  });

  it('scoreDelta 0 leaves the point score unchanged', () => {
    const a = computeBayesianScore(base);
    const b = computeBayesianScoreWithEvidence(base, ev(0, 'uncorroborated'));
    expect(b.overall).toBe(a.overall);
  });

  it('negative scoreDelta lowers overall; positive scoreDelta raises it', () => {
    const neutral = computeBayesianScore(base);
    const negative = computeBayesianScoreWithEvidence(base, ev(-20, 'contradicted'));
    const positive = computeBayesianScoreWithEvidence(base, ev(10, 'corroborated'));
    expect(negative.overall).toBeLessThan(neutral.overall);
    expect(positive.overall).toBeGreaterThan(neutral.overall);
  });
});
