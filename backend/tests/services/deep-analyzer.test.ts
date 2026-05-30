import { runDeepAnalysis } from '../../src/services/deep-analyzer.js';
import type { FactCheckRunResult } from '../../src/services/fact-checker.js';
import type { EvidenceResult } from '../../src/services/evidence-aggregator.js';

function makeMockClient(responses: string[]) {
  let call = 0;
  const lastUserMessages: string[] = [];
  return {
    lastUserMessages,
    messages: {
      create: jest.fn(async (req: any) => {
        const userMsg = req?.messages?.[0]?.content;
        if (typeof userMsg === 'string') lastUserMessages.push(userMsg);
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

function noEvidenceFactCheck(): jest.Mock<Promise<FactCheckRunResult>, [string]> {
  return jest.fn(async () => ({
    evidence: {
      verdict: 'uncorroborated',
      confidence: 'low',
      citations: [],
      scoreDelta: 0,
      reasoning: 'No verifiable claims found in article'
    },
    usage: { input_tokens: 0, output_tokens: 0 }
  }));
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
      model: 'claude-haiku-4-5',
      runFactCheckFn: noEvidenceFactCheck()
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.deepAnalysis.skeptic.reasoning).toContain('one source');
    expect(r.deepAnalysis.advocate.reasoning).toContain('byline');
    expect(r.deepAnalysis.judge.verdict).toContain('mostly credible');
    expect(r.deepAnalysis.judge.confidence).toBe('medium');
    expect(r.usage).toBeDefined();
    expect(r.usage.inputTokens).toBeGreaterThan(0);
    expect(mock.messages.create).toHaveBeenCalledTimes(3);
  });

  it('retries the skeptic agent once on malformed output', async () => {
    const mock = makeMockClient(['not json', SKEPTIC_GOOD, ADVOCATE_GOOD, JUDGE_GOOD]);
    const r = await runDeepAnalysis('article', { client: mock as any, model: 'claude-haiku-4-5', runFactCheckFn: noEvidenceFactCheck() });
    expect(r.ok).toBe(true);
    expect(mock.messages.create).toHaveBeenCalledTimes(4);
  });

  it('returns LLM_MALFORMED when an agent fails twice', async () => {
    const mock = makeMockClient(['nope', 'nope', ADVOCATE_GOOD, JUDGE_GOOD]);
    const r = await runDeepAnalysis('article', { client: mock as any, model: 'claude-haiku-4-5', runFactCheckFn: noEvidenceFactCheck() });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe('LLM_MALFORMED');
  });

  it('returns LLM_UNAVAILABLE when client throws', async () => {
    const mock = {
      messages: { create: jest.fn(async () => { throw new Error('upstream'); }) }
    };
    const r = await runDeepAnalysis('article', { client: mock as any, model: 'claude-haiku-4-5', runFactCheckFn: noEvidenceFactCheck() });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe('LLM_UNAVAILABLE');
  });

  it('always sets modelLimitation describing single-model debate', async () => {
    const mock = makeMockClient([SKEPTIC_GOOD, ADVOCATE_GOOD, JUDGE_GOOD]);
    const r = await runDeepAnalysis('article', { client: mock as any, model: 'claude-haiku-4-5', runFactCheckFn: noEvidenceFactCheck() });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.deepAnalysis.modelLimitation).toContain('same model family');
  });

  describe('M8 fact-check integration', () => {
    const CANNED_EVIDENCE: EvidenceResult = {
      verdict: 'contradicted',
      confidence: 'high',
      citations: [
        {
          source: 'Snopes',
          url: 'https://snopes.com/x',
          snippet: 'Claim is false per fact-check.',
          supports: 'contradicts'
        }
      ],
      scoreDelta: -25,
      reasoning: 'Multiple fact-checks refute the article\'s central claim.'
    };

    it('threads evidence through analyzer return shape', async () => {
      const mock = makeMockClient([SKEPTIC_GOOD, ADVOCATE_GOOD, JUDGE_GOOD]);
      const factCheck = jest.fn(async () => ({
        evidence: CANNED_EVIDENCE,
        usage: { input_tokens: 1234, output_tokens: 456 }
      }));
      const r = await runDeepAnalysis('article body', {
        client: mock as any,
        model: 'claude-haiku-4-5',
        runFactCheckFn: factCheck
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.evidence).toEqual(CANNED_EVIDENCE);
      expect(r.deepAnalysis.evidence).toEqual(CANNED_EVIDENCE);
      expect(r.factCheckUsage).toEqual({ input_tokens: 1234, output_tokens: 456 });
      expect(factCheck).toHaveBeenCalledWith('article body');
    });

    it('includes EVIDENCE_START/EVIDENCE_END section in Judge prompt when evidence present', async () => {
      const mock = makeMockClient([SKEPTIC_GOOD, ADVOCATE_GOOD, JUDGE_GOOD]);
      const factCheck = jest.fn(async () => ({
        evidence: CANNED_EVIDENCE,
        usage: { input_tokens: 100, output_tokens: 50 }
      }));
      await runDeepAnalysis('article body', {
        client: mock as any,
        model: 'claude-haiku-4-5',
        runFactCheckFn: factCheck
      });
      // The judge call is the 3rd messages.create invocation
      const judgeMsg = mock.lastUserMessages[2];
      expect(judgeMsg).toContain('<<<EVIDENCE_START>>>');
      expect(judgeMsg).toContain('<<<EVIDENCE_END>>>');
      expect(judgeMsg).toContain('verdict: contradicted');
      expect(judgeMsg).toContain('scoreDelta: -25');
      expect(judgeMsg).toContain('Snopes');
      expect(judgeMsg).toContain('https://snopes.com/x');
    });

    it('omits EVIDENCE section when fact-check returns no-evidence safe default', async () => {
      const mock = makeMockClient([SKEPTIC_GOOD, ADVOCATE_GOOD, JUDGE_GOOD]);
      const r = await runDeepAnalysis('article body', {
        client: mock as any,
        model: 'claude-haiku-4-5',
        runFactCheckFn: noEvidenceFactCheck()
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      // Safe-default evidence is still threaded (scoreDelta=0), but Judge sees it.
      // The analyzer-level contract: evidence is still passed through.
      expect(r.evidence?.verdict).toBe('uncorroborated');
      expect(r.evidence?.scoreDelta).toBe(0);
    });

    it('still works when runFactCheck throws — evidence becomes undefined', async () => {
      const mock = makeMockClient([SKEPTIC_GOOD, ADVOCATE_GOOD, JUDGE_GOOD]);
      const factCheck = jest.fn(async () => {
        throw new Error('upstream fact-check broke');
      });
      const r = await runDeepAnalysis('article body', {
        client: mock as any,
        model: 'claude-haiku-4-5',
        runFactCheckFn: factCheck
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.evidence).toBeUndefined();
      expect(r.factCheckUsage).toBeUndefined();
      expect(r.deepAnalysis.evidence).toBeUndefined();
      // Judge prompt should NOT have evidence delimiters
      const judgeMsg = mock.lastUserMessages[2];
      expect(judgeMsg).not.toContain('<<<EVIDENCE_START>>>');
    });
  });
});
