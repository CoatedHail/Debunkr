import { extractArticle, type ExtractResult } from '../../src/services/article-extractor.js';

type FetchMock = jest.Mock<Promise<Response>, [string | URL, RequestInit?]>;

function makeFetchMock(body: string, init: ResponseInit = {}): FetchMock {
  const fn = jest.fn(async (_url: string | URL, _init?: RequestInit) => {
    return new Response(body, {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
      ...init
    });
  });
  return fn as unknown as FetchMock;
}

const SAMPLE_HTML = `<!doctype html><html><head><title>Sample Article</title>
<meta name="author" content="Jane Doe"></head>
<body><article><h1>Sample Article</h1>
<p>This is the body of the article. It has multiple sentences worth reading,
enough for Readability to consider it actual content.</p>
<p>A second paragraph keeps the heuristic happy.</p></article></body></html>`;

describe('extractArticle', () => {
  it('extracts title and text from a valid HTML article', async () => {
    const fetchMock = makeFetchMock(SAMPLE_HTML);
    const result = await extractArticle('https://example.com/a', { fetchImpl: fetchMock, skipSsrfCheck: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.article.title).toBe('Sample Article');
    expect(result.article.text.length).toBeGreaterThan(20);
  });

  it('returns EXTRACTION_FAILED on non-200 response', async () => {
    const fetchMock = jest.fn(async () => new Response('not found', { status: 404 }));
    const result = await extractArticle('https://example.com/x', { fetchImpl: fetchMock as any, skipSsrfCheck: true });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('EXTRACTION_FAILED');
  });

  it('returns UNSUPPORTED_CONTENT_TYPE for non-HTML Content-Type', async () => {
    const fetchMock = jest.fn(async () => new Response('binary', {
      status: 200,
      headers: { 'content-type': 'image/png' }
    }));
    const result = await extractArticle('https://example.com/img', { fetchImpl: fetchMock as any, skipSsrfCheck: true });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('UNSUPPORTED_CONTENT_TYPE');
  });

  it('returns EXTRACTION_FAILED when fetch throws (network error)', async () => {
    const fetchMock = jest.fn(async () => { throw new TypeError('network failed'); });
    const result = await extractArticle('https://example.com/dead', { fetchImpl: fetchMock as any, skipSsrfCheck: true });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('EXTRACTION_FAILED');
  });

  it('returns EXTRACTION_FAILED when Readability returns null', async () => {
    const trivialHtml = '<html><body><p>too short</p></body></html>';
    const fetchMock = makeFetchMock(trivialHtml);
    const result = await extractArticle('https://example.com/short', { fetchImpl: fetchMock, skipSsrfCheck: true });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('EXTRACTION_FAILED');
  });
});

describe('extractArticle SSRF guard', () => {
  it('returns URL_BLOCKED for localhost without skipSsrfCheck', async () => {
    const result = await extractArticle('http://localhost/admin');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('URL_BLOCKED');
  });

  it('returns URL_BLOCKED for 169.254.169.254 (AWS metadata)', async () => {
    const result = await extractArticle('http://169.254.169.254/latest/meta-data');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('URL_BLOCKED');
  });

  it('returns URL_BLOCKED for RFC1918 IP', async () => {
    const result = await extractArticle('http://10.0.0.1/');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('URL_BLOCKED');
  });
});
