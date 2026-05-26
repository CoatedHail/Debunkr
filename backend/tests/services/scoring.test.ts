import {
  sourceRepFromTier,
  biasAdjustment,
  computeOverall,
  bucketLabel,
  deriveConfidence
} from '../../src/services/scoring.js';

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

describe('computeOverall', () => {
  it('combines 90 sourceRep + 80 content + 100 biasAdj (center)', () => {
    // 0.45*90 + 0.45*80 + 0.10*100 = 40.5 + 36 + 10 = 86.5 → 87
    expect(computeOverall({ sourceRep: 90, contentQuality: 80, bias: 0 })).toBe(87);
  });

  it('handles low scores with extreme bias', () => {
    // 0.45*30 + 0.45*40 + 0.10*50 (bias=±5 → adj 50) = 13.5 + 18 + 5 = 36.5 → 37
    expect(computeOverall({ sourceRep: 30, contentQuality: 40, bias: -5 })).toBe(37);
  });

  it('clamps inputs', () => {
    expect(computeOverall({ sourceRep: 200, contentQuality: -10, bias: 0 })).toBe(55);
    // 0.45*100 + 0.45*0 + 0.10*100 = 45 + 0 + 10 = 55
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

describe('deriveConfidence', () => {
  it('high when publisher in 2+ datasets AND article extracted', () => {
    expect(deriveConfidence({ datasetCount: 2, extractionOk: true })).toBe('high');
    expect(deriveConfidence({ datasetCount: 3, extractionOk: true })).toBe('high');
  });
  it('medium when publisher in 1 dataset AND article extracted', () => {
    expect(deriveConfidence({ datasetCount: 1, extractionOk: true })).toBe('medium');
  });
  it('medium when publisher in 2+ datasets BUT article extraction failed', () => {
    expect(deriveConfidence({ datasetCount: 2, extractionOk: false })).toBe('medium');
  });
  it('low when no datasets even if extraction ok', () => {
    expect(deriveConfidence({ datasetCount: 0, extractionOk: true })).toBe('low');
  });
  it('low when no datasets AND no extraction', () => {
    expect(deriveConfidence({ datasetCount: 0, extractionOk: false })).toBe('low');
  });
});
