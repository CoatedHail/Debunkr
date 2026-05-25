import { isValidUrl } from '../../src/services/url-validator.js';

describe('isValidUrl', () => {
  it('accepts a normal https URL', () => {
    expect(isValidUrl('https://example.com/article/1')).toBe(true);
  });

  it('accepts a normal http URL', () => {
    expect(isValidUrl('http://example.com/article/1')).toBe(true);
  });

  it('rejects empty string', () => {
    expect(isValidUrl('')).toBe(false);
  });

  it('rejects non-string input', () => {
    // @ts-expect-error testing runtime behaviour with wrong type
    expect(isValidUrl(null)).toBe(false);
  });

  it('rejects javascript: URLs', () => {
    expect(isValidUrl('javascript:alert(1)')).toBe(false);
  });

  it('rejects file: URLs', () => {
    expect(isValidUrl('file:///etc/passwd')).toBe(false);
  });

  it('rejects URLs without a scheme', () => {
    expect(isValidUrl('example.com/article')).toBe(false);
  });

  it('rejects malformed URLs', () => {
    expect(isValidUrl('http://')).toBe(false);
  });
});
