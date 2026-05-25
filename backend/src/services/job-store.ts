import { randomUUID } from 'node:crypto';
import type { JobResult } from '../types/api.js';

export interface CreateJobInput {
  url: string;
}

export interface JobStore {
  create(input: CreateJobInput): JobResult;
  get(jobId: string): JobResult | undefined;
  update(jobId: string, fields: Partial<Omit<JobResult, 'jobId'>>): void;
}

export function createJobStore(): JobStore {
  const jobs = new Map<string, JobResult>();

  return {
    create({ url }) {
      void url; // not persisted in M2 store, callers log it themselves
      const jobId = randomUUID();
      const job: JobResult = { jobId, status: 'pending' };
      jobs.set(jobId, job);
      return job;
    },

    get(jobId) {
      return jobs.get(jobId);
    },

    update(jobId, fields) {
      const existing = jobs.get(jobId);
      if (!existing) return;
      jobs.set(jobId, { ...existing, ...fields });
    }
  };
}
