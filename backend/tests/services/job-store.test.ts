import { createJobStore } from '../../src/services/job-store.js';

describe('JobStore', () => {
  it('creates a job and returns a unique jobId', () => {
    const store = createJobStore();
    const job = store.create({ url: 'https://example.com' });
    expect(job.jobId).toMatch(/^[0-9a-f-]{36}$/);
    expect(job.status).toBe('pending');
  });

  it('retrieves a job by id', () => {
    const store = createJobStore();
    const { jobId } = store.create({ url: 'https://example.com' });
    const fetched = store.get(jobId);
    expect(fetched).toBeDefined();
    expect(fetched?.status).toBe('pending');
  });

  it('returns undefined for unknown jobId', () => {
    const store = createJobStore();
    expect(store.get('unknown-id')).toBeUndefined();
  });

  it('completes a job with an echo payload (M1 only)', () => {
    const store = createJobStore();
    const { jobId } = store.create({ url: 'https://example.com/a' });
    store.complete(jobId, { echo: 'https://example.com/a' });
    const result = store.get(jobId);
    expect(result?.status).toBe('complete');
    expect(result?.echo).toBe('https://example.com/a');
  });
});
