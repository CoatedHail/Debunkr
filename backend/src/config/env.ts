import dotenv from 'dotenv';

// override: true so values in backend/.env win over pre-set shell env vars.
// (Without this, an empty ANTHROPIC_API_KEY in the user's shell blocks the
// real value from being read out of .env.)
dotenv.config({ override: true });

export const env = {
  port: Number(process.env.PORT ?? 4000),
  logLevel: process.env.LOG_LEVEL ?? 'info',
  // Optional: empty string treated as missing. Routes use stub when absent.
  anthropicApiKey: (process.env.ANTHROPIC_API_KEY ?? '').trim() || undefined,
  anthropicModel: process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5',
  // Monthly budget in USD. 0 = disabled (no budget cap enforced).
  monthlyBudgetUsd: Number(process.env.MONTHLY_BUDGET_USD ?? '0'),
  // Optional: empty string treated as missing. Fact-check branch is disabled when absent.
  googleFactCheckApiKey: (process.env.GOOGLE_FACT_CHECK_API_KEY ?? '').trim(),
  // Optional: empty string treated as missing. Web-search branch is disabled when absent.
  braveSearchApiKey: (process.env.BRAVE_SEARCH_API_KEY ?? '').trim()
};

export function hasRealLlm(): boolean {
  return env.anthropicApiKey !== undefined;
}

export function getGoogleFactCheckApiKey(): string {
  return env.googleFactCheckApiKey;
}

export function hasGoogleFactCheckApiKey(): boolean {
  return env.googleFactCheckApiKey.length > 0;
}

export function getBraveSearchApiKey(): string {
  return env.braveSearchApiKey;
}

export function hasBraveSearchApiKey(): boolean {
  return env.braveSearchApiKey.length > 0;
}
