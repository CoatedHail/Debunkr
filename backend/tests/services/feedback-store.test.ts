import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createFeedbackStore } from '../../src/services/feedback-store.js';

describe('FeedbackStore', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(path.join(tmpdir(), 'feedback-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('appends an up vote with no comment', async () => {
    const store = createFeedbackStore({ dataDir: dir });
    await store.record({ jobId: 'j1', deviceId: 'd1', vote: 'up' });
    const lines = readFileSync(path.join(dir, 'feedback-events.jsonl'), 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]);
    expect(entry.vote).toBe('up');
    expect(entry.jobId).toBe('j1');
  });

  it('appends a down vote with comment', async () => {
    const store = createFeedbackStore({ dataDir: dir });
    await store.record({ jobId: 'j2', deviceId: 'd1', vote: 'down', comment: 'too lenient' });
    const lines = readFileSync(path.join(dir, 'feedback-events.jsonl'), 'utf-8').trim().split('\n');
    expect(JSON.parse(lines[0]).comment).toBe('too lenient');
  });

  it('appends multiple entries on one line each', async () => {
    const store = createFeedbackStore({ dataDir: dir });
    await store.record({ jobId: 'a', deviceId: 'd1', vote: 'up' });
    await store.record({ jobId: 'b', deviceId: 'd1', vote: 'down' });
    const lines = readFileSync(path.join(dir, 'feedback-events.jsonl'), 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(2);
  });
});
