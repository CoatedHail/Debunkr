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
          usage: { input_tokens: 100, output_tokens: 30 }
        };
      })
    }
  };
}

describe('analyzeContent', () => {
  it('returns a parsed score for well-formed JSON output', async () => {
    const mock = makeMockClient([
      '{"contentQuality": 72, "contentReasoning": "Cites primary sources; measured tone."}'
    ]);
    const result = await analyzeContent('Some article text.', {
      client: mock as any,
      model: 'claude-haiku-4-5'
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.score).toBe(72);
    expect(result.reasoning).toContain('primary sources');
  });

  it('retries once on malformed JSON, succeeds on second try', async () => {
    const mock = makeMockClient([
      'not json',
      '{"contentQuality": 40, "contentReasoning": "Sensational tone."}'
    ]);
    const result = await analyzeContent('Some article text.', {
      client: mock as any,
      model: 'claude-haiku-4-5'
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.score).toBe(40);
    expect(mock.messages.create).toHaveBeenCalledTimes(2);
  });

  it('returns LLM_MALFORMED when both attempts fail to parse', async () => {
    const mock = makeMockClient(['not json', 'still not json']);
    const result = await analyzeContent('Some text.', {
      client: mock as any,
      model: 'claude-haiku-4-5'
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('LLM_MALFORMED');
  });

  it('returns LLM_MALFORMED when JSON is valid but score is out of range', async () => {
    const mock = makeMockClient(['{"contentQuality": 200, "contentReasoning": "x"}']);
    const result = await analyzeContent('Some text.', {
      client: mock as any,
      model: 'claude-haiku-4-5'
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('LLM_MALFORMED');
  });

  it('returns LLM_UNAVAILABLE when client throws', async () => {
    const mock = {
      messages: {
        create: jest.fn(async () => { throw new Error('upstream timeout'); })
      }
    };
    const result = await analyzeContent('Some text.', {
      client: mock as any,
      model: 'claude-haiku-4-5'
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('LLM_UNAVAILABLE');
  });
});
