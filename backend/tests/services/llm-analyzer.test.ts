import { analyzeContent } from '../../src/services/llm-analyzer.js';

function makeMockClient(scriptedResponses: string[]) {
  let call = 0;
  return {
    messages: {
      create: jest.fn(async () => {
        const text = scriptedResponses[call] ?? scriptedResponses[scriptedResponses.length - 1];
        call += 1;
        return {
          content: [{ type: 'text', text }],
          usage: { input_tokens: 100, output_tokens: 50 }
        };
      })
    }
  };
}

const GOOD = JSON.stringify({
  contentQuality: 72,
  contentReasoning: 'Cites primary sources; measured tone.',
  biasScale: -1,
  counterArgument: 'The two cited sources both come from the same political camp.'
});

describe('analyzeContent', () => {
  it('returns parsed fields for well-formed JSON output', async () => {
    const mock = makeMockClient([GOOD]);
    const r = await analyzeContent('text', { client: mock as any, model: 'claude-haiku-4-5' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.contentQuality).toBe(72);
    expect(r.usage).toBeDefined();
    expect(r.usage.inputTokens).toBeGreaterThanOrEqual(0);
    expect(r.biasScale).toBe(-1);
    expect(r.counterArgument).toContain('political camp');
  });

  it('retries once on malformed JSON, succeeds on second try', async () => {
    const mock = makeMockClient(['not json', GOOD]);
    const r = await analyzeContent('text', { client: mock as any, model: 'claude-haiku-4-5' });
    expect(r.ok).toBe(true);
    expect(mock.messages.create).toHaveBeenCalledTimes(2);
  });

  it('returns LLM_MALFORMED when both attempts fail to parse', async () => {
    const mock = makeMockClient(['not json', 'still nope']);
    const r = await analyzeContent('text', { client: mock as any, model: 'claude-haiku-4-5' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe('LLM_MALFORMED');
  });

  it('returns LLM_MALFORMED when biasScale out of range', async () => {
    const bad = JSON.stringify({
      contentQuality: 70, contentReasoning: 'r', biasScale: 9, counterArgument: 'c'
    });
    const mock = makeMockClient([bad, bad]);
    const r = await analyzeContent('text', { client: mock as any, model: 'claude-haiku-4-5' });
    expect(r.ok).toBe(false);
  });

  it('returns LLM_MALFORMED when counterArgument missing', async () => {
    const bad = JSON.stringify({ contentQuality: 70, contentReasoning: 'r', biasScale: 0 });
    const mock = makeMockClient([bad, bad]);
    const r = await analyzeContent('text', { client: mock as any, model: 'claude-haiku-4-5' });
    expect(r.ok).toBe(false);
  });

  it('returns LLM_UNAVAILABLE when client throws', async () => {
    const mock = {
      messages: { create: jest.fn(async () => { throw new Error('upstream'); }) }
    };
    const r = await analyzeContent('text', { client: mock as any, model: 'claude-haiku-4-5' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe('LLM_UNAVAILABLE');
  });
});
