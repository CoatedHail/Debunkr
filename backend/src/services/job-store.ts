import { randomUUID } from 'node:crypto';
import type { JobResult } from '../types/api.js';

export interface CreateJobInput {
  url: string;
}

export interface JobStore {
  create(input: CreateJobInput): JobResult;
  get(jobId: string): JobResult | undefined;
  complete(jobId: string, fields: { echo?: string }): void;
}

export function createJobStore(): JobStore {
  const jobs = new Map<string, JobResult>();

  return {
    create({ url }) {
      void url; // M1: url not persisted beyond echo, used for logging in callers
      const jobId = randomUUID();
      const job: JobResult = { jobId, status: 'pending' };
      jobs.set(jobId, job);
      return job;
    },

    get(jobId) {
      return jobs.get(jobId);
    },

    complete(jobId, fields) {
      const existing = jobs.get(jobId);
      if (!existing) return;
      jobs.set(jobId, {
        ...existing,
        status: 'complete',
        ...fields
      });
    }
  };
}
