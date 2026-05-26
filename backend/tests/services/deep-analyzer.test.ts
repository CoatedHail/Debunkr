import { runDeepAnalysis } from '../../src/services/deep-analyzer.js';

function makeMockClient(responses: string[]) {
  let call = 0;
  return {
    messages: {
      create: jest.fn(async () => {
        const text = responses[call] ?? responses[responses.length - 1];
        call += 1;
        return {
          content: [{ type: 'text', text }],
          usage: { input_tokens: 200, output_tokens: 80 }
        };
      })
    }
  };
}

const SKEPTIC_GOOD = JSON.stringify({
  reasoning: 'Only one source is named.',
  evidence: ['The article cites "experts" without naming them.']
});
const ADVOCATE_GOOD = JSON.stringify({
  reasoning: 'Byline is present, byline links to staff page.',
  evidence: ['Author Jane Doe is a beat reporter, named in the byline.']
});
const JUDGE_GOOD = JSON.stringify({
  verdict: 'On balance, mostly credible with named author but thin sourcing.',
  confidence: 'medium'
});

describe('runDeepAnalysis', () => {
  it('returns skeptic + advocate + judge when all 3 calls succeed', async () => {
    const mock = makeMockClient([SKEPTIC_GOOD, ADVOCATE_GOOD, JUDGE_GOOD]);
    const r = await runDeepAnalysis('article body', {
      client: mock as any,
      model: 'claude-haiku-4-5'
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.deepAnalysis.skeptic.reasoning).toContain('one source');
    expect(r.deepAnalysis.advocate.reasoning).toContain('byline');
    expect(r.deepAnalysis.judge.verdict).toContain('mostly credible');
    expect(r.deepAnalysis.judge.confidence).toBe('medium');
    expect(mock.messages.create).toHaveBeenCalledTimes(3);
  });

  it('retries the skeptic agent once on malformed output', async () => {
    const mock = makeMockClient(['not json', SKEPTIC_GOOD, ADVOCATE_GOOD, JUDGE_GOOD]);
    const r = await runDeepAnalysis('article', { client: mock as any, model: 'claude-haiku-4-5' });
    expect(r.ok).toBe(true);
    expect(mock.messages.create).toHaveBeenCalledTimes(4);
  });

  it('returns LLM_MALFORMED when an agent fails twice', async () => {
    const mock = makeMockClient(['nope', 'nope', ADVOCATE_GOOD, JUDGE_GOOD]);
    const r = await runDeepAnalysis('article', { client: mock as any, model: 'claude-haiku-4-5' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe('LLM_MALFORMED');
  });

  it('returns LLM_UNAVAILABLE when client throws', async () => {
    const mock = {
      messages: { create: jest.fn(async () => { throw new Error('upstream'); }) }
    };
    const r = await runDeepAnalysis('article', { client: mock as any, model: 'claude-haiku-4-5' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe('LLM_UNAVAILABLE');
  });

  it('always sets modelLimitation describing single-model debate', async () => {
    const mock = makeMockClient([SKEPTIC_GOOD, ADVOCATE_GOOD, JUDGE_GOOD]);
    const r = await runDeepAnalysis('article', { client: mock as any, model: 'claude-haiku-4-5' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.deepAnalysis.modelLimitation).toContain('same model family');
  });
});
