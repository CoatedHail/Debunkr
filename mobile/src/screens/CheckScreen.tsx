import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { submitCheck, getJob, startDeep, submitFeedback } from '../api/client';
import { getDeviceId } from '../lib/device-id';
import { EvidenceCard } from '../components/EvidenceCard';
import type {
  AgentReport,
  Confidence,
  DatasetVerdict,
  DeepAnalysis,
  JobResult,
  OverallBucket,
  PublisherLookup,
  ReliabilityTier
} from '../types/api';

type ScreenState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'polling'; jobId: string; job?: JobResult }
  | { kind: 'result'; job: JobResult }
  | { kind: 'error'; message: string };

const POLL_INTERVAL_MS = 1000;
const POLL_MAX_ATTEMPTS = 30;
const DEEP_POLL_MAX_ATTEMPTS = 60; // deep is slower

export interface CheckScreenProps {
  onOpenMethodology: () => void;
  onOpenLimitations: () => void;
}

function overallColor(score: number): string {
  if (score >= 70) return '#15803d';
  if (score >= 40) return '#b45309';
  return '#b91c1c';
}

function bucketLabel(bucket: OverallBucket): string {
  switch (bucket) {
    case 'highly-credible': return 'Highly credible';
    case 'mostly-credible': return 'Mostly credible';
    case 'mixed':           return 'Mixed';
    case 'questionable':    return 'Questionable';
    case 'low':             return 'Low credibility';
  }
}

function confidenceColor(c: Confidence): string {
  switch (c) {
    case 'high':   return '#15803d';
    case 'medium': return '#b45309';
    case 'low':    return '#5f6368';
  }
}

function tierColor(tier: ReliabilityTier): string {
  switch (tier) {
    case 'high':    return '#15803d';
    case 'medium':  return '#b45309';
    case 'mixed':   return '#b45309';
    case 'low':     return '#b91c1c';
    case 'unknown': return '#5f6368';
  }
}

function tierLabel(tier: ReliabilityTier): string {
  switch (tier) {
    case 'high':    return 'Generally reliable';
    case 'medium':  return 'Mixed reputation';
    case 'mixed':   return 'Mixed reputation';
    case 'low':     return 'Generally unreliable';
    case 'unknown': return 'Unknown publisher';
  }
}

function biasLabel(scale: number): string {
  if (scale <= -3) return 'Strong left lean';
  if (scale <= -1) return 'Mild left lean';
  if (scale === 0) return 'Centered / neutral';
  if (scale <= 2)  return 'Mild right lean';
  return 'Strong right lean';
}

function sourceLabel(s: DatasetVerdict['source']): string {
  return s === 'curated-wikipedia' ? 'Wikipedia' : 'IFCN';
}

