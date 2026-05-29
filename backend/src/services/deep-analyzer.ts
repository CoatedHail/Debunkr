import Anthropic from '@anthropic-ai/sdk';
import type { ApiError, DeepAnalysis, AgentReport, JudgeRuling, Confidence } from '../types/api.js';
import type { UsageStats } from './llm-analyzer.js';
import {
  SKEPTIC_SYSTEM_PROMPT,
  ADVOCATE_SYSTEM_PROMPT,
  JUDGE_SYSTEM_PROMPT,
  buildAgentUserMessage,
  buildJudgeUserMessage
} from '../prompts/deep-analysis.js';
import {
  runFactCheck as defaultRunFactCheck,
  type FactCheckUsage,
  type FactCheckRunResult
} from './fact-checker.js';
import type { EvidenceResult } from './evidence-aggregator.js';

export interface DeepOptions {
  client: Anthropic;
  model: string;
  /** DI hook for M8 fact-check pipeline; defaults to real runFactCheck. */
  runFactCheckFn?: (articleText: string) => Promise<FactCheckRunResult>;
}

export type DeepResult =
  | {
      ok: true;
      deepAnalysis: DeepAnalysis;
      usage: UsageStats;
      evidence?: EvidenceResult;
      factCheckUsage?: FactCheckUsage;
    }
  | { ok: false; error: ApiError['error']; usage: UsageStats };

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
): Promise<{ text: string; usage: UsageStats }> {
  const response = await client.messages.create({
    model,
    max_tokens: 500,
    system: systemPrompt,
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

interface AgentWithUsage {
  report: AgentReport | null;
  usage: UsageStats;
}

async function callAgentWithRetry(
  client: Anthropic,
  model: string,
  systemPrompt: string,
  userMessage: string
): Promise<AgentWithUsage> {
  let totalUsage: UsageStats = { inputTokens: 0, outputTokens: 0 };
  for (let attempt = 1; attempt <= 2; attempt++) {
    const r = await callAgent(client, model, systemPrompt, userMessage);
    totalUsage.inputTokens += r.usage.inputTokens;
    totalUsage.outputTokens += r.usage.outputTokens;
    const parsed = parseAgent(r.text);
    if (parsed) return { report: parsed, usage: totalUsage };
  }
  return { report: null, usage: totalUsage };
}

export async function runDeepAnalysis(
  articleText: string,
  opts: DeepOptions
): Promise<DeepResult> {
  const userMsg = buildAgentUserMessage(articleText);
  const totalUsage: UsageStats = { inputTokens: 0, outputTokens: 0 };

  function addUsage(u: UsageStats): void {
    totalUsage.inputTokens += u.inputTokens;
    totalUsage.outputTokens += u.outputTokens;
  }

  const runFactCheckFn = opts.runFactCheckFn ?? defaultRunFactCheck;

  // Run Skeptic + Advocate + fact-check in parallel — Judge waits for all three.
  // Use allSettled so a transient skeptic/advocate failure produces a clean
  // structured error rather than a rejection that takes the fact-checker down.
  const factCheckPromise: Promise<FactCheckRunResult | null> = (async () => {
    try {
      return await runFactCheckFn(articleText);
    } catch {
      return null;
    }
  })();

  const [skepticSettled, advocateSettled, factCheckOutcome] = await Promise.all([
    callAgentWithRetry(opts.client, opts.model, SKEPTIC_SYSTEM_PROMPT, userMsg).then(
      (r) => ({ ok: true as const, value: r }),
      (e: unknown) => ({ ok: false as const, error: e })
    ),
    callAgentWithRetry(opts.client, opts.model, ADVOCATE_SYSTEM_PROMPT, userMsg).then(
      (r) => ({ ok: true as const, value: r }),
      (e: unknown) => ({ ok: false as const, error: e })
    ),
    factCheckPromise
  ]);

  if (!skepticSettled.ok) {
    return { ok: false, error: { code: 'LLM_UNAVAILABLE', message: 'AI service unavailable during skeptic phase.', retryable: true }, usage: totalUsage };
  }
  const skepticResult = skepticSettled.value;
  addUsage(skepticResult.usage);
  if (!skepticResult.report) {
    return { ok: false, error: { code: 'LLM_MALFORMED', message: 'Skeptic agent returned invalid output.', retryable: true }, usage: totalUsage };
  }

  if (!advocateSettled.ok) {
    return { ok: false, error: { code: 'LLM_UNAVAILABLE', message: 'AI service unavailable during advocate phase.', retryable: true }, usage: totalUsage };
  }
  const advocateResult = advocateSettled.value;
  addUsage(advocateResult.usage);
  if (!advocateResult.report) {
    return { ok: false, error: { code: 'LLM_MALFORMED', message: 'Advocate agent returned invalid output.', retryable: true }, usage: totalUsage };
  }

  const evidence: EvidenceResult | undefined = factCheckOutcome?.evidence;
  const factCheckUsage: FactCheckUsage | undefined = factCheckOutcome?.usage;

  const judgeMsg = buildJudgeUserMessage({
    articleText,
    skeptic: skepticResult.report,
    advocate: advocateResult.report,
    evidence
  });
  let judge: JudgeRuling | null = null;
  try {
    for (let attempt = 1; attempt <= 2; attempt++) {
      const r = await callAgent(opts.client, opts.model, JUDGE_SYSTEM_PROMPT, judgeMsg);
      addUsage(r.usage);
      judge = parseJudge(r.text);
      if (judge) break;
    }
  } catch {
    return { ok: false, error: { code: 'LLM_UNAVAILABLE', message: 'AI service unavailable during judge phase.', retryable: true }, usage: totalUsage };
  }
  if (!judge) {
    return { ok: false, error: { code: 'LLM_MALFORMED', message: 'Judge agent returned invalid output.', retryable: true }, usage: totalUsage };
  }

  return {
    ok: true,
    deepAnalysis: {
      skeptic: skepticResult.report,
      advocate: advocateResult.report,
      judge,
      modelLimitation: MODEL_LIMITATION,
      evidence
    },
    usage: totalUsage,
    evidence,
    factCheckUsage
  };
}
