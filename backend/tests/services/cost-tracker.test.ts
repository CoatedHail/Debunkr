import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createCostTracker, estimateCost } from '../../src/services/cost-tracker.js';

describe('estimateCost', () => {
  it('computes USD for Haiku rates (Haiku: $0.80/M input, $4/M output)', () => {
    const c = estimateCost('claude-haiku-4-5', 1_000_000, 1_000_000);
    expect(c).toBeCloseTo(4.80, 2);
  });
});

describe('CostTracker', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(path.join(tmpdir(), 'cost-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('allows request when under budget', async () => {
    const tr = createCostTracker({ monthlyBudgetUsd: 10, dataDir: dir });
    const r = await tr.check();
    expect(r.exceeded).toBe(false);
  });

  it('records a cost event and updates monthly total', async () => {
    const tr = createCostTracker({ monthlyBudgetUsd: 10, dataDir: dir });
    await tr.record({ jobId: 'j1', deviceId: 'd1', ip: '1.2.3.4', model: 'claude-haiku-4-5', inputTokens: 1000, outputTokens: 500 });
    const r = await tr.check();
    expect(r.monthlySpendUsd).toBeGreaterThan(0);
  });

  it('trips when monthly spend exceeds cap', async () => {
    const tr = createCostTracker({ monthlyBudgetUsd: 0.005, dataDir: dir });
    await tr.record({ jobId: 'j1', deviceId: 'd1', ip: '1.2.3.4', model: 'claude-haiku-4-5', inputTokens: 5_000, outputTokens: 1_000 });
    const r = await tr.check();
    expect(r.exceeded).toBe(true);
  });

  it('does not trip when budget cap disabled (0)', async () => {
    const tr = createCostTracker({ monthlyBudgetUsd: 0, dataDir: dir });
    await tr.record({ jobId: 'j1', deviceId: 'd1', ip: '1.2.3.4', model: 'claude-haiku-4-5', inputTokens: 10_000_000, outputTokens: 1_000_000 });
    const r = await tr.check();
    expect(r.exceeded).toBe(false);
  });

  it('persists to JSONL and replays on second tracker', async () => {
    const tr1 = createCostTracker({ monthlyBudgetUsd: 10, dataDir: dir });
    await tr1.record({ jobId: 'j1', deviceId: 'd1', ip: '1.2.3.4', model: 'claude-haiku-4-5', inputTokens: 1000, outputTokens: 500 });
    const sum1 = (await tr1.check()).monthlySpendUsd;
    expect(sum1).toBeGreaterThan(0);

    // New tracker reading same dir
    const tr2 = createCostTracker({ monthlyBudgetUsd: 10, dataDir: dir });
    const sum2 = (await tr2.check()).monthlySpendUsd;
    expect(sum2).toBeCloseTo(sum1, 6);
  });
});
