import { mkdirSync, appendFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const PRICING: Record<string, { input: number; output: number }> = {
  'claude-haiku-4-5':  { input: 0.80, output: 4.00 },
  'claude-sonnet-4-6': { input: 3.00, output: 15.00 },
  'claude-opus-4-7':   { input: 15.00, output: 75.00 }
};

export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const price = PRICING[model] ?? PRICING['claude-haiku-4-5'];
  return (inputTokens / 1_000_000) * price.input
       + (outputTokens / 1_000_000) * price.output;
}

export interface RecordInput {
  jobId?: string;
  deviceId?: string;
  ip?: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface BudgetCheck {
  exceeded: boolean;
  monthlySpendUsd: number;
  budgetUsd: number;
}

export interface CostTrackerOptions {
  monthlyBudgetUsd: number;  // 0 = disabled
  dataDir: string;
}

export interface CostTracker {
  record(input: RecordInput): Promise<void>;
  check(): Promise<BudgetCheck>;
}

interface CostEvent {
  ts: string;
  jobId?: string;
  deviceId?: string;
  ip?: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

function currentMonthPrefix(): string {
  // YYYY-MM in UTC
  return new Date().toISOString().slice(0, 7);
}

export function createCostTracker(opts: CostTrackerOptions): CostTracker {
  mkdirSync(opts.dataDir, { recursive: true });
  const logPath = path.join(opts.dataDir, 'cost-events.jsonl');

  // Replay current-month spend on boot.
  let monthlySpend = 0;
  let currentMonth = currentMonthPrefix();
  if (existsSync(logPath)) {
    const text = readFileSync(logPath, 'utf-8');
    for (const line of text.split('\n')) {
      if (!line) continue;
      try {
        const e = JSON.parse(line) as CostEvent;
        if (e.ts.startsWith(currentMonth)) {
          monthlySpend += e.costUsd;
        }
      } catch { /* skip malformed */ }
    }
  }

  function maybeRollMonth(): void {
    const nowMonth = currentMonthPrefix();
    if (nowMonth !== currentMonth) {
      currentMonth = nowMonth;
      monthlySpend = 0;
    }
  }

  return {
    async record({ jobId, deviceId, ip, model, inputTokens, outputTokens }) {
      maybeRollMonth();
      const costUsd = estimateCost(model, inputTokens, outputTokens);
      monthlySpend += costUsd;
      const event: CostEvent = {
        ts: new Date().toISOString(),
        jobId, deviceId, ip, model,
        inputTokens, outputTokens, costUsd
      };
      appendFileSync(logPath, JSON.stringify(event) + '\n');
    },

    async check() {
      maybeRollMonth();
      if (opts.monthlyBudgetUsd <= 0) {
        return { exceeded: false, monthlySpendUsd: 0, budgetUsd: 0 };
      }
      return {
        exceeded: monthlySpend >= opts.monthlyBudgetUsd,
        monthlySpendUsd: monthlySpend,
        budgetUsd: opts.monthlyBudgetUsd
      };
    }
  };
}
