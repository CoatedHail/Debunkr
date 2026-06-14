// Shared API types — kept in sync (by hand) with mobile/src/types/api.ts.
// When you change a type here, update the mobile copy in the same commit.

import type { EvidenceResult } from '../services/evidence-aggregator.js';
export type { EvidenceResult } from '../services/evidence-aggregator.js';

export type ErrorCode =
  | 'URL_INVALID'
  | 'URL_BLOCKED'
  | 'EXTRACTION_FAILED'
  | 'LLM_UNAVAILABLE'
  | 'LLM_MALFORMED'
  | 'RATE_LIMITED'
  | 'BUDGET_EXCEEDED'
  | 'UNSUPPORTED_CONTENT_TYPE'
  | 'INTERNAL_ERROR'
  | 'JOB_NOT_COMPLETE';

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
  /** First ~280 chars of the article body, whitespace-normalized, trimmed at last full word, "…" appended if truncated. */
  excerpt?: string;
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
  | 'highly-credible'
  | 'mostly-credible'
  | 'mixed'
  | 'questionable'
  | 'low';

export type Confidence = 'high' | 'medium' | 'low';

export interface BiasEstimate {
  scale: number;
  source: 'llm' | 'allsides';
}

export interface CheapSignalsBreakdown {
  https: boolean;
  hasByline: boolean;
  hasSiteName: boolean;
  articleLength: number;
  longEnoughBonus: boolean;
  score: number;
}

// Deep Analysis (M5) — opt-in multi-agent debate
export type DeepStatus = 'idle' | 'pending' | 'complete' | 'failed';

export interface AgentReport {
  /** 1-3 short sentences, plain English */
  reasoning: string;
  /** 0-3 specific evidence bullets pulled from the article */
  evidence: string[];
}

export interface JudgeRuling {
  /** 1-3 sentence verdict */
  verdict: string;
  /** Adjusted confidence (post-debate): high/medium/low */
  confidence: Confidence;
}

export interface DeepAnalysis {
  skeptic: AgentReport;
  advocate: AgentReport;
  judge: JudgeRuling;
  /** UI shows this verbatim under the deep-analysis section. */
  modelLimitation: string;
  /** M8: external-evidence fact-check result, when available. */
  evidence?: EvidenceResult;
}

export interface JobResult {
  jobId: string;
  status: JobStatus;
  article?: ArticleMetadata;
  publisher?: PublisherLookup;

  overall?: number;
  bucket?: OverallBucket;
  confidence?: Confidence;

  sourceRep?: number;
  sourceRepFrom?: 'curated-wikipedia' | 'cheap-signals';
  cheapSignals?: CheapSignalsBreakdown;
  contentQuality?: number;
  contentReasoning?: string;
  bias?: BiasEstimate;
  counterArgument?: string;

  // Deep Analysis (M5)
  deepStatus?: DeepStatus;
  deepAnalysis?: DeepAnalysis;
  deepError?: ApiError['error'];

  error?: ApiError['error'];
}
