import Anthropic from '@anthropic-ai/sdk';
import type { ApiError, DeepAnalysis, AgentReport, JudgeRuling, Confidence } from '../types/api.js';
import {
  SKEPTIC_SYSTEM_PROMPT,
  ADVOCATE_SYSTEM_PROMPT,
  JUDGE_SYSTEM_PROMPT,
  buildAgentUserMessage,
  buildJudgeUserMessage
} from '../prompts/deep-analysis.js';

export interface DeepOptions {
  client: Anthropic;
  model: string;
}

export type DeepResult =
  | { ok: true; deepAnalysis: DeepAnalysis }
  | { ok: false; error: ApiError['error'] };

const MODEL_LIMITATION =
  'All three agents (Skeptic, Advocate, Judge) use the same model family (Claude). They share underlying biases. A future update will mix model families for genuine bias reduction.';

function parseAgent(text: string): AgentReport | null {
  const cleaned = text.trim().replace(/^```(?:json)?\s*|```\s*$/g, '');
  let obj: unknown;
  try { obj = JSON.parse(cleaned); } catch { return null; }
  if (typeof obj !== 'object' || obj === null) return null;
  const o = obj as Record<string, unknown>;
  if (typeof o.reasoning !== 'string' || o.reasoning.length === 0 || o.reasoning.length > 2_000) return null;
  if (!Array.isArray(o.evidence)) return null;
  const evidence: string[] = [];
  for (const item of o.evidence) {
    if (typeof item !== 'string' || item.length === 0 || item.length > 1_000) continue;
    evidence.push(item);
    if (evidence.length >= 3) break;
  }
  return { reasoning: o.reasoning, evidence };
}

function parseJudge(text: string): JudgeRuling | null {
  const cleaned = text.trim().replace(/^```(?:json)?\s*|```\s*$/g, '');
  let obj: unknown;
  try { obj = JSON.parse(cleaned); } catch { return null; }
  if (typeof obj !== 'object' || obj === null) return null;
  const o = obj as Record<string, unknown>;
  if (typeof o.verdict !== 'string' || o.verdict.length === 0 || o.verdict.length > 2_000) return null;
  if (o.confidence !== 'high' && o.confidence !== 'medium' && o.confidence !== 'low') return null;
  return { verdict: o.verdict, confidence: o.confidence as Confidence };
}

async function callAgent(
  client: Anthropic,
  model: string,
  systemPrompt: string,
  userMessage: string
): Promise<string> {
  const response = await client.messages.create({
    model,
    max_tokens: 500,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }]
  });
  const block = response.content.find((b) => b.type === 'text');
  if (!block || block.type !== 'text') return '';
  return block.text;
}

async function callAgentWithRetry(
  client: Anthropic,
  model: string,
  systemPrompt: string,
  userMessage: string
): Promise<AgentReport | null> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const text = await callAgent(client, model, systemPrompt, userMessage);
    const parsed = parseAgent(text);
    if (parsed) return parsed;
  }
  return null;
}

export async function runDeepAnalysis(
  articleText: string,
  opts: DeepOptions
): Promise<DeepResult> {
  const userMsg = buildAgentUserMessage(articleText);

  let skeptic: AgentReport | null;
  try {
    skeptic = await callAgentWithRetry(opts.client, opts.model, SKEPTIC_SYSTEM_PROMPT, userMsg);
  } catch {
    return {
      ok: false,
      error: { code: 'LLM_UNAVAILABLE', message: 'AI service unavailable during skeptic phase.', retryable: true }
    };
  }
  if (!skeptic) {
    return {
      ok: false,
      error: { code: 'LLM_MALFORMED', message: 'Skeptic agent returned invalid output.', retryable: true }
    };
  }

  let advocate: AgentReport | null;
  try {
    advocate = await callAgentWithRetry(opts.client, opts.model, ADVOCATE_SYSTEM_PROMPT, userMsg);
  } catch {
    return {
      ok: false,
      error: { code: 'LLM_UNAVAILABLE', message: 'AI service unavailable during advocate phase.', retryable: true }
    };
  }
  if (!advocate) {
    return {
      ok: false,
      error: { code: 'LLM_MALFORMED', message: 'Advocate agent returned invalid output.', retryable: true }
    };
  }

  const judgeMsg = buildJudgeUserMessage({ articleText, skeptic, advocate });
  let judge: JudgeRuling | null = null;
  try {
    for (let attempt = 1; attempt <= 2; attempt++) {
      const text = await callAgent(opts.client, opts.model, JUDGE_SYSTEM_PROMPT, judgeMsg);
      judge = parseJudge(text);
      if (judge) break;
    }
  } catch {
    return {
      ok: false,
      error: { code: 'LLM_UNAVAILABLE', message: 'AI service unavailable during judge phase.', retryable: true }
    };
  }
  if (!judge) {
    return {
      ok: false,
      error: { code: 'LLM_MALFORMED', message: 'Judge agent returned invalid output.', retryable: true }
    };
  }

  return {
    ok: true,
    deepAnalysis: {
      skeptic,
      advocate,
      judge,
      modelLimitation: MODEL_LIMITATION
    }
  };
}
