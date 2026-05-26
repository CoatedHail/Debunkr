import type { CheapSignalsBreakdown } from '../types/api.js';

export interface CheapSignalsInput {
  url: string;
  byline?: string;
  siteName?: string;
  articleText: string;
}

const BASELINE = 30;
const HTTPS_BONUS = 5;
const BYLINE_BONUS = 10;
const SITENAME_BONUS = 5;
const LONG_BONUS = 10;
const LONG_THRESHOLD = 2000;

export function cheapSignals(input: CheapSignalsInput): CheapSignalsBreakdown {
  let url: URL;
  try {
    url = new URL(input.url);
  } catch {
    // Fall back: treat as http
    url = { protocol: 'http:' } as URL;
  }
  const https = url.protocol === 'https:';
  const hasByline = !!(input.byline && input.byline.trim().length > 0);
  const hasSiteName = !!(input.siteName && input.siteName.trim().length > 0);
  const articleLength = input.articleText.length;
  const longEnoughBonus = articleLength >= LONG_THRESHOLD;

  let score = BASELINE;
  if (https) score += HTTPS_BONUS;
  if (hasByline) score += BYLINE_BONUS;
  if (hasSiteName) score += SITENAME_BONUS;
  if (longEnoughBonus) score += LONG_BONUS;

  return { https, hasByline, hasSiteName, articleLength, longEnoughBonus, score };
}
