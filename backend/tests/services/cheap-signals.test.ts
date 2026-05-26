import { cheapSignals } from '../../src/services/cheap-signals.js';

describe('cheapSignals', () => {
  it('baseline 30 for HTTP article with no metadata', () => {
    const r = cheapSignals({
      url: 'http://example.com/a',
      byline: undefined,
      siteName: undefined,
      articleText: 'short text'
    });
    expect(r.score).toBe(30);
    expect(r.https).toBe(false);
    expect(r.hasByline).toBe(false);
  });

  it('adds +5 for HTTPS', () => {
    const r = cheapSignals({
      url: 'https://example.com/a',
      byline: undefined,
      siteName: undefined,
      articleText: 'short'
    });
    expect(r.score).toBe(35);
    expect(r.https).toBe(true);
  });

  it('adds +10 for byline', () => {
    const r = cheapSignals({
      url: 'http://example.com/a',
      byline: 'Jane Doe',
      siteName: undefined,
      articleText: 'short'
    });
    expect(r.score).toBe(40);
    expect(r.hasByline).toBe(true);
  });

  it('adds +5 for siteName', () => {
    const r = cheapSignals({
      url: 'http://example.com/a',
      byline: undefined,
      siteName: 'Example News',
      articleText: 'short'
    });
    expect(r.score).toBe(35);
    expect(r.hasSiteName).toBe(true);
  });

  it('adds +10 for article > 2000 chars', () => {
    const r = cheapSignals({
      url: 'http://example.com/a',
      byline: undefined,
      siteName: undefined,
      articleText: 'x'.repeat(2500)
    });
    expect(r.score).toBe(40);
    expect(r.longEnoughBonus).toBe(true);
  });

  it('all signals present → 60', () => {
    const r = cheapSignals({
      url: 'https://example.com/a',
      byline: 'Jane Doe',
      siteName: 'Example News',
      articleText: 'x'.repeat(3000)
    });
    expect(r.score).toBe(60);
  });
});
