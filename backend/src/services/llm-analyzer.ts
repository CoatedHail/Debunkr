import Anthropic from '@anthropic-ai/sdk';
import type { ApiError } from '../types/api.js';
import { CONTENT_ANALYSIS_SYSTEM_PROMPT, buildUserMessage } from '../prompts/content-analysis.js';

export interface AnalyzeOptions {
  client: Anthropic;
  model: string;
}

export type AnalyzeResult =
  | { ok: true; score: number; reasoning: string }
  | { ok: false; error: ApiError['error'] };

interface ParsedLlmOutput {
  contentQuality: number;
  contentReasoning: string;
}

function parseAndValidate(text: string): ParsedLlmOutput | null {
  const cleaned = text.trim().replace(/^```(?:json)?\s*|```\s*$/g, '');
  let obj: unknown;
  try {
    obj = JSON.parse(cleaned);
  } catch {
    return null;
  }
  if (typeof obj !== 'object' || obj === null) return null;
  const o = obj as Record<string, unknown>;
  const q = o.contentQuality;
  const r = o.contentReasoning;
  if (typeof q !== 'number' || !Number.isFinite(q) || q < 0 || q > 100) return null;
  if (typeof r !== 'string' || r.length === 0 || r.length > 2_000) return null;
  return { contentQuality: Math.round(q), contentReasoning: r };
}

async function callOnce(client: Anthropic, model: string, userMessage: string): Promise<string> {
  const response = await client.messages.create({
    model,
    max_tokens: 400,
    system: CONTENT_ANALYSIS_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }]
  });
  const block = response.content.find((b) => b.type === 'text');
  if (!block || block.type !== 'text') return '';
  return block.text;
}

export async function analyzeContent(
  articleText: string,
  opts: AnalyzeOptions
): Promise<AnalyzeResult> {
  const userMessage = buildUserMessage(articleText);

  for (let attempt = 1; attempt <= 2; attempt++) {
    let text: string;
    try {
      text = await callOnce(opts.client, opts.model, userMessage);
    } catch (e) {
      return {
        ok: false,
        error: {
          code: 'LLM_UNAVAILABLE',
          message: 'AI analysis service is unavailable. Try again.',
          retryable: true
        }
      };
    }
    const parsed = parseAndValidate(text);
    if (parsed) {
      return {
        ok: true,
        score: parsed.contentQuality,
        reasoning: parsed.contentReasoning
      };
    }
  }

  return {
    ok: false,
    error: {
      code: 'LLM_MALFORMED',
      message: 'AI returned an invalid response. Please try again.',
      retryable: true
    }
  };
}
