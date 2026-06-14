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

// ---- Brand palette ---------------------------------------------------------
const COLORS = {
  sageBg:        '#A8D5BA',
  sageLight:     '#D7EAD9',
  cream:         '#FAF4E6',
  pageBg:        '#F7F4EC',
  deepTeal:      '#2F6B5C',
  deepTealLight: '#4A8A78',
  high:          '#3FA66B',
  mediumWarm:    '#E89B4C',
  lowSoft:       '#D26464',
  text:          '#1F2937',
  textMuted:     '#6B7280',
  textDim:       '#9CA3AF',
  border:        '#E5E7EB',
  borderSoft:    '#EFE9DC',
  white:         '#FFFFFF',
  counterBg:     '#FBF3DA'
};

// ---- Bucket / score helpers -----------------------------------------------
function overallColor(score: number): string {
  if (score >= 70) return COLORS.high;
  if (score >= 40) return COLORS.mediumWarm;
  return COLORS.lowSoft;
}

function overallTintBg(score: number): string {
  if (score >= 70) return '#DFF1E5'; // very soft green
  if (score >= 40) return '#FBE9D5'; // very soft amber
  return '#F6DCDC';                  // very soft red
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
    case 'high':   return COLORS.high;
    case 'medium': return COLORS.mediumWarm;
    case 'low':    return COLORS.textMuted;
  }
}

function tierColor(tier: ReliabilityTier): string {
  switch (tier) {
    case 'high':    return COLORS.high;
    case 'medium':  return COLORS.mediumWarm;
    case 'mixed':   return COLORS.mediumWarm;
    case 'low':     return COLORS.lowSoft;
    case 'unknown': return COLORS.textMuted;
  }
}

