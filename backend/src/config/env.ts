import 'dotenv/config';

export const env = {
  port: Number(process.env.PORT ?? 4000),
  logLevel: process.env.LOG_LEVEL ?? 'info',
  // Optional: empty string treated as missing. Routes use stub when absent.
  anthropicApiKey: (process.env.ANTHROPIC_API_KEY ?? '').trim() || undefined,
  anthropicModel: process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5'
};

export function hasRealLlm(): boolean {
  return env.anthropicApiKey !== undefined;
}
