import Anthropic from '@anthropic-ai/sdk';

export type ResearchSentiment = 'positive' | 'mixed' | 'negative' | 'unclear';

export interface ResearchCitation {
  url: string;
  title: string;
}

export interface PublisherResearchResult {
  /** 2-3 sentences, plain English, capped at 280 chars. */
  summary: string;
  sentiment: ResearchSentiment;
  /** Up to 3 citations. Empty when none were returned or all were dropped. */
  citations: ResearchCitation[];
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

export interface ResearchPublisherOptions {
  client?: Anthropic;
  model?: string;
}

const SUMMARY_MAX_CHARS = 280;
const MAX_CITATIONS = 3;
const WEB_SEARCH_TOOL_TYPE = 'web_search_20250305';
const WEB_SEARCH_TOOL_NAME = 'web_search';
const DEFAULT_MODEL = 'claude-haiku-4-5';

const SYSTEM_PROMPT = [
  'You are a media researcher.',
  'When the user names a publisher domain, use the web_search tool to find independent reporting',
  'about that publisher\'s editorial reputation, fact-check track record, and any controversies.',
  'Then return ONE JSON object — and nothing else — matching this exact schema:',
  '{',
  '  "summary": string (2-3 sentences, plain English, <= 280 chars, no markdown),',
  '  "sentiment": "positive" | "mixed" | "negative" | "unclear",',
  '  "citations": Array of up to 3 objects { "url": string, "title": string }',
  '}',
  'If you cannot find enough information, set sentiment to "unclear" and citations to [].',
  'Do not wrap the JSON in code fences. Do not include any prose outside the JSON.'
].join(' ');

function buildUserMessage(domain: string): string {
  return [
    `Research the publisher at the domain: ${domain}`,
    '',
    'Look up its editorial reputation, fact-check track record, ownership, and any notable',
    'controversies. Synthesize what reliable, independent sources say.',
    '',
    'Return the JSON object described in the system prompt. Use up to 3 of the most',
    'authoritative citations you actually consulted.'
  ].join('\n');
}

function truncateSummary(s: string): string {
  const normalized = s.replace(/\s+/g, ' ').trim();
  if (normalized.length <= SUMMARY_MAX_CHARS) return normalized;
  const slice = normalized.slice(0, SUMMARY_MAX_CHARS);
  const lastSpace = slice.lastIndexOf(' ');
  const wordTrimmed = lastSpace > 0 ? slice.slice(0, lastSpace) : slice;
  return wordTrimmed.replace(/[\s.,;:!?-]+$/, '') + '…';
}

function isHttpUrl(u: string): boolean {
  try {
    const parsed = new URL(u);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function sanitizeCitations(raw: unknown): ResearchCitation[] {
  if (!Array.isArray(raw)) return [];
  const out: ResearchCitation[] = [];
  for (const item of raw) {
    if (out.length >= MAX_CITATIONS) break;
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const url = typeof o.url === 'string' ? o.url.trim() : '';
    const title = typeof o.title === 'string' ? o.title.trim() : '';
    if (!url || !title) continue;          // drop if title is empty (or url missing)
    if (!isHttpUrl(url)) continue;
    out.push({ url, title });
  }
  return out;
}

function sanitizeSentiment(raw: unknown): ResearchSentiment {
  if (raw === 'positive' || raw === 'mixed' || raw === 'negative' || raw === 'unclear') {
    return raw;
  }
  return 'unclear';
}

function safeDefault(): PublisherResearchResult {
  return {
    summary: 'Publisher research unavailable.',
    sentiment: 'unclear',
    citations: []
  };
}

function extractTextFromResponse(response: any): string {
  if (!response || !Array.isArray(response.content)) return '';
  // Prefer the last text block — when web_search is used, the model emits
  // tool_use / web_search_tool_result blocks first and the final text last.
  for (let i = response.content.length - 1; i >= 0; i--) {
    const block = response.content[i];
    if (block && block.type === 'text' && typeof block.text === 'string') {
      return block.text;
    }
  }
  return '';
}

function parseModelJson(text: string): { summary: string; sentiment: ResearchSentiment; citations: ResearchCitation[] } | null {
  if (!text) return null;
  // Strip any code fences the model might emit despite instructions.
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  // If the model added prose before/after, try to grab the first {...} block.
  let candidate = cleaned;
  if (!candidate.startsWith('{')) {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return null;
    candidate = candidate.slice(start, end + 1);
  }
  let obj: unknown;
  try { obj = JSON.parse(candidate); } catch { return null; }
  if (!obj || typeof obj !== 'object') return null;
  const o = obj as Record<string, unknown>;
  if (typeof o.summary !== 'string' || o.summary.trim().length === 0) return null;
  return {
    summary: truncateSummary(o.summary),
    sentiment: sanitizeSentiment(o.sentiment),
    citations: sanitizeCitations(o.citations)
  };
}

/**
 * Ask Claude (with the web_search server tool enabled) to research a
 * publisher's reputation. Returns a safe default on any failure — never throws.
 */
export async function researchPublisher(
  domain: string,
  options?: ResearchPublisherOptions
): Promise<PublisherResearchResult> {
  if (!domain || typeof domain !== 'string') return safeDefault();
  if (!options?.client) return safeDefault();

  const client = options.client;
  const model = options.model ?? DEFAULT_MODEL;

  let response: any;
  try {
    response = await client.messages.create({
      model,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: [
        {
          type: WEB_SEARCH_TOOL_TYPE,
          name: WEB_SEARCH_TOOL_NAME,
          max_uses: 3
        } as any
      ],
      messages: [{ role: 'user', content: buildUserMessage(domain) }]
    } as any);
  } catch {
    return safeDefault();
  }

  const text = extractTextFromResponse(response);
  const parsed = parseModelJson(text);
  if (!parsed) return safeDefault();

  const usage = response?.usage
    ? {
        input_tokens: typeof response.usage.input_tokens === 'number' ? response.usage.input_tokens : 0,
        output_tokens: typeof response.usage.output_tokens === 'number' ? response.usage.output_tokens : 0
      }
    : undefined;

  const result: PublisherResearchResult = {
    summary: parsed.summary,
    sentiment: parsed.sentiment,
    citations: parsed.citations.slice(0, MAX_CITATIONS)
  };
  if (usage) result.usage = usage;
  return result;
}
