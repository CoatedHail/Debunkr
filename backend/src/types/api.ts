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

export type OverallBucket =
  | 'highly-credible' // 80-100
  | 'mostly-credible' // 60-79
  | 'mixed'           // 40-59
  | 'questionable'    // 20-39
  | 'low';            // 0-19

export type Confidence = 'high' | 'medium' | 'low';

// -5 (far left) ... 0 (center) ... +5 (far right)
// `source` records where the estimate came from. 'llm' implies low confidence.
export interface BiasEstimate {
  scale: number;
  source: 'llm' | 'allsides';
}

export interface CheapSignalsBreakdown {
  https: boolean;
  hasByline: boolean;
  hasSiteName: boolean;
  articleLength: number;          // characters
  longEnoughBonus: boolean;       // > 2000 chars
  score: number;                  // 30-60
}

// Fields populate as work progresses:
//   pending  → only jobId, status
//   partial  → + article metadata + publisher lookup
//   complete → + overall + bucket + confidence + sourceRep + contentQuality + bias + counterArgument
//   failed   → + error (publisher may still be present)
export interface JobResult {
  jobId: string;
  status: JobStatus;
  article?: ArticleMetadata;
  publisher?: PublisherLookup;

  // Combined output (M4)
  overall?: number;               // 0-100
  bucket?: OverallBucket;
  confidence?: Confidence;

  // Sub-scores (M4)
  sourceRep?: number;             // 0-100 — from publisher tier OR cheap signals
  sourceRepFrom?: 'curated-wikipedia' | 'cheap-signals';
  cheapSignals?: CheapSignalsBreakdown;  // present when sourceRepFrom='cheap-signals'
  contentQuality?: number;        // 0-100 — from LLM
  contentReasoning?: string;
  bias?: BiasEstimate;
  counterArgument?: string;

  error?: ApiError['error'];
}
