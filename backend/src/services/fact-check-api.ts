import { getGoogleFactCheckApiKey } from '../config/env.js';

export type NormalizedRating =
  | 'true'
  | 'mostly-true'
  | 'mixed'
  | 'mostly-false'
  | 'false'
  | 'unknown';

export type FactCheckResult = {
  claimText: string;
  reviewerName: string;
  rating: string;
  normalizedRating: NormalizedRating;
  reviewUrl: string;
  datePublished?: string;
};

export class FactCheckAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FactCheckAuthError';
  }
}

export type SearchFactChecksOptions = {
  fetchFn?: typeof fetch;
  apiKey?: string;
  timeoutMs?: number;
};

const ENDPOINT = 'https://factchecktools.googleapis.com/v1alpha1/claims:search';
const DEFAULT_TIMEOUT_MS = 5000;

const RATING_MAP: Record<string, NormalizedRating> = {
  // true
  'true': 'true',
  'correct': 'true',
  'correct attribution': 'true',
  'accurate': 'true',
  // mostly-true
  'mostly true': 'mostly-true',
  'mostly accurate': 'mostly-true',
  'mostly correct': 'mostly-true',
  // mixed
  'mixed': 'mixed',
  'half true': 'mixed',
  'partly true': 'mixed',
  'partly false': 'mixed',
  'misleading': 'mixed',
  'half false': 'mixed',
  // mostly-false
  'mostly false': 'mostly-false',
  'mostly inaccurate': 'mostly-false',
  // false
  'false': 'false',
  'pants on fire': 'false',
  'four pinocchios': 'false',
  'inaccurate': 'false',
  'fabricated': 'false'
};

export function normalizeRating(raw: string): NormalizedRating {
  if (typeof raw !== 'string') return 'unknown';
  // Lowercase, trim, strip trailing punctuation like "!" or "."
  const key = raw.trim().toLowerCase().replace(/[!.?]+$/, '').trim();
  return RATING_MAP[key] ?? 'unknown';
}

type RawClaimReview = {
  publisher?: { name?: string };
  url?: string;
  textualRating?: string;
  reviewDate?: string;
};

type RawClaim = {
  text?: string;
  claimReview?: RawClaimReview[];
};

type RawResponse = {
  claims?: RawClaim[];
};

function mapClaim(claim: RawClaim): FactCheckResult {
  const review = (claim.claimReview && claim.claimReview[0]) || {};
  const rating = typeof review.textualRating === 'string' ? review.textualRating : '';
  const result: FactCheckResult = {
    claimText: typeof claim.text === 'string' ? claim.text : '',
    reviewerName:
      review.publisher && typeof review.publisher.name === 'string'
        ? review.publisher.name
        : 'Unknown',
    rating,
    normalizedRating: normalizeRating(rating),
    reviewUrl: typeof review.url === 'string' ? review.url : ''
  };
  if (typeof review.reviewDate === 'string' && review.reviewDate.length > 0) {
    result.datePublished = review.reviewDate;
  }
  return result;
}

export async function searchFactChecks(
  query: string,
  options: SearchFactChecksOptions = {}
): Promise<FactCheckResult[]> {
  const apiKey = options.apiKey ?? getGoogleFactCheckApiKey();
  if (!apiKey) {
    return [];
  }

  const fetchFn = options.fetchFn ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const url =
    `${ENDPOINT}?query=${encodeURIComponent(query)}` +
    `&languageCode=en&pageSize=5&key=${encodeURIComponent(apiKey)}`;

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetchFn(url, { signal: controller.signal });
  } catch {
    // Includes AbortError (timeout) and other network/fetch errors.
    clearTimeout(timeoutHandle);
    return [];
  }
  clearTimeout(timeoutHandle);

  if (response.status === 401 || response.status === 403) {
    throw new FactCheckAuthError(
      `Google Fact Check API auth failed (status ${response.status})`
    );
  }
  if (response.status === 404) {
    return [];
  }
  if (response.status >= 500 && response.status < 600) {
    return [];
  }
  if (response.status !== 200) {
    return [];
  }

  let data: RawResponse;
  try {
    data = (await response.json()) as RawResponse;
  } catch {
    return [];
  }

  if (!data || !Array.isArray(data.claims) || data.claims.length === 0) {
    return [];
  }

  return data.claims.map(mapClaim);
}