function AgentCard({ label, color, report, expanded, onToggle }:
  { label: string; color: string; report: AgentReport; expanded: boolean; onToggle: () => void }) {
  return (
    <View style={[styles.agentCard, { borderColor: color }]}>
      <Pressable onPress={onToggle}>
        <View style={styles.inline}>
          <Text style={[styles.agentLabel, { color }]}>{label}</Text>
          <Text style={[styles.agentChevron, { color }]}>{expanded ? '▼' : '▶'}</Text>
        </View>
      </Pressable>
      {expanded && (
        <View style={{ marginTop: 8 }}>
          <Text style={styles.agentReasoning}>{report.reasoning}</Text>
          {report.evidence.length > 0 && (
            <View style={{ marginTop: 6 }}>
              <Text style={styles.agentEvidenceTitle}>Evidence:</Text>
              {report.evidence.map((e, i) => (
                <Text key={i} style={styles.agentEvidence}>• {e}</Text>
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

function DeepAnalysisBlock({ deep }: { deep: DeepAnalysis }) {
  const [skExpanded, setSkExpanded] = useState(false);
  const [adExpanded, setAdExpanded] = useState(false);
  return (
    <View style={styles.deepBox}>
      <Text style={styles.deepHeader}>Deep Analysis</Text>

      <View style={styles.judgeBox}>
        <Text style={styles.judgeLabel}>JUDGE'S VERDICT</Text>
        <Text style={styles.judgeVerdict}>{deep.judge.verdict}</Text>
        <View style={[styles.confidencePill, { borderColor: confidenceColor(deep.judge.confidence), marginTop: 6 }]}>
          <Text style={[styles.confidencePillText, { color: confidenceColor(deep.judge.confidence) }]}>
            {deep.judge.confidence.toUpperCase()} CONFIDENCE
          </Text>
        </View>
      </View>

      {deep.evidence && <EvidenceCard evidence={deep.evidence} />}

      <AgentCard label="SKEPTIC" color="#b91c1c" report={deep.skeptic}
                 expanded={skExpanded} onToggle={() => setSkExpanded(!skExpanded)} />
      <AgentCard label="ADVOCATE" color="#15803d" report={deep.advocate}
                 expanded={adExpanded} onToggle={() => setAdExpanded(!adExpanded)} />

      <Text style={styles.modelLimitation}>{deep.modelLimitation}</Text>
    </View>
  );
}

function FeedbackBlock({ jobId, deviceId }: { jobId: string; deviceId: string | null }) {
  const [vote, setVote] = useState<'up' | 'down' | null>(null);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(finalVote: 'up' | 'down', finalComment?: string) {
    if (!deviceId) return;
    setSubmitting(true);
    setError(null);
    const r = await submitFeedback(jobId, finalVote, deviceId, finalComment);
    setSubmitting(false);
    if (!r.ok) {
      setError(r.error.message);
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <View style={styles.feedbackBox}>
        <Text style={styles.feedbackThanks}>Thanks — your feedback helps improve the system.</Text>
      </View>
    );
  }

  return (
    <View style={styles.feedbackBox}>
      <Text style={styles.feedbackLabel}>Was this rating fair?</Text>
      <View style={styles.feedbackButtons}>
        <Pressable
          accessibilityRole="button"
          disabled={submitting || vote !== null}
          style={({ pressed }) => [
            styles.feedbackButton,
            vote === 'up' && styles.feedbackButtonSelected,
            pressed && styles.buttonPressed
          ]}
          onPress={() => { setVote('up'); send('up'); }}
        >
          <Text style={styles.feedbackButtonText}>👍</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={submitting || vote !== null}
          style={({ pressed }) => [
            styles.feedbackButton,
            vote === 'down' && styles.feedbackButtonSelected,
            pressed && styles.buttonPressed
          ]}
          onPress={() => setVote('down')}
        >
          <Text style={styles.feedbackButtonText}>👎</Text>
        </Pressable>
      </View>

      {vote === 'down' && (
        <View style={{ marginTop: 8 }}>
          <TextInput
            style={styles.feedbackInput}
            placeholder="Why? (optional)"
            value={comment}
            onChangeText={setComment}
            multiline
            maxLength={500}
            editable={!submitting}
          />
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed, submitting && styles.buttonDisabled, { marginTop: 6 }]}
            disabled={submitting}
            onPress={() => send('down', comment.trim() || undefined)}
          >
            <Text style={styles.buttonText}>{submitting ? 'Sending…' : 'Send feedback'}</Text>
          </Pressable>
        </View>
      )}

      {error && (
        <Text style={[styles.errorMessage, { marginTop: 6 }]}>{error}</Text>
      )}
    </View>
  );
}

function HeadlineBlock({ job }: { job: JobResult }) {
  if (job.overall === undefined || !job.bucket || !job.confidence) return null;
  const color = overallColor(job.overall);
  return (
    <View>
      <Text style={styles.label}>Overall credibility</Text>
      <View style={styles.inline}>
        <Text style={[styles.headlineScore, { color }]}>{job.overall}</Text>
        <View style={{ flexShrink: 1 }}>
          <Text style={[styles.headlineLabel, { color }]}>{bucketLabel(job.bucket)}</Text>
          <View style={[styles.confidencePill, { borderColor: confidenceColor(job.confidence) }]}>
            <Text style={[styles.confidencePillText, { color: confidenceColor(job.confidence) }]}>
              {job.confidence.toUpperCase()} CONFIDENCE
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

function BreakdownBlock({ job }: { job: JobResult }) {
  if (job.sourceRep === undefined || job.contentQuality === undefined) return null;
  return (
    <View style={styles.breakdownBox}>
      <Text style={styles.label}>Breakdown</Text>
      <View style={styles.breakdownRow}>
        <Text style={styles.breakdownName}>Publisher reputation</Text>
        <Text style={styles.breakdownScore}>{job.sourceRep}</Text>
      </View>
      <Text style={styles.breakdownSource}>
        {job.sourceRepFrom === 'curated-wikipedia'
          ? 'from curated Wikipedia consensus'
          : 'from article-only signals (publisher unknown)'}
      </Text>
      {job.cheapSignals && (
        <View style={styles.cheapBox}>
          <Text style={styles.cheapTitle}>Signals used:</Text>
          <Text style={styles.cheapLine}>{job.cheapSignals.https ? '✓' : '✗'} HTTPS</Text>
          <Text style={styles.cheapLine}>{job.cheapSignals.hasByline ? '✓' : '✗'} Byline present</Text>
          <Text style={styles.cheapLine}>{job.cheapSignals.hasSiteName ? '✓' : '✗'} Publisher name extracted</Text>
          <Text style={styles.cheapLine}>{job.cheapSignals.longEnoughBonus ? '✓' : '✗'} Article {'>'} 2000 chars</Text>
        </View>
      )}
      <View style={[styles.breakdownRow, { marginTop: 12 }]}>
        <Text style={styles.breakdownName}>Content quality (AI)</Text>
        <Text style={styles.breakdownScore}>{job.contentQuality}</Text>
      </View>
      {job.contentReasoning && (<Text style={styles.breakdownSource}>{job.contentReasoning}</Text>)}
      {job.bias && (
        <>
          <View style={[styles.breakdownRow, { marginTop: 12 }]}>
            <Text style={styles.breakdownName}>Bias (AI)</Text>
            <Text style={styles.breakdownScore}>{biasLabel(job.bias.scale)}</Text>
          </View>
          <Text style={styles.breakdownSource}>LLM-estimated, low confidence on its own.</Text>
        </>
      )}
    </View>
  );
}

function PublisherDetailBlock({ publisher }: { publisher: PublisherLookup }) {
  return (
    <View style={{ marginTop: 12 }}>
      <Text style={styles.label}>Publisher</Text>
      <Text style={styles.value}>{publisher.canonicalDomain ?? 'Unknown domain'}</Text>
      <View style={[styles.inline, { marginTop: 6 }]}>
        <View style={[styles.tierBadge, { backgroundColor: tierColor(publisher.reliabilityTier) }]}>
          <Text style={styles.tierBadgeText}>{tierLabel(publisher.reliabilityTier)}</Text>
        </View>
      </View>
      {publisher.verdicts.length > 0 && (
        <View style={{ marginTop: 6 }}>
          {publisher.verdicts.map((v, i) => (
            <View key={i} style={styles.verdictRow}>
              <Text style={styles.verdictSource}>{sourceLabel(v.source)}</Text>
              <Text style={styles.verdictText}>{v.verdict}</Text>
              {v.details && <Text style={styles.verdictDetails}>{v.details}</Text>}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

export function CheckScreen({ onOpenMethodology, onOpenLimitations }: CheckScreenProps) {
  const [url, setUrl] = useState('');
  const [state, setState] = useState<ScreenState>({ kind: 'idle' });
  const [feedbackDeviceId, setFeedbackDeviceId] = useState<string | null>(null);

  useEffect(() => {
    getDeviceId().then(setFeedbackDeviceId);
  }, []);

  async function pollUntilDone(jobId: string): Promise<void> {
    for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
      const result = await getJob(jobId);
      if (!result.ok) {
        setState({ kind: 'error', message: result.error.message });
        return;
      }
      if (result.value.status === 'complete' || result.value.status === 'failed') {
        setState({ kind: 'result', job: result.value });
        return;
      }
      setState({ kind: 'polling', jobId, job: result.value });
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
    setState({ kind: 'error', message: 'Timed out waiting for the result.' });
  }

  async function pollDeep(jobId: string): Promise<void> {
    for (let attempt = 0; attempt < DEEP_POLL_MAX_ATTEMPTS; attempt++) {
      const result = await getJob(jobId);
      if (!result.ok) {
        // Update current state with the new error inline; keep result intact
        setState((prev) => {
          if (prev.kind !== 'result') return prev;
          return { kind: 'result', job: { ...prev.job, deepStatus: 'failed', deepError: result.error } };
        });
        return;
      }
      setState((prev) => {
        if (prev.kind !== 'result') return prev;
        return { kind: 'result', job: result.value };
      });
      if (result.value.deepStatus === 'complete' || result.value.deepStatus === 'failed') return;
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
  }

  async function onSubmit() {
    if (!url.trim()) return;
    setState({ kind: 'submitting' });
    const deviceId = await getDeviceId();
    const submission = await submitCheck(url.trim(), deviceId);
    if (!submission.ok) {
      setState({ kind: 'error', message: submission.error.message });
      return;
    }
    setState({ kind: 'polling', jobId: submission.value.jobId });
    await pollUntilDone(submission.value.jobId);
  }

  async function onStartDeep() {
    if (state.kind !== 'result') return;
    const jobId = state.job.jobId;
    setState({ kind: 'result', job: { ...state.job, deepStatus: 'pending', deepError: undefined } });
    const r = await startDeep(jobId);
    if (!r.ok) {
      setState((prev) => prev.kind === 'result'
        ? { kind: 'result', job: { ...prev.job, deepStatus: 'failed', deepError: r.error } }
        : prev);
      return;
    }
    await pollDeep(jobId);
  }

  function onReset() {
    setUrl('');
    setState({ kind: 'idle' });
  }

  const isWorking = state.kind === 'submitting' || state.kind === 'polling';
  const polling = state.kind === 'polling' ? state.job : undefined;
  const completeJob = state.kind === 'result' && state.job.status === 'complete' ? state.job : null;
  const failedJob = state.kind === 'result' && state.job.status === 'failed' ? state.job : null;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Credibility Check</Text>
        <Text style={styles.subtitle}>Paste an article URL.</Text>

        <TextInput
          style={styles.input}
          placeholder="https://example.com/article"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          value={url}
          onChangeText={setUrl}
          editable={!isWorking}
        />

        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.button,
            pressed && styles.buttonPressed,
            isWorking && styles.buttonDisabled
          ]}
          disabled={isWorking}
          onPress={onSubmit}
        >
          <Text style={styles.buttonText}>Check</Text>
        </Pressable>

        <View style={styles.resultBox}>
          {state.kind === 'idle' && <Text style={styles.muted}>Awaiting a URL.</Text>}

          {state.kind === 'submitting' && (
            <View style={styles.inline}>
              <ActivityIndicator />
              <Text style={styles.muted}>Submitting…</Text>
            </View>
          )}

          {state.kind === 'polling' && (
            <View>
              {polling?.publisher && <PublisherDetailBlock publisher={polling.publisher} />}
              {polling?.article?.title && (
                <View style={{ marginTop: 12 }}>
                  <Text style={styles.label}>Article</Text>
                  <Text style={styles.value}>{polling.article.title}</Text>
                </View>
              )}
              <View style={[styles.inline, { marginTop: 12 }]}>
                <ActivityIndicator />
                <Text style={styles.muted}>Analyzing…</Text>
              </View>
            </View>
          )}

          {completeJob && (
            <View>
              <HeadlineBlock job={completeJob} />
              {completeJob.article?.title && (
                <View style={{ marginTop: 16 }}>
                  <Text style={styles.label}>Article</Text>
                  <Text style={styles.value}>{completeJob.article.title}</Text>
                </View>
              )}
              <BreakdownBlock job={completeJob} />
              {completeJob.publisher && <PublisherDetailBlock publisher={completeJob.publisher} />}

              {completeJob.counterArgument && (
                <View style={styles.counterBox}>
                  <Text style={styles.counterTitle}>Counter-argument</Text>
                  <Text style={styles.counterText}>{completeJob.counterArgument}</Text>
                  <Text style={styles.counterFootnote}>
                    The strongest reason this rating could be wrong. Media-literacy tool.
                  </Text>
                </View>
              )}

              <FeedbackBlock jobId={completeJob.jobId} deviceId={feedbackDeviceId} />

              {/* Deep Analysis CTA + section */}
              {(!completeJob.deepStatus || completeJob.deepStatus === 'idle') && (
                <View style={{ marginTop: 12 }}>
                  <Pressable
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.deepButton, pressed && styles.buttonPressed]}
                    onPress={onStartDeep}
                  >
                    <Text style={styles.deepButtonText}>Run Deep Analysis</Text>
                  </Pressable>
                  <Text style={styles.deepHint}>
                    Costs ~3-5× a normal check. Spawns a Skeptic + Advocate + Judge debate.
                    Takes 10-20s.
                  </Text>
                </View>
              )}

              {completeJob.deepStatus === 'pending' && (
                <View style={[styles.inline, { marginTop: 12 }]}>
                  <ActivityIndicator />
                  <Text style={styles.muted}>Running Deep Analysis…</Text>
                </View>
              )}

              {completeJob.deepStatus === 'failed' && completeJob.deepError && (
                <View style={{ marginTop: 12 }}>
                  <Text style={styles.errorTitle}>Deep Analysis failed</Text>
                  <Text style={styles.errorMessage}>{completeJob.deepError.message}</Text>
                  <Pressable onPress={onStartDeep} style={{ marginTop: 8 }}>
                    <Text style={styles.link}>Retry</Text>
                  </Pressable>
                </View>
              )}

              {completeJob.deepStatus === 'complete' && completeJob.deepAnalysis && (
                <DeepAnalysisBlock deep={completeJob.deepAnalysis} />
              )}

              <Text style={[styles.disclaimer, { marginTop: 16 }]}>
                AI-generated. May contain errors. Publisher tier from cited sources.
              </Text>

              <View style={styles.linkRow}>
                <Pressable onPress={onOpenMethodology}><Text style={styles.link}>How this works</Text></Pressable>
                <Pressable onPress={onOpenLimitations}><Text style={styles.link}>Limitations</Text></Pressable>
              </View>

              <Pressable onPress={onReset} style={styles.resetLink}>
                <Text style={styles.resetText}>Check another URL</Text>
              </Pressable>
            </View>
          )}

          {failedJob && failedJob.error && (
            <View>
              {failedJob.publisher && <PublisherDetailBlock publisher={failedJob.publisher} />}
              <Text style={[styles.errorTitle, { marginTop: 12 }]}>Couldn't analyze this URL</Text>
              <Text style={styles.errorMessage}>{failedJob.error.message}</Text>
              <Pressable onPress={onReset} style={styles.resetLink}>
                <Text style={styles.resetText}>Try another URL</Text>
              </Pressable>
            </View>
          )}

          {state.kind === 'error' && (
            <View>
              <Text style={styles.errorTitle}>Error</Text>
              <Text style={styles.errorMessage}>{state.message}</Text>
              <Pressable onPress={onReset} style={styles.resetLink}>
                <Text style={styles.resetText}>Try again</Text>
              </Pressable>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fafaf7' },
  container: { padding: 20, gap: 12 },
  title: { fontSize: 28, fontWeight: '700' },
  subtitle: { fontSize: 14, color: '#5f6368', marginBottom: 8 },
  input: {
    backgroundColor: '#fff', borderColor: '#e6e3dc', borderWidth: 1,
    borderRadius: 8, padding: 12, fontSize: 16
  },
  button: { backgroundColor: '#2563eb', borderRadius: 8, padding: 14, alignItems: 'center' },
  buttonPressed: { opacity: 0.85 },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  resultBox: {
    backgroundColor: '#fff', borderColor: '#e6e3dc', borderWidth: 1,
    borderRadius: 8, padding: 16, marginTop: 8
  },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  muted: { color: '#5f6368' },
  label: { color: '#5f6368', fontSize: 12, textTransform: 'uppercase', marginTop: 8 },
  value: { fontSize: 16, color: '#1a1a1a' },

  headlineScore: { fontSize: 56, fontWeight: '800', lineHeight: 62 },
  headlineLabel: { fontSize: 18, fontWeight: '700' },
  confidencePill: {
    borderWidth: 1, borderRadius: 999,
    paddingHorizontal: 8, paddingVertical: 2, marginTop: 4,
    alignSelf: 'flex-start'
  },
  confidencePillText: { fontSize: 10, fontWeight: '700' },

  breakdownBox: {
    backgroundColor: '#fafaf7', borderColor: '#e6e3dc', borderWidth: 1,
    borderRadius: 8, padding: 12, marginTop: 16
  },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  breakdownName: { fontSize: 14, color: '#1a1a1a', fontWeight: '600' },
  breakdownScore: { fontSize: 16, color: '#1a1a1a', fontWeight: '700' },
  breakdownSource: { fontSize: 12, color: '#5f6368', marginTop: 2 },

  cheapBox: {
    backgroundColor: '#fff', borderColor: '#e6e3dc', borderWidth: 1,
    borderRadius: 6, padding: 8, marginTop: 6
  },
  cheapTitle: { fontSize: 11, color: '#5f6368', fontWeight: '600', textTransform: 'uppercase', marginBottom: 2 },
  cheapLine: { fontSize: 12, color: '#1a1a1a' },

  counterBox: {
    backgroundColor: '#fef3c7', borderColor: '#f59e0b', borderWidth: 1,
    borderRadius: 8, padding: 12, marginTop: 12
  },
  counterTitle: { fontSize: 12, color: '#92400e', fontWeight: '700', textTransform: 'uppercase', marginBottom: 4 },
  counterText: { fontSize: 14, color: '#1a1a1a' },
  counterFootnote: { fontSize: 11, color: '#92400e', marginTop: 6, fontStyle: 'italic' },

  // Deep Analysis
  deepButton: {
    backgroundColor: '#7c3aed', borderRadius: 8, padding: 12, alignItems: 'center'
  },
  deepButtonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  deepHint: { fontSize: 12, color: '#5f6368', marginTop: 6, textAlign: 'center', fontStyle: 'italic' },

  deepBox: {
    backgroundColor: '#f5f3ff', borderColor: '#c4b5fd', borderWidth: 1,
    borderRadius: 8, padding: 12, marginTop: 12
  },
  deepHeader: { fontSize: 14, fontWeight: '700', color: '#5b21b6', textTransform: 'uppercase', marginBottom: 8 },

  judgeBox: {
    backgroundColor: '#fff', borderColor: '#c4b5fd', borderWidth: 1,
    borderRadius: 6, padding: 10, marginBottom: 8
  },
  judgeLabel: { fontSize: 11, color: '#5b21b6', fontWeight: '700', marginBottom: 4 },
  judgeVerdict: { fontSize: 14, color: '#1a1a1a' },

  agentCard: {
    backgroundColor: '#fff', borderWidth: 1,
    borderRadius: 6, padding: 10, marginTop: 6
  },
  agentLabel: { fontSize: 12, fontWeight: '700', flex: 1 },
  agentChevron: { fontSize: 14, fontWeight: '700' },
  agentReasoning: { fontSize: 14, color: '#1a1a1a' },
  agentEvidenceTitle: { fontSize: 11, color: '#5f6368', fontWeight: '600', textTransform: 'uppercase' },
  agentEvidence: { fontSize: 13, color: '#1a1a1a', marginTop: 2, lineHeight: 18 },

  modelLimitation: {
    fontSize: 11, color: '#5b21b6', marginTop: 8, fontStyle: 'italic', lineHeight: 16
  },

  tierBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, alignSelf: 'flex-start' },
  tierBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  verdictRow: {
    backgroundColor: '#fafaf7', borderColor: '#e6e3dc', borderWidth: 1,
    borderRadius: 6, padding: 10, marginTop: 6
  },
  verdictSource: { fontSize: 11, color: '#5f6368', fontWeight: '600', textTransform: 'uppercase', marginBottom: 2 },
  verdictText: { fontSize: 14, color: '#1a1a1a' },
  verdictDetails: { fontSize: 12, color: '#5f6368', marginTop: 2 },

  disclaimer: { fontSize: 12, color: '#5f6368', fontStyle: 'italic' },
  linkRow: { flexDirection: 'row', gap: 18, marginTop: 8 },
  link: { color: '#2563eb', fontWeight: '500' },
  errorTitle: { color: '#b91c1c', fontWeight: '600', marginBottom: 4 },
  errorMessage: { color: '#1a1a1a' },
  resetLink: { marginTop: 16 },
  resetText: { color: '#2563eb', fontWeight: '600' },

  // Feedback widget
  feedbackBox: {
    backgroundColor: '#fafaf7',
    borderColor: '#e6e3dc',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginTop: 16
  },
  feedbackLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#5f6368'
  },
  feedbackThanks: {
    fontSize: 13,
    color: '#15803d',
    fontStyle: 'italic'
  },
  feedbackButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8
  },
  feedbackButton: {
    width: 60,
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e6e3dc',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center'
  },
  feedbackButtonSelected: {
    backgroundColor: '#dbeafe',
    borderColor: '#2563eb'
  },
  feedbackButtonText: {
    fontSize: 22
  },
  feedbackInput: {
    backgroundColor: '#fff',
    borderColor: '#e6e3dc',
    borderWidth: 1,
    borderRadius: 6,
    padding: 8,
    minHeight: 60,
    fontSize: 14,
    textAlignVertical: 'top'
  }
});
