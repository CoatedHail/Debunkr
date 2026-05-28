import { extractClaims, ClaimExtractionError } from '../../src/services/claim-extractor.js';
import { buildUserMessage } from '../../src/prompts/claim-extraction.js';

function makeMockClient(scriptedResponses: string[]) {
  let call = 0;
  return {
    messages: {
      create: jest.fn(async () => {
        const text = scriptedResponses[call] ?? scriptedResponses[scriptedResponses.length - 1];
        call += 1;
        return {
          content: [{ type: 'text', text }],
          usage: { input_tokens: 123, output_tokens: 45 }
        };
      })
    }
  };
}

const GOOD_THREE_CLAIMS = JSON.stringify({
  claims: [
    {
      text: 'The CDC reported 150,000 new flu cases in January 2025.',
      type: 'statistic',
      namedEntities: ['CDC'],
      checkable: true
    },
    {
      text: 'President Smith signed the bill on March 3, 2025.',
      type: 'event',
      namedEntities: ['President Smith'],
      checkable: true
    },
    {
      text: 'Acme Corp announced layoffs of 500 employees.',
      type: 'attribution',
      namedEntities: ['Acme Corp'],
      checkable: true
    }
  ]
});

describe('extractClaims', () => {
  it('returns parsed claims and usage on a well-formed response', async () => {
    const mock = makeMockClient([GOOD_THREE_CLAIMS]);
    const r = await extractClaims('article body', {
      client: mock as any,
      model: 'claude-haiku-4-5'
    });
    expect(r.claims).toHaveLength(3);
    expect(r.claims[0].text).toContain('CDC');
    expect(r.claims[0].type).toBe('statistic');
    expect(r.claims[0].namedEntities).toEqual(['CDC']);
    expect(r.claims[0].checkable).toBe(true);
    expect(r.usage.input_tokens).toBe(123);
    expect(r.usage.output_tokens).toBe(45);
    expect(mock.messages.create).toHaveBeenCalledTimes(1);
  });

  it('filters out claims with checkable: false', async () => {
    const payload = JSON.stringify({
      claims: [
        {
          text: 'Verifiable: CDC reported 150,000 new flu cases.',
          type: 'statistic',
          namedEntities: ['CDC'],
          checkable: true
        },
        {
          text: 'Vague claim that cannot be checked externally.',
          type: 'entity',
          namedEntities: [],
          checkable: false
        }
      ]
    });
    const mock = makeMockClient([payload]);
    const r = await extractClaims('article', { client: mock as any, model: 'm' });
    expect(r.claims).toHaveLength(1);
    expect(r.claims[0].checkable).toBe(true);
  });

  it('throws ClaimExtractionError on malformed JSON', async () => {
    const mock = makeMockClient(['not json at all']);
    await expect(
      extractClaims('article', { client: mock as any, model: 'm' })
    ).rejects.toBeInstanceOf(ClaimExtractionError);
  });

  it('throws ClaimExtractionError when "claims" key is missing', async () => {
    const mock = makeMockClient([JSON.stringify({ foo: 'bar' })]);
    await expect(
      extractClaims('article', { client: mock as any, model: 'm' })
    ).rejects.toBeInstanceOf(ClaimExtractionError);
  });

  it('throws ClaimExtractionError when a claim entry has an invalid type', async () => {
    const payload = JSON.stringify({
      claims: [{ text: 't', type: 'not-a-real-type', namedEntities: [], checkable: true }]
    });
    const mock = makeMockClient([payload]);
    await expect(
      extractClaims('article', { client: mock as any, model: 'm' })
    ).rejects.toBeInstanceOf(ClaimExtractionError);
  });

  it('returns empty claims array when LLM finds nothing checkable', async () => {
    const mock = makeMockClient([JSON.stringify({ claims: [] })]);
    const r = await extractClaims('article', { client: mock as any, model: 'm' });
    expect(r.claims).toEqual([]);
    expect(r.usage.input_tokens).toBe(123);
  });

  it('passes the system prompt and user message to the client', async () => {
    const mock = makeMockClient([GOOD_THREE_CLAIMS]);
    await extractClaims('hello world', { client: mock as any, model: 'claude-haiku-4-5' });
    const call = mock.messages.create.mock.calls[0][0];
    expect(call.model).toBe('claude-haiku-4-5');
    expect(call.max_tokens).toBe(1024);
    expect(call.temperature).toBe(0);
    expect(typeof call.system).toBe('string');
    expect(call.system).toContain('VERIFIABLE FACTUAL CLAIMS');
    expect(call.messages[0].role).toBe('user');
    expect(call.messages[0].content).toContain('<<<ARTICLE_START>>>');
    expect(call.messages[0].content).toContain('hello world');
    expect(call.messages[0].content).toContain('<<<ARTICLE_END>>>');
  });
});

describe('buildUserMessage', () => {
  it('truncates article text over 12,000 chars', () => {
    const huge = 'x'.repeat(20_000);
    const msg = buildUserMessage(huge);
    // The whole envelope is bounded; the inner article portion is capped at 12k
    const inside = msg.split('<<<ARTICLE_START>>>')[1].split('<<<ARTICLE_END>>>')[0];
    // inside includes surrounding newlines from the template
    expect(inside.trim().length).toBe(12_000);
  });

  it('strips control characters from article text', () => {
    const dirty = 'before\x00\x01\x07middle\x1Fafter';
    const msg = buildUserMessage(dirty);
    expect(msg).toContain('beforemiddleafter');
    expect(msg).not.toMatch(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/);
  });

  it('preserves newlines and tabs', () => {
    const msg = buildUserMessage('line1\nline2\tcol2');
    expect(msg).toContain('line1\nline2\tcol2');
  });

  it('wraps article in start/end delimiters', () => {
    const msg = buildUserMessage('some article');
    expect(msg).toContain('<<<ARTICLE_START>>>');
    expect(msg).toContain('<<<ARTICLE_END>>>');
    expect(msg.indexOf('<<<ARTICLE_START>>>')).toBeLessThan(msg.indexOf('<<<ARTICLE_END>>>'));
  });
});