function tierLabel(tier: ReliabilityTier): string {
  switch (tier) {
    case 'high':    return 'Generally reliable';
    case 'medium':  return 'Mixed reputation';
    case 'mixed':   return 'Mixed reputation';
    case 'low':     return 'Generally unreliable';
    case 'unknown': return 'Not in our curated list';
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

// ---- Reusable section-title ------------------------------------------------
function SectionTitle({ children }: { children: string }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

// ---- Agent card -----------------------------------------------------------
function AgentCard({ label, color, report, expanded, onToggle }:
  { label: string; color: string; report: AgentReport; expanded: boolean; onToggle: () => void }) {
  return (
    <View style={[styles.agentCard, { borderColor: color }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${label} ${expanded ? 'collapse' : 'expand'} reasoning`}
        onPress={onToggle}
      >
        <View style={styles.inline}>
          <Text style={[styles.agentLabel, { color }]}>{label}</Text>
          <Text style={[styles.agentChevron, { color }]}>{expanded ? '▼' : '▶'}</Text>
        </View>
      </Pressable>
      {expanded && (
        <View style={{ marginTop: 10 }}>
          <Text style={styles.agentReasoning}>{report.reasoning}</Text>
          {report.evidence.length > 0 && (
            <View style={{ marginTop: 10 }}>
              <Text style={styles.agentEvidenceTitle}>Evidence</Text>
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

// ---- Deep Analysis block --------------------------------------------------
function DeepAnalysisBlock({ deep }: { deep: DeepAnalysis }) {
  const [skExpanded, setSkExpanded] = useState(false);
  const [adExpanded, setAdExpanded] = useState(false);
  return (
    <View style={styles.deepBox}>
      <SectionTitle>DEEP ANALYSIS</SectionTitle>

      <View style={styles.judgeBox}>
        <Text style={styles.judgeLabel}>JUDGE'S VERDICT</Text>
        <Text style={styles.judgeVerdict}>{deep.judge.verdict}</Text>
        <View style={[styles.confidencePill, { borderColor: confidenceColor(deep.judge.confidence), marginTop: 10 }]}>
          <Text style={[styles.confidencePillText, { color: confidenceColor(deep.judge.confidence) }]}>
            {deep.judge.confidence.toUpperCase()} RATING STRENGTH
          </Text>
        </View>
      </View>

      {deep.evidence && <EvidenceCard evidence={deep.evidence} />}

      <AgentCard label="SKEPTIC" color={COLORS.lowSoft} report={deep.skeptic}
                 expanded={skExpanded} onToggle={() => setSkExpanded(!skExpanded)} />
      <AgentCard label="ADVOCATE" color={COLORS.high} report={deep.advocate}
                 expanded={adExpanded} onToggle={() => setAdExpanded(!adExpanded)} />

      <Text style={styles.modelLimitation}>{deep.modelLimitation}</Text>
    </View>
  );
}

// ---- Feedback widget ------------------------------------------------------
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
          accessibilityLabel="Mark rating as helpful"
          disabled={submitting || vote !== null}
          style={({ pressed }) => [
            styles.feedbackButton,
            vote === 'up' && styles.feedbackButtonSelected,
            pressed && styles.pressed
          ]}
          onPress={() => { setVote('up'); send('up'); }}
        >
          <Text style={[
            styles.feedbackButtonText,
            vote === 'up' && styles.feedbackButtonTextSelected
          ]}>Helpful</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Mark rating as not helpful"
          disabled={submitting || vote !== null}
          style={({ pressed }) => [
            styles.feedbackButton,
            vote === 'down' && styles.feedbackButtonSelected,
            pressed && styles.pressed
          ]}
          onPress={() => setVote('down')}
        >
          <Text style={[
            styles.feedbackButtonText,
            vote === 'down' && styles.feedbackButtonTextSelected
          ]}>Not helpful</Text>
        </Pressable>
      </View>

      {vote === 'down' && (
        <View style={{ marginTop: 12 }}>
          <TextInput
            style={styles.feedbackInput}
            placeholder="Why? (optional)"
            placeholderTextColor={COLORS.textDim}
            value={comment}
            onChangeText={setComment}
            multiline
            maxLength={500}
            editable={!submitting}
          />
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.pressed,
              submitting && styles.buttonDisabled,
              { marginTop: 10 }
            ]}
            disabled={submitting}
            onPress={() => send('down', comment.trim() || undefined)}
          >
            <Text style={styles.primaryButtonText}>{submitting ? 'Sending…' : 'Send feedback'}</Text>
          </Pressable>
        </View>
      )}

      {error && (
        <Text style={[styles.errorMessage, { marginTop: 8 }]}>{error}</Text>
      )}
    </View>
  );
}

// ---- Headline (big score + bucket) ----------------------------------------
function HeadlineBlock({ job }: { job: JobResult }) {
  if (job.overall === undefined || !job.bucket || !job.confidence) return null;
  const color = overallColor(job.overall);
  const tintBg = overallTintBg(job.overall);
  return (
    <View style={styles.headlineWrap}>
      <SectionTitle>OVERALL CREDIBILITY</SectionTitle>
      <View style={[styles.scorePill, { backgroundColor: tintBg }]}>
        <Text
          style={[styles.headlineScore, { color }]}
          adjustsFontSizeToFit
          numberOfLines={1}
          minimumFontScale={0.6}
          accessibilityLabel={`Credibility score ${job.overall} out of 100, rating strength ${job.confidence}`}
        >
          {job.overall}
        </Text>
        <Text style={[styles.scoreSuffix, { color }]}>/ 100</Text>
      </View>
      <Text style={[styles.headlineLabel, { color }]}>{bucketLabel(job.bucket)}</Text>
      <View style={[styles.confidencePill, { borderColor: confidenceColor(job.confidence), marginTop: 8 }]}>
        <Text style={[styles.confidencePillText, { color: confidenceColor(job.confidence) }]}>
          {job.confidence.toUpperCase()} RATING STRENGTH
        </Text>
      </View>
    </View>
  );
}

// ---- Breakdown ------------------------------------------------------------
function BreakdownBlock({ job }: { job: JobResult }) {
  if (job.sourceRep === undefined || job.contentQuality === undefined) return null;
  return (
    <View style={styles.card}>
      <SectionTitle>BREAKDOWN</SectionTitle>

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
          <Text style={styles.cheapTitle}>SIGNALS USED</Text>
          <Text style={styles.cheapLine}>{job.cheapSignals.https ? '✓' : '✗'} HTTPS</Text>
          <Text style={styles.cheapLine}>{job.cheapSignals.hasByline ? '✓' : '✗'} Byline present</Text>
          <Text style={styles.cheapLine}>{job.cheapSignals.hasSiteName ? '✓' : '✗'} Publisher name extracted</Text>
          <Text style={styles.cheapLine}>{job.cheapSignals.longEnoughBonus ? '✓' : '✗'} Article {'>'} 2000 chars</Text>
        </View>
      )}

      <View style={styles.breakdownDivider} />

      <View style={styles.breakdownRow}>
        <Text style={styles.breakdownName}>Article quality</Text>
        <Text style={styles.breakdownScore}>{job.contentQuality}</Text>
      </View>
      {job.contentReasoning && (<Text style={styles.breakdownSource}>{job.contentReasoning}</Text>)}

      {job.bias && (
        <>
          <View style={styles.breakdownDivider} />
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownName}>Tone & balance</Text>
            <Text style={styles.breakdownScoreWord}>{biasLabel(job.bias.scale)}</Text>
          </View>
          <Text style={styles.breakdownSource}>LLM-estimated, low rating strength on its own.</Text>
        </>
      )}
    </View>
  );
}

// ---- Publisher block ------------------------------------------------------
function PublisherDetailBlock({ publisher }: { publisher: PublisherLookup }) {
  return (
    <View style={styles.card}>
      <SectionTitle>PUBLISHER</SectionTitle>
      <Text style={styles.publisherDomain}>{publisher.canonicalDomain ?? 'Unknown domain'}</Text>
      <View style={[styles.inline, { marginTop: 8 }]}>
        <View style={[styles.tierBadge, { backgroundColor: tierColor(publisher.reliabilityTier) }]}>
          <Text style={styles.tierBadgeText}>{tierLabel(publisher.reliabilityTier)}</Text>
        </View>
      </View>
      {publisher.verdicts.length > 0 && (
        <View style={{ marginTop: 12 }}>
          {publisher.verdicts.map((v, i) => (
            <View key={i} style={styles.verdictRow}>
              <View style={styles.sourceChip}>
                <Text style={styles.sourceChipText}>{sourceLabel(v.source)}</Text>
              </View>
              <View style={{ flexShrink: 1 }}>
                <Text style={styles.verdictText}>{v.verdict}</Text>
                {v.details && <Text style={styles.verdictDetails}>{v.details}</Text>}
              </View>
            </View>
          ))}
        </View>
      )}
      {publisher.reliabilityTier === 'unknown' && (
        <Text style={styles.unknownCaveat}>
          Common reasons: local newspaper, niche blog, foreign-language site, or new
          publication. The score above relies on article-level signals only.
        </Text>
      )}
    </View>
  );
}

// ---- Main screen ----------------------------------------------------------
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
      <View style={styles.sageStrip} />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.headerRow}>
          <View style={{ flexShrink: 1 }}>
            <Text style={styles.title}>Credibility Check</Text>
            <Text style={styles.subtitle}>Paste an article URL.</Text>
          </View>
          <View style={styles.headerLinks}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="How this works"
              onPress={onOpenMethodology}
              style={({ pressed }) => [styles.headerLinkButton, pressed && styles.pressed]}
            >
              <Text style={styles.headerLinkText}>How</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Limitations"
              onPress={onOpenLimitations}
              style={({ pressed }) => [styles.headerLinkButton, pressed && styles.pressed]}
            >
              <Text style={styles.headerLinkText}>Limits</Text>
            </Pressable>
          </View>
        </View>

        <TextInput
          style={styles.input}
          placeholder="https://example.com/article"
          placeholderTextColor={COLORS.textDim}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          value={url}
          onChangeText={setUrl}
          editable={!isWorking}
        />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Check article credibility"
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && styles.pressed,
            isWorking && styles.buttonDisabled
          ]}
          disabled={isWorking}
          onPress={onSubmit}
        >
          <Text style={styles.primaryButtonText}>Check</Text>
        </Pressable>

        <View style={styles.resultArea}>
          {state.kind === 'idle' && (
            <View style={styles.howCard}>
              <Text style={styles.sectionTitle}>HOW IT WORKS</Text>
              <View style={styles.howStep}>
                <Text style={styles.howNumber}>1.</Text>
                <Text style={styles.howText}>Paste any article URL above.</Text>
              </View>
              <View style={styles.howStep}>
                <Text style={styles.howNumber}>2.</Text>
                <Text style={styles.howText}>We score it 0-100 for credibility.</Text>
              </View>
              <View style={styles.howStep}>
                <Text style={styles.howNumber}>3.</Text>
                <Text style={styles.howText}>
                  Tap "Deep Analysis" for fact-check evidence + a Skeptic / Advocate debate.
                </Text>
              </View>
            </View>
          )}

          {state.kind === 'submitting' && (
            <View style={styles.card}>
              <View style={styles.inline}>
                <ActivityIndicator color={COLORS.deepTeal} />
                <Text style={styles.muted}>Submitting…</Text>
              </View>
            </View>
          )}

          {state.kind === 'polling' && (
            <View style={styles.stack}>
              {polling?.publisher && <PublisherDetailBlock publisher={polling.publisher} />}
              {polling?.article?.title && (
                <View style={styles.card}>
                  <SectionTitle>ARTICLE</SectionTitle>
                  <Text style={styles.value}>{polling.article.title}</Text>
                  {polling.article.excerpt && (
                    <Text style={styles.articleExcerpt} numberOfLines={3}>
                      {polling.article.excerpt}
                    </Text>
                  )}
                </View>
              )}
              <View style={styles.card}>
                <View style={styles.inline}>
                  <ActivityIndicator color={COLORS.deepTeal} />
                  <Text style={styles.muted}>Analyzing…</Text>
                </View>
              </View>
            </View>
          )}

          {completeJob && (
            <View style={styles.stack}>
              <View style={styles.card}>
                <HeadlineBlock job={completeJob} />
              </View>

              {completeJob.article?.title && (
                <View style={styles.card}>
                  <SectionTitle>ARTICLE</SectionTitle>
                  <Text style={styles.value}>{completeJob.article.title}</Text>
                  {completeJob.article.excerpt && (
                    <Text style={styles.articleExcerpt} numberOfLines={3}>
                      {completeJob.article.excerpt}
                    </Text>
                  )}
                </View>
              )}

              <BreakdownBlock job={completeJob} />
              {completeJob.publisher && <PublisherDetailBlock publisher={completeJob.publisher} />}

              {completeJob.counterArgument && (
                <View style={styles.counterBox}>
                  <Text style={styles.counterTitle}>DEVIL'S ADVOCATE</Text>
                  <Text style={styles.counterText}>{completeJob.counterArgument}</Text>
                  <Text style={styles.counterFootnote}>
                    The strongest reason this rating could be wrong. Media-literacy tool.
                  </Text>
                </View>
              )}

              <FeedbackBlock jobId={completeJob.jobId} deviceId={feedbackDeviceId} />

              {/* Deep Analysis CTA + section */}
              {(!completeJob.deepStatus || completeJob.deepStatus === 'idle') && (
                <View style={styles.deepCtaWrap}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Run Deep Analysis"
                    style={({ pressed }) => [styles.deepButton, pressed && styles.pressed]}
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
                <View style={styles.card}>
                  <View style={styles.inline}>
                    <ActivityIndicator color={COLORS.deepTeal} />
                    <Text style={styles.muted}>Running Deep Analysis…</Text>
                  </View>
                </View>
              )}

              {completeJob.deepStatus === 'failed' && completeJob.deepError && (
                <View style={styles.card}>
                  <Text style={styles.errorTitle}>Deep Analysis failed</Text>
                  <Text style={styles.errorMessage}>{completeJob.deepError.message}</Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={onStartDeep}
                    style={({ pressed }) => [styles.retryLink, pressed && styles.pressed]}
                  >
                    <Text style={styles.link}>Retry</Text>
                  </Pressable>
                </View>
              )}

              {completeJob.deepStatus === 'complete' && completeJob.deepAnalysis && (
                <DeepAnalysisBlock deep={completeJob.deepAnalysis} />
              )}

              <Text style={styles.disclaimer}>
                AI-generated. May contain errors. Publisher tier from cited sources.
              </Text>

              <Pressable
                accessibilityRole="button"
                onPress={onReset}
                style={({ pressed }) => [styles.resetLink, pressed && styles.pressed]}
              >
                <Text style={styles.resetText}>Check another URL</Text>
              </Pressable>
            </View>
          )}

          {failedJob && failedJob.error && (
            <View style={styles.stack}>
              {failedJob.publisher && <PublisherDetailBlock publisher={failedJob.publisher} />}
              <View style={styles.card}>
                <Text style={styles.errorTitle}>Couldn't analyze this URL</Text>
                <Text style={styles.errorMessage}>{failedJob.error.message}</Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={onReset}
                  style={({ pressed }) => [styles.resetLink, pressed && styles.pressed]}
                >
                  <Text style={styles.resetText}>Try another URL</Text>
                </Pressable>
              </View>
            </View>
          )}

          {state.kind === 'error' && (
            <View style={styles.card}>
              <Text style={styles.errorTitle}>Error</Text>
              <Text style={styles.errorMessage}>{state.message}</Text>
              <Pressable
                accessibilityRole="button"
                onPress={onReset}
                style={({ pressed }) => [styles.resetLink, pressed && styles.pressed]}
              >
                <Text style={styles.resetText}>Try again</Text>
              </Pressable>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ---- Shared style fragments -----------------------------------------------
const cardShadow = {
  shadowColor: '#1F2937',
  shadowOpacity: 0.06,
  shadowOffset: { width: 0, height: 2 },
  shadowRadius: 8,
  elevation: 2
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.pageBg },

  // Sage accent strip at the very top of the screen, behind the safe area.
  sageStrip: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 6,
    backgroundColor: COLORS.sageBg
  },

  container: { padding: 20, gap: 16 },

  // ---- Header ----
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.deepTeal,
    letterSpacing: -0.3
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textMuted,
    marginTop: 4
  },
  headerLinks: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4
  },
  headerLinkButton: {
    borderWidth: 1,
    borderColor: COLORS.deepTealLight,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: COLORS.cream
  },
  headerLinkText: {
    color: COLORS.deepTeal,
    fontSize: 13,
    fontWeight: '600'
  },

  // ---- Input ----
  input: {
    backgroundColor: COLORS.white,
    borderColor: COLORS.borderSoft,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: COLORS.text,
    ...cardShadow
  },

  // ---- Primary button (Check / Send) ----
  primaryButton: {
    backgroundColor: COLORS.deepTeal,
    borderRadius: 999,
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
    ...cardShadow
  },
  primaryButtonText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2
  },
  pressed: { opacity: 0.85 },
  buttonDisabled: { opacity: 0.5 },

  // ---- Results layout ----
  resultArea: { marginTop: 4 },
  stack: { gap: 16 },

  howCard: {
    backgroundColor: COLORS.cream,
    borderColor: COLORS.borderSoft,
    borderWidth: 1,
    borderRadius: 20,
    padding: 18,
    ...cardShadow
  },
  howStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 8
  },
  howNumber: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.deepTeal,
    lineHeight: 22,
    minWidth: 18
  },
  howText: {
    flex: 1,
    fontSize: 15,
    color: COLORS.text,
    lineHeight: 22
  },

  // ---- Generic card ----
  card: {
    backgroundColor: COLORS.cream,
    borderColor: COLORS.borderSoft,
    borderWidth: 1,
    borderRadius: 20,
    padding: 18,
    ...cardShadow
  },

  // ---- Section title (BREAKDOWN, PUBLISHER, etc) ----
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMuted,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 10
  },

  inline: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  muted: { color: COLORS.textMuted, fontSize: 14 },
  value: { fontSize: 15, color: COLORS.text, lineHeight: 22 },
  articleExcerpt: {
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.textMuted,
    marginTop: 8
  },

  // ---- Headline (score) ----
  headlineWrap: { alignItems: 'flex-start' },
  scorePill: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'baseline'
  },
  headlineScore: { fontSize: 72, fontWeight: '800', lineHeight: 78, letterSpacing: -2 },
  scoreSuffix: { fontSize: 18, fontWeight: '600', marginLeft: 6, opacity: 0.7 },
  headlineLabel: { fontSize: 22, fontWeight: '600', marginTop: 8 },

  confidencePill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    alignSelf: 'flex-start',
    backgroundColor: COLORS.white
  },
  confidencePillText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6 },

  // ---- Breakdown rows ----
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  breakdownName: { fontSize: 15, color: COLORS.text, fontWeight: '500' },
  breakdownScore: { fontSize: 17, color: COLORS.text, fontWeight: '600' },
  breakdownScoreWord: { fontSize: 15, color: COLORS.text, fontWeight: '600' },
  breakdownSource: { fontSize: 13, color: COLORS.textMuted, marginTop: 4, lineHeight: 18 },
  breakdownDivider: {
    height: 1,
    backgroundColor: COLORS.borderSoft,
    marginVertical: 14
  },

  cheapBox: {
    backgroundColor: COLORS.white,
    borderColor: COLORS.borderSoft,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginTop: 10
  },
  cheapTitle: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: '600',
    letterSpacing: 1.0,
    marginBottom: 6
  },
  cheapLine: { fontSize: 13, color: COLORS.text, lineHeight: 19 },

  // ---- Counter-argument card ----
  counterBox: {
    backgroundColor: COLORS.counterBg,
    borderColor: COLORS.mediumWarm,
    borderWidth: 1,
    borderRadius: 20,
    padding: 18,
    ...cardShadow
  },
  counterTitle: {
    fontSize: 12,
    color: COLORS.mediumWarm,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 8
  },
  counterText: { fontSize: 15, color: COLORS.text, lineHeight: 22 },
  counterFootnote: { fontSize: 13, color: COLORS.textMuted, marginTop: 10, fontStyle: 'italic' },

  // ---- Deep Analysis CTA ----
  deepCtaWrap: { gap: 8 },
  deepButton: {
    backgroundColor: COLORS.deepTeal,
    borderRadius: 999,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    ...cardShadow
  },
  deepButtonText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2
  },
  deepHint: {
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: 'center',
    fontStyle: 'italic',
    lineHeight: 18,
    paddingHorizontal: 4
  },

  deepBox: {
    backgroundColor: COLORS.sageLight,
    borderColor: COLORS.deepTealLight,
    borderWidth: 1,
    borderRadius: 20,
    padding: 18,
    ...cardShadow
  },

  judgeBox: {
    backgroundColor: COLORS.white,
    borderColor: COLORS.borderSoft,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12
  },
  judgeLabel: {
    fontSize: 12,
    color: COLORS.deepTeal,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 6
  },
  judgeVerdict: { fontSize: 15, color: COLORS.text, lineHeight: 22 },

  agentCard: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginTop: 10
  },
  agentLabel: { fontSize: 13, fontWeight: '700', letterSpacing: 1.0, flex: 1 },
  agentChevron: { fontSize: 14, fontWeight: '700' },
  agentReasoning: { fontSize: 15, color: COLORS.text, lineHeight: 22 },
  agentEvidenceTitle: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontWeight: '600',
    letterSpacing: 1.0,
    marginBottom: 4
  },
  agentEvidence: { fontSize: 14, color: COLORS.text, marginTop: 4, lineHeight: 20 },

  modelLimitation: {
    fontSize: 13,
    color: COLORS.deepTeal,
    marginTop: 12,
    fontStyle: 'italic',
    lineHeight: 18
  },

  // ---- Publisher ----
  publisherDomain: { fontSize: 17, fontWeight: '600', color: COLORS.text },
  tierBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    alignSelf: 'flex-start'
  },
  tierBadgeText: { color: COLORS.white, fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },

  verdictRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: COLORS.white,
    borderColor: COLORS.borderSoft,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginTop: 8
  },
  sourceChip: {
    backgroundColor: COLORS.sageLight,
    borderColor: COLORS.sageBg,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3
  },
  sourceChipText: {
    fontSize: 11,
    color: COLORS.deepTeal,
    fontWeight: '700',
    letterSpacing: 0.4
  },
  verdictText: { fontSize: 14, color: COLORS.text, lineHeight: 20 },
  verdictDetails: { fontSize: 13, color: COLORS.textMuted, marginTop: 3 },

  unknownCaveat: {
    fontSize: 13,
    lineHeight: 18,
    color: COLORS.textMuted,
    fontStyle: 'italic',
    marginTop: 12
  },

  disclaimer: {
    fontSize: 13,
    color: COLORS.textMuted,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 4
  },

  // ---- Links / reset ----
  link: { color: COLORS.deepTeal, fontWeight: '600', fontSize: 14 },
  retryLink: { marginTop: 10, alignSelf: 'flex-start' },
  errorTitle: {
    color: COLORS.lowSoft,
    fontWeight: '700',
    fontSize: 16,
    marginBottom: 6
  },
  errorMessage: { color: COLORS.text, fontSize: 14, lineHeight: 20 },
  resetLink: { marginTop: 8, alignSelf: 'center' },
  resetText: { color: COLORS.deepTeal, fontWeight: '600', fontSize: 14 },

  // ---- Feedback widget ----
  feedbackBox: {
    backgroundColor: COLORS.cream,
    borderColor: COLORS.borderSoft,
    borderWidth: 1,
    borderRadius: 20,
    padding: 18,
    ...cardShadow
  },
  feedbackLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text
  },
  feedbackThanks: {
    fontSize: 14,
    color: COLORS.deepTeal,
    fontStyle: 'italic'
  },
  feedbackButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12
  },
  feedbackButton: {
    paddingHorizontal: 18,
    height: 44,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: COLORS.deepTealLight,
    backgroundColor: COLORS.cream,
    alignItems: 'center',
    justifyContent: 'center'
  },
  feedbackButtonSelected: {
    backgroundColor: COLORS.sageLight,
    borderColor: COLORS.deepTeal
  },
  feedbackButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.deepTeal
  },
  feedbackButtonTextSelected: {
    color: COLORS.deepTeal,
    fontWeight: '700'
  },
  feedbackInput: {
    backgroundColor: COLORS.white,
    borderColor: COLORS.borderSoft,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    minHeight: 72,
    fontSize: 14,
    color: COLORS.text,
    textAlignVertical: 'top'
  }
});
