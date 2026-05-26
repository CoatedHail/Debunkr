import { mkdirSync, appendFileSync } from 'node:fs';
import path from 'node:path';

export interface FeedbackInput {
  jobId: string;
  deviceId: string;
  vote: 'up' | 'down';
  comment?: string;
}

export interface FeedbackStore {
  record(input: FeedbackInput): Promise<void>;
}

export interface FeedbackStoreOptions {
  dataDir: string;
}

interface FeedbackEvent {
  ts: string;
  jobId: string;
  deviceId: string;
  vote: 'up' | 'down';
  comment?: string;
}

export function createFeedbackStore(opts: FeedbackStoreOptions): FeedbackStore {
  mkdirSync(opts.dataDir, { recursive: true });
  const logPath = path.join(opts.dataDir, 'feedback-events.jsonl');

  return {
    async record({ jobId, deviceId, vote, comment }) {
      const event: FeedbackEvent = {
        ts: new Date().toISOString(),
        jobId, deviceId, vote,
        ...(comment ? { comment } : {})
      };
      appendFileSync(logPath, JSON.stringify(event) + '\n');
    }
  };
}
