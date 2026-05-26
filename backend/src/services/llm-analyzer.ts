import Anthropic from '@anthropic-ai/sdk';
import type { ApiError } from '../types/api.js';
import { CONTENT_ANALYSIS_SYSTEM_PROMPT, buildUserMessage } from '../prompts/content-analysis.js';

export interface AnalyzeOptions {
  client: Anthropic;
  model: string;
}

export interface UsageStats {
  inputTokens: number;
  outputTokens: number;
}

export interface AnalyzeOk {
  ok: true;
  contentQuality: number;
  contentReasoning: string;
  biasScale: number;
  counterArgument: string;
  usage: UsageStats;
}

export type AnalyzeResult =
  | AnalyzeOk
  | { ok: false; error: ApiError['error']; usage?: UsageStats };

interface ParsedLlmOutput {
  contentQuality: number;
  contentReasoning: string;
  biasScale: number;
  counterArgument: string;
}

function parseAndValidate(text: string): ParsedLlmOutput | null {
  const cleaned = text.trim().replace(/^```(?:json)?\s*|```\s*$/g, '');
  let obj: unknown;
  try { obj = JSON.parse(cleaned); } catch { return null; }
  if (typeof obj !== 'object' || obj === null) return null;
  const o = obj as Record<string, unknown>;
  const q = o.contentQuality;
  const r = o.contentReasoning;
  const b = o.biasScale;
  const ca = o.counterArgument;
  if (typeof q !== 'number' || !Number.isFinite(q) || q < 0 || q > 100) return null;
  if (typeof r !== 'string' || r.length === 0 || r.length > 2_000) return null;
  if (typeof b !== 'number' || !Number.isFinite(b) || b < -5 || b > 5) return null;
  if (typeof ca !== 'string' || ca.length === 0 || ca.length > 2_000) return null;
  return {
    contentQuality: Math.round(q),
    contentReasoning: r,
    biasScale: Math.round(b),
    counterArgument: ca
  };
}

async function callOnce(
  client: Anthropic,
  model: string,
  userMessage: string
): Promise<{ text: string; usage: UsageStats }> {
  const response = await client.messages.create({
    model,
    max_tokens: 800,
    system: CONTENT_ANALYSIS_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }]
  });
  const block = response.content.find((b) => b.type === 'text');
  const text = (block && block.type === 'text') ? block.text : '';
  const usage: UsageStats = {
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0
  };
  return { text, usage };
}

export async function analyzeContent(
  articleText: string,
  opts: AnalyzeOptions
): Promise<AnalyzeResult> {
  const userMessage = buildUserMessage(articleText);
  let totalUsage: UsageStats = { inputTokens: 0, outputTokens: 0 };

  for (let attempt = 1; attempt <= 2; attempt++) {
    let result: { text: string; usage: UsageStats };
    try {
      result = await callOnce(opts.client, opts.model, userMessage);
    } catch (e) {
      return {
        ok: false,
        error: { code: 'LLM_UNAVAILABLE', message: 'AI analysis service is unavailable. Try again.', retryable: true },
        usage: totalUsage
      };
    }
    totalUsage.inputTokens += result.usage.inputTokens;
    totalUsage.outputTokens += result.usage.outputTokens;
    const parsed = parseAndValidate(result.text);
    if (parsed) {
      return { ok: true, ...parsed, usage: totalUsage };
    }
  }

  return {
    ok: false,
    error: { code: 'LLM_MALFORMED', message: 'AI returned an invalid response. Please try again.', retryable: true },
    usage: totalUsage
  };
}
