// Hand-mirrored from backend/src/types/api.ts.
// When you change one, change the other in the SAME commit.

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

export interface DatasetVerdict {
  source: 'curated-wikipedia' | 'ifcn';
  verdict: string;
  details?: string;
  link?: string;
}

export interface PublisherLookup {
  canonicalDomain: string | null;
  reliabilityTier: ReliabilityTier;
  verdicts: DatasetVerdict[];
}

export interface JobResult {
  jobId: string;
  status: JobStatus;
  article?: ArticleMetadata;
  publisher?: PublisherLookup;
  contentQuality?: number;
  contentReasoning?: string;
  error?: ApiError['error'];
}
