import { researchPublisher } from '../../src/services/publisher-research.js';

function makeMockClient(textOrTexts: string | string[], opts?: { throws?: boolean }) {
  const texts = Array.isArray(textOrTexts) ? textOrTexts : [textOrTexts];
  let call = 0;
  return {
    messages: {
      create: jest.fn(async () => {
        if (opts?.throws) throw new Error('upstream boom');
        const text = texts[call] ?? texts[texts.length - 1];
        call += 1;
        return {
          content: [{ type: 'text', text }],
          usage: { input_tokens: 1234, output_tokens: 56 }
        };
      })
    }
  };
}

const GOOD = JSON.stringify({
  summary: 'Generally regarded as a niche-but-credible local news outlet. Independent ownership and a small editorial staff; no major fact-check controversies on record.',
  sentiment: 'positive',
  citations: [
    { url: 'https://example.org/about-pub', title: 'About the publisher' },
    { url: 'https://factcheck.example/profile', title: 'Profile on FactCheck.example' }
  ]
});

describe('researchPublisher', () => {
  it('returns parsed fields for well-formed JSON output', async () => {
    const mock = makeMockClient(GOOD);
    const r = await researchPublisher('local-paper.example', {
      client: mock as any,
      model: 'claude-haiku-4-5'
    });
    expect(r.summary).toContain('niche-but-credible');
    expect(r.sentiment).toBe('positive');
    expect(r.citations).toHaveLength(2);
    expect(r.citations[0].url).toBe('https://example.org/about-pub');
    expect(r.usage).toEqual({ input_tokens: 1234, output_tokens: 56 });
    expect(mock.messages.create).toHaveBeenCalledTimes(1);
  });

  it('returns safe default when SDK throws', async () => {
    const mock = makeMockClient('whatever', { throws: true });
    const r = await researchPublisher('weird.example', {
      client: mock as any,
      model: 'claude-haiku-4-5'
    });
    expect(r.summary).toBe('Publisher research unavailable.');
    expect(r.sentiment).toBe('unclear');
    expect(r.citations).toEqual([]);
    expect(r.usage).toBeUndefined();
  });

  it('returns safe default when no client provided (web_search unavailable)', async () => {
    const r = await researchPublisher('weird.example');
    expect(r.summary).toBe('Publisher research unavailable.');
    expect(r.sentiment).toBe('unclear');
    expect(r.citations).toEqual([]);
  });

  it('returns safe default when model output is not parseable JSON', async () => {
    const mock = makeMockClient('I could not find anything useful, sorry.');
    const r = await researchPublisher('weird.example', {
      client: mock as any
    });
    expect(r.summary).toBe('Publisher research unavailable.');
    expect(r.sentiment).toBe('unclear');
    expect(r.citations).toEqual([]);
  });

  it('truncates a summary longer than 280 chars and appends an ellipsis', async () => {
    const longSummary = 'A '.repeat(200) + 'end-of-summary-marker';
    const payload = JSON.stringify({
      summary: longSummary,
      sentiment: 'mixed',
      citations: []
    });
    const mock = makeMockClient(payload);
    const r = await researchPublisher('long.example', { client: mock as any });
    expect(r.summary.length).toBeLessThanOrEqual(281); // 280 + the appended "…"
    expect(r.summary.endsWith('…')).toBe(true);
    expect(r.summary).not.toContain('end-of-summary-marker');
  });

  it('caps citations to 3 even when the model returns more', async () => {
    const payload = JSON.stringify({
      summary: 'fine',
      sentiment: 'mixed',
      citations: [
        { url: 'https://a.example', title: 'A' },
        { url: 'https://b.example', title: 'B' },
        { url: 'https://c.example', title: 'C' },
        { url: 'https://d.example', title: 'D' },
        { url: 'https://e.example', title: 'E' }
      ]
    });
    const mock = makeMockClient(payload);
    const r = await researchPublisher('many.example', { client: mock as any });
    expect(r.citations).toHaveLength(3);
    expect(r.citations.map((c) => c.title)).toEqual(['A', 'B', 'C']);
  });

  it('drops citations with empty titles or non-http URLs', async () => {
    const payload = JSON.stringify({
      summary: 'fine',
      sentiment: 'mixed',
      citations: [
        { url: 'https://good.example', title: 'Good' },
        { url: 'https://no-title.example', title: '' },
        { url: 'javascript:alert(1)', title: 'Evil' },
        { url: 'https://also-good.example', title: 'Also good' }
      ]
    });
    const mock = makeMockClient(payload);
    const r = await researchPublisher('drop.example', { client: mock as any });
    expect(r.citations).toHaveLength(2);
    expect(r.citations.map((c) => c.title)).toEqual(['Good', 'Also good']);
  });

  it('coerces invalid sentiment to "unclear"', async () => {
    const payload = JSON.stringify({
      summary: 'fine',
      sentiment: 'spicy',
      citations: []
    });
    const mock = makeMockClient(payload);
    const r = await researchPublisher('odd.example', { client: mock as any });
    expect(r.sentiment).toBe('unclear');
  });

  it('handles prose-wrapped JSON by extracting the first {...} block', async () => {
    const payload = `Here is what I found about the publisher:\n\n${GOOD}\n\nLet me know if you want more.`;
    const mock = makeMockClient(payload);
    const r = await researchPublisher('verbose.example', { client: mock as any });
    expect(r.summary).toContain('niche-but-credible');
    expect(r.citations).toHaveLength(2);
  });

  it('strips ```json code fences before parsing', async () => {
    const payload = '```json\n' + GOOD + '\n```';
    const mock = makeMockClient(payload);
    const r = await researchPublisher('fenced.example', { client: mock as any });
    expect(r.citations).toHaveLength(2);
  });

  it('returns safe default for empty domain', async () => {
    const mock = makeMockClient(GOOD);
    const r = await researchPublisher('', { client: mock as any });
    expect(r.summary).toBe('Publisher research unavailable.');
    expect(mock.messages.create).not.toHaveBeenCalled();
  });
});
