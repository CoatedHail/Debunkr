import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env.js';
import {
  SYSTEM_PROMPT,
  buildUserMessage,
  type Claim,
  type ClaimType
} from '../prompts/claim-extraction.js';

export class ClaimExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClaimExtractionError';
  }
}

export interface ExtractClaimsUsage {
  input_tokens: number;
  output_tokens: number;
}

export interface ExtractClaimsResult {
  claims: Claim[];
  usage: ExtractClaimsUsage;
}

export interface ExtractClaimsOptions {
  client?: Anthropic;
  model?: string;
}

const VALID_TYPES: ReadonlySet<ClaimType> = new Set([
  'event',
  'attribution',
  'statistic',
  'entity'
]);

function parseClaims(text: string): Claim[] {
  const cleaned = text.trim().replace(/^```(?:json)?\s*|```\s*$/g, '');
  let obj: unknown;
  try {
    obj = JSON.parse(cleaned);
  } catch {
    throw new ClaimExtractionError('LLM response was not valid JSON');
  }
  if (typeof obj !== 'object' || obj === null) {
    throw new ClaimExtractionError('LLM response was not a JSON object');
  }
  const root = obj as Record<string, unknown>;
  if (!('claims' in root) || !Array.isArray(root.claims)) {
    throw new ClaimExtractionError('LLM response missing "claims" array');
  }
  const out: Claim[] = [];
  for (const raw of root.claims) {
    if (typeof raw !== 'object' || raw === null) {
      throw new ClaimExtractionError('Claim entry was not an object');
    }
    const c = raw as Record<string, unknown>;
    const text = c.text;
    const type = c.type;
    const namedEntities = c.namedEntities;
    const checkable = c.checkable;
    if (typeof text !== 'string' || text.length === 0 || text.length > 200) {
      throw new ClaimExtractionError('Claim "text" missing or invalid');
    }
    if (typeof type !== 'string' || !VALID_TYPES.has(type as ClaimType)) {
      throw new ClaimExtractionError('Claim "type" missing or invalid');
    }
    if (!Array.isArray(namedEntities) || namedEntities.some((e) => typeof e !== 'string')) {
      throw new ClaimExtractionError('Claim "namedEntities" missing or invalid');
    }
    if (typeof checkable !== 'boolean') {
      throw new ClaimExtractionError('Claim "checkable" missing or invalid');
    }
    out.push({
      text,
      type: type as ClaimType,
      namedEntities: (namedEntities as string[]).slice(0, 5),
      checkable
    });
  }
  return out.slice(0, 3);
}

export async function extractClaims(
  articleText: string,
  opts: ExtractClaimsOptions = {}
): Promise<ExtractClaimsResult> {
  const client =
    opts.client ?? new Anthropic({ apiKey: env.anthropicApiKey });
  const model = opts.model ?? env.anthropicModel;
  const userMessage = buildUserMessage(articleText);

  const response = await client.messages.create({
    model,
    max_tokens: 1024,
    temperature: 0,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }]
  });

  const block = response.content.find((b: { type: string }) => b.type === 'text');
  const text = block && block.type === 'text' ? (block as { text: string }).text : '';

  const parsed = parseClaims(text);
  const filtered = parsed.filter((c) => c.checkable);

  return {
    claims: filtered,
    usage: {
      input_tokens: response.usage?.input_tokens ?? 0,
      output_tokens: response.usage?.output_tokens ?? 0
    }
  };
}
