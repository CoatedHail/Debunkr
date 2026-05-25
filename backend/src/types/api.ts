// Shared API types — kept in sync (by hand) with mobile/src/types/api.ts.
// When you change a type here, update the mobile copy in the same commit.

export type ErrorCode =
  | 'URL_INVALID'
  | 'URL_BLOCKED'
  | 'EXTRACTION_FAILED'
  | 'LLM_UNAVAILABLE'
  | 'LLM_MALFORMED'
  | 'RATE_LIMITED'
  | 'BUDGET_EXCEEDED'
  | 'UNSUPPORTED_CONTENT_TYPE'
  | 'INTERNAL_ERROR';

export interface ApiError {
  error: {
    code: ErrorCode;
    message: string;
    retryable: boolean;
    retryAfter?: number;
  };
}

export interface CheckRequest {
  url: string;
  deviceId: string;
}

export interface CheckResponseAccepted {
  jobId: string;
  status: 'pending';
}

export type JobStatus = 'pending' | 'partial' | 'complete' | 'failed';

export interface ArticleMetadata {
  title?: string;
  byline?: string;
  siteName?: string;
}

export type ReliabilityTier = 'high' | 'medium' | 'mixed' | 'low' | 'unknown';

/**
 * One source's verdict on a publisher. The `source` field is what gets shown
 * to the user verbatim ("AllSides says...", "Wikipedia editors rate..."),
 * per spec §9 "always attributed".
 */
export interface DatasetVerdict {
  source: 'curated-wikipedia' | 'ifcn';
  verdict: string;            // human-readable, displayed verbatim
  details?: string;           // optional second line (e.g., wiki section)
  link?: string;              // optional URL to underlying methodology page
}

export interface PublisherLookup {
  canonicalDomain: string | null;
  reliabilityTier: ReliabilityTier;
  verdicts: DatasetVerdict[];
}

// Fields populate as work progresses:
//   pending  → only jobId, status
//   partial  → + article metadata + publisher lookup
//   complete → + contentQuality, contentReasoning
//   failed   → + error
export interface JobResult {
  jobId: string;
  status: JobStatus;
  article?: ArticleMetadata;
  publisher?: PublisherLookup;
  contentQuality?: number;
  contentReasoning?: string;
  error?: ApiError['error'];
}
