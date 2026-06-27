import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { submitCheck, getJob, startDeep, submitFeedback, requestPublisherResearch } from '../api/client';
import { getDeviceId } from '../lib/device-id';
import { loadRecentChecks, pushRecentCheck, type RecentCheck } from '../lib/recent-checks';
import { EvidenceCard } from '../components/EvidenceCard';
import type {
  AgentReport,
  Confidence,
  DatasetVerdict,
  DeepAnalysis,
  JobResult,
  OverallBucket,
  PublisherLookup,
  PublisherResearch,
  PublisherResearchSentiment,
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
  onOpenMediaLiteracy: () => void;
}

// ---- Tooltip copy ---------------------------------------------------------
interface TooltipCopy {
  whatThisChecks: string;
  askYourself: string;
}

const TOOLTIPS: Record<string, TooltipCopy> = {
  'OVERALL CREDIBILITY': {
    whatThisChecks:
      'A combined score: 45% publisher reputation, 45% AI-judged article quality, 10% tone & balance.',
    askYourself:
      'Does the score match your gut read? A weak score from a strong source — or vice versa — is worth a closer look.'
  },
  'RATING STRENGTH': {
    whatThisChecks:
      'How much data we had to make this rating. High = we knew the publisher and read the article cleanly. Low = we had to fall back to article-level signals.',
    askYourself:
      'When rating strength is low, treat the score as a guess, not a verdict. Look for primary sources yourself.'
  },
  ARTICLE: {
    whatThisChecks: 'The title, author, and a short excerpt extracted from the page.',
    askYourself:
      'Does the headline match what the article actually says? Is there a named author with verifiable credentials?'
  },
  BREAKDOWN: {
    whatThisChecks: 'The three signals that produced the overall score, scored independently.',
    askYourself:
      "If one signal is much lower than the others, that's where to focus your skepticism."
  },
  PUBLISHER: {
    whatThisChecks:
      'Who published this and how reputable they are by independent assessment (Wikipedia Perennial Sources, IFCN).',
    askYourself:
      'Even reputable publishers can be wrong. Even unknown publishers can be correct. Reputation is one signal, not the truth.'
  },
  "DEVIL'S ADVOCATE": {
    whatThisChecks: 'An AI-generated argument for why the rating could be wrong. We always show this.',
    askYourself:
      'Read this BEFORE deciding. The strongest version of the opposite view trains your media literacy more than agreeing with the score.'
  },
  'DEEP ANALYSIS': {
    whatThisChecks:
      'Three sequential AI calls (Skeptic, Advocate, Judge) plus an external fact-check pipeline against Google Fact Check Tools and Wikipedia.',
    askYourself: 'Read the Skeptic and Advocate sections before the Judge. Watch where they disagree.'
  }
};

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

// ---- Daily-rotating content (hero stat + Did You Know tip) ----------------
interface HeroStat {
  quote: string;
  source: string;
}

const HERO_STATS: HeroStat[] = [
  {
    quote: "82% of students can't tell a sponsored article from a news story.",
    source: 'Stanford History Education Group, 2016'
  },
  {
    quote: 'On Twitter, false stories spread 6× faster than true ones.',
    source: 'MIT Sloan, 2018 (Science)'
  },
  {
    quote: "A 3-hour 'Civic Online Reasoning' intervention improved fact-checking skills by 50%.",
    source: 'Stanford, 2022'
  },
  {
    quote: 'Only 30% of Americans trust news media, but 86% read news on digital devices.',
    source: 'Pew Research, 2024'
  },
  {
    quote: 'Lateral reading reduces susceptibility to misinformation by about 2×.',
    source: 'Stanford Internet Observatory'
  },
  {
    quote: 'Disinformation generates 6× more Facebook engagement than factual news.',
    source: 'NYU, 2021'
  }
];

const DID_YOU_KNOW_TIPS: string[] = [
  'When a story makes you feel strong emotion, pause before sharing. Strong emotion is the #1 driver of misinformation spread.',
  'Lateral reading — opening new tabs to verify — is faster AND more accurate than carefully evaluating one source.',
  'Anonymous sources are sometimes necessary (whistleblowers), often a red flag. The most reliable articles cite named, verifiable people.',
  'A headline can be misleading even when the article is accurate. Always read past the headline before sharing.',
  'Real photos used in fake contexts is the most common form of visual misinformation. A reverse image search takes 10 seconds.',
  'If only one publisher is reporting a major event, that’s a red flag. Mainstream stories get covered by multiple Tier-1 sources.'
];

function dailyIndex(): number {
  return new Date().getUTCDate() % 6;
}

// ---- Try-an-example chips -------------------------------------------------
interface ExampleChip {
  label: string;
  url: string;
}

const EXAMPLE_CHIPS: ExampleChip[] = [
  { label: 'BBC article', url: 'https://www.bbc.com/news/articles/c80x0qrm0pno' },
  { label: 'Snopes fact-check', url: 'https://www.snopes.com/fact-check/pope-francis-donald-trump-endorsement/' },
  { label: 'Wikipedia entry', url: 'https://en.wikipedia.org/wiki/Pizzagate_conspiracy_theory' },
  { label: 'Guardian article', url: 'https://www.theguardian.com/world' }
];

// ---- Friendly error mapping -----------------------------------------------
function friendlyErrorMessage(raw: string | undefined | null): string {
  if (!raw) return "Couldn't read this article. Try a different URL.";
  const msg = raw.toLowerCase();

  // SSRF / private network detection (check before status codes — these often
  // surface as URL_BLOCKED with bespoke messaging).
  if (
    msg.includes('private') ||
    msg.includes('ssrf') ||
    msg.includes('loopback') ||
    msg.includes('localhost') ||
    msg.includes('blocked host') ||
    msg.includes('internal network')
  ) {
    return 'That URL points to a private network. CredCheck only checks public articles.';
  }

  if (msg.includes('401') || msg.includes('403') || msg.includes('forbidden') || msg.includes('unauthorized')) {
    return 'Site needs login or blocks automated fetching. Try an open article.';
  }
  if (msg.includes('404') || msg.includes('not found')) {
    return 'URL not found. Check for typos.';
  }
  if (msg.includes('408') || msg.includes('timed out') || msg.includes('timeout')) {
    return 'The site took too long to respond. Try again.';
  }
  if (/\b5\d\d\b/.test(msg) || msg.includes('bad gateway') || msg.includes('service unavailable')) {
    return 'The site is having problems right now. Try again later.';
  }
  return "Couldn't read this article. Try a different URL.";
}

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

// ---- Info modal -----------------------------------------------------------
function InfoModal({
  visible,
  title,
  copy,
  onClose
}: {
  visible: boolean;
  title: string;
  copy: TooltipCopy | null;
  onClose: () => void;
}) {
  if (!copy) return null;
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={() => {}}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onClose}
              style={({ pressed }) => [styles.modalClose, pressed && styles.pressed]}
              hitSlop={10}
            >
              <Text style={styles.modalCloseText}>✕</Text>
            </Pressable>
          </View>
          <Text style={styles.modalSubLabel}>What this checks</Text>
          <Text style={styles.modalParagraph}>{copy.whatThisChecks}</Text>
          <Text style={styles.modalSubLabel}>What you should ask yourself</Text>
          <Text style={styles.modalParagraph}>{copy.askYourself}</Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ---- Section title with tappable info icon --------------------------------
function SectionTitleWithInfo({
  title,
  onPressInfo
}: {
  title: string;
  onPressInfo: () => void;
}) {
  return (
    <View style={styles.sectionTitleRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`More info about ${title}`}
        onPress={onPressInfo}
        hitSlop={8}
        style={({ pressed }) => [styles.infoIcon, pressed && styles.pressed]}
      >
        <Text style={styles.infoIconText}>i</Text>
      </Pressable>
    </View>
  );
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
function DeepAnalysisBlock({ deep, onInfo }: { deep: DeepAnalysis; onInfo: (name: string) => void }) {
  const [skExpanded, setSkExpanded] = useState(false);
  const [adExpanded, setAdExpanded] = useState(false);
  return (
    <View style={styles.deepBox}>
      <SectionTitleWithInfo title="DEEP ANALYSIS" onPressInfo={() => onInfo('DEEP ANALYSIS')} />

      <View style={styles.judgeBox}>
        <View style={styles.judgeLabelRow}>
          <Text style={styles.judgeLabel}>JUDGE'S VERDICT</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="More info about RATING STRENGTH"
            onPress={() => onInfo('RATING STRENGTH')}
            hitSlop={8}
            style={({ pressed }) => [styles.infoIcon, pressed && styles.pressed]}
          >
            <Text style={styles.infoIconText}>i</Text>
          </Pressable>
        </View>
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
function HeadlineBlock({ job, onInfo }: { job: JobResult; onInfo: (name: string) => void }) {
  if (job.overall === undefined || !job.bucket || !job.confidence) return null;
  const color = overallColor(job.overall);
  const tintBg = overallTintBg(job.overall);
  const confidence = job.confidence;
  const confColor = confidenceColor(confidence);
  return (
    <View style={styles.headlineWrap}>
      <SectionTitleWithInfo title="OVERALL CREDIBILITY" onPressInfo={() => onInfo('OVERALL CREDIBILITY')} />
      <View style={[styles.scorePill, { backgroundColor: tintBg }]}>
        <Text
          style={[styles.headlineScore, { color }]}
          adjustsFontSizeToFit
          numberOfLines={1}
          minimumFontScale={0.6}
          accessibilityLabel={`Credibility score ${job.overall} out of 100, rating strength ${confidence}`}
        >
          {job.overall}
        </Text>
        <Text style={[styles.scoreSuffix, { color }]}>/ 100</Text>
      </View>
      <Text style={[styles.headlineLabel, { color }]}>{bucketLabel(job.bucket)}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="More info about RATING STRENGTH"
        onPress={() => onInfo('RATING STRENGTH')}
        hitSlop={6}
        style={({ pressed }) => [
          styles.confidencePill,
          { borderColor: confColor, marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 6 },
          pressed && styles.pressed
        ]}
      >
        <Text style={[styles.confidencePillText, { color: confColor }]}>
          {confidence.toUpperCase()} RATING STRENGTH
        </Text>
        <Text style={[styles.confidencePillText, { color: confColor, opacity: 0.7 }]}>ⓘ</Text>
      </Pressable>
    </View>
  );
}

// ---- Breakdown ------------------------------------------------------------
function BreakdownBlock({ job, onInfo }: { job: JobResult; onInfo: (name: string) => void }) {
  if (job.sourceRep === undefined || job.contentQuality === undefined) return null;
  return (
    <View style={styles.card}>
      <SectionTitleWithInfo title="BREAKDOWN" onPressInfo={() => onInfo('BREAKDOWN')} />

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

function sentimentChipColor(sentiment: PublisherResearchSentiment): { bg: string; fg: string } {
  switch (sentiment) {
    case 'positive': return { bg: '#DFF1E5', fg: COLORS.high };
    case 'mixed':    return { bg: '#FBE9D5', fg: COLORS.mediumWarm };
    case 'negative': return { bg: '#F6DCDC', fg: COLORS.lowSoft };
    case 'unclear':  return { bg: '#EEEEEE', fg: COLORS.textMuted };
  }
}

function sentimentLabel(sentiment: PublisherResearchSentiment): string {
  switch (sentiment) {
    case 'positive': return 'Mostly positive';
    case 'mixed':    return 'Mixed signals';
    case 'negative': return 'Concerning';
    case 'unclear':  return 'Not enough info';
  }
}

interface AiResearchHandlers {
  jobId: string;
  inFlight: boolean;
  error: string | null;
  onLookup: () => void;
}

function AiResearchSection({
  research,
  handlers
}: {
  research?: PublisherResearch;
  handlers?: AiResearchHandlers;
}) {
  if (research) {
    const { bg, fg } = sentimentChipColor(research.sentiment);
    return (
      <View style={styles.aiResearchBox}>
        <Text style={styles.aiResearchLabel}>WHAT THE WEB SAYS</Text>
        <Text style={styles.aiResearchSummary}>{research.summary}</Text>
        <View style={[styles.sentimentChip, { backgroundColor: bg }]}>
          <Text style={[styles.sentimentChipText, { color: fg }]}>
            {sentimentLabel(research.sentiment)}
          </Text>
        </View>
        {research.citations.length > 0 && (
          <View style={styles.citationList}>
            {research.citations.slice(0, 3).map((cite, i) => (
              <Pressable
                key={i}
                accessibilityRole="link"
                accessibilityLabel={`Open citation: ${cite.title}`}
                onPress={() => { Linking.openURL(cite.url).catch(() => {}); }}
                style={({ pressed }) => [styles.citationRow, pressed && styles.pressed]}
              >
                <Text style={styles.citationTitle} numberOfLines={2}>{cite.title}</Text>
                <Text style={styles.citationUrl} numberOfLines={1}>{cite.url}</Text>
              </Pressable>
            ))}
          </View>
        )}
        <Text style={styles.aiResearchFootnote}>
          AI-summarized from independent reporting. Cached for 24 hours.
        </Text>
      </View>
    );
  }

  if (!handlers) return null;

  return (
    <View style={{ marginTop: 12 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Look up this publisher with AI web search"
        disabled={handlers.inFlight}
        onPress={handlers.onLookup}
        style={({ pressed }) => [
          styles.lookupButton,
          pressed && styles.pressed,
          handlers.inFlight && styles.lookupButtonDisabled
        ]}
      >
        {handlers.inFlight ? (
          <View style={styles.inline}>
            <ActivityIndicator color={COLORS.deepTeal} />
            <Text style={styles.lookupButtonText}>Looking up…</Text>
          </View>
        ) : (
          <Text style={styles.lookupButtonText}>Look up this publisher</Text>
        )}
      </Pressable>
      <Text style={styles.lookupHint}>
        Asks Claude to search the web for the publisher's reputation. One call per domain.
      </Text>
      {handlers.error && (
        <Text style={styles.lookupError}>{handlers.error}</Text>
      )}
    </View>
  );
}

// ---- Publisher block ------------------------------------------------------
function PublisherDetailBlock({
  publisher,
  aiHandlers,
  onInfo
}: {
  publisher: PublisherLookup;
  aiHandlers?: AiResearchHandlers;
  onInfo?: (name: string) => void;
}) {
  return (
    <View style={styles.card}>
      {onInfo ? (
        <SectionTitleWithInfo title="PUBLISHER" onPressInfo={() => onInfo('PUBLISHER')} />
      ) : (
        <SectionTitle>PUBLISHER</SectionTitle>
      )}
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
        <>
          <Text style={styles.unknownCaveat}>
            Common reasons: local newspaper, niche blog, foreign-language site, or new
            publication. The score above relies on article-level signals only.
          </Text>
          <AiResearchSection research={publisher.aiResearch} handlers={aiHandlers} />
        </>
      )}
    </View>
  );
}

// ---- Empty-state hero stat carousel ---------------------------------------
function HeroStatCard({ stat }: { stat: HeroStat }) {
  return (
    <View style={styles.heroStatCard}>
      <Text style={styles.heroStatQuoteMark}>“</Text>
      <Text style={styles.heroStatQuote}>{stat.quote}</Text>
      <Text style={styles.heroStatSource}>— {stat.source}</Text>
    </View>
  );
}

// ---- Try-an-example chips (reused in empty + error states) ----------------
function ExampleChips({
  onPickExample,
  title = 'TRY AN EXAMPLE'
}: {
  onPickExample: (url: string) => void;
  title?: string;
}) {
  return (
    <View style={styles.exampleChipsWrap}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.exampleChipsGrid}>
        {EXAMPLE_CHIPS.map((c) => (
          <Pressable
            key={c.url}
            accessibilityRole="button"
            accessibilityLabel={`Try ${c.label}`}
            onPress={() => onPickExample(c.url)}
            style={({ pressed }) => [styles.exampleChip, pressed && styles.pressed]}
          >
            <Text style={styles.exampleChipText}>{c.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// ---- Did You Know card ----------------------------------------------------
function DidYouKnowCard({ tip }: { tip: string }) {
  return (
    <View style={styles.didYouKnowCard}>
      <Text style={styles.sectionTitle}>DID YOU KNOW?</Text>
      <Text style={styles.didYouKnowText}>{tip}</Text>
    </View>
  );
}

// ---- Recent checks list ---------------------------------------------------
function RecentChecksList({
  items,
  onPick
}: {
  items: RecentCheck[];
  onPick: (entry: RecentCheck) => void;
}) {
  if (items.length === 0) return null;
  return (
    <View style={styles.recentChecksCard}>
      <Text style={styles.sectionTitle}>RECENT CHECKS</Text>
      {items.map((entry, i) => {
        const color = overallColor(entry.overall);
        const tintBg = overallTintBg(entry.overall);
        return (
          <Pressable
            key={`${entry.url}-${entry.checkedAt}`}
            accessibilityRole="button"
            accessibilityLabel={`Re-check ${entry.title || entry.url}`}
            onPress={() => onPick(entry)}
            style={({ pressed }) => [
              styles.recentRow,
              i === 0 && styles.recentRowFirst,
              pressed && styles.pressed
            ]}
          >
            <View style={styles.recentRowText}>
              <Text style={styles.recentTitle} numberOfLines={1}>
                {entry.title || entry.url}
              </Text>
              <Text style={styles.recentBucket}>{bucketLabel(entry.bucket)}</Text>
            </View>
            <View style={[styles.recentScorePill, { backgroundColor: tintBg }]}>
              <Text style={[styles.recentScoreText, { color }]}>{entry.overall}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---- Main screen ----------------------------------------------------------
export function CheckScreen({ onOpenMethodology, onOpenLimitations, onOpenMediaLiteracy }: CheckScreenProps) {
  const [url, setUrl] = useState('');
  const [state, setState] = useState<ScreenState>({ kind: 'idle' });
  const [feedbackDeviceId, setFeedbackDeviceId] = useState<string | null>(null);
  const [aiLookupInFlight, setAiLookupInFlight] = useState(false);
  const [aiLookupError, setAiLookupError] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState<string | null>(null);
  const [recentChecks, setRecentChecks] = useState<RecentCheck[]>([]);
  const [loadingStage, setLoadingStage] = useState<string>('Reading the article…');
  const persistedJobIdsRef = useRef<Set<string>>(new Set());
  const scrollRef = useRef<ScrollView | null>(null);

  // Daily-rotating content (recomputed once per mount — stable per UTC day).
  const dayIdx = dailyIndex();
  const heroStat = HERO_STATS[dayIdx];
  const dyKnowTip = DID_YOU_KNOW_TIPS[dayIdx];

  function openInfo(name: string): void {
    setInfoOpen(name);
  }

  useEffect(() => {
    getDeviceId().then(setFeedbackDeviceId);
    loadRecentChecks().then(setRecentChecks);
  }, []);

  // Cycle the loading-stage label while we're working on a check.
  useEffect(() => {
    const isWorking = state.kind === 'submitting' || state.kind === 'polling';
    if (!isWorking) return;
    setLoadingStage('Reading the article…');
    const startedAt = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      if (elapsed < 1500) setLoadingStage('Reading the article…');
      else if (elapsed < 3000) setLoadingStage('Scoring the article…');
      else setLoadingStage('Almost done…');
    }, 300);
    return () => clearInterval(interval);
  }, [state.kind]);

  // Persist the last 5 successful checks once each job becomes complete.
  useEffect(() => {
    if (state.kind !== 'result') return;
    const job = state.job;
    if (job.status !== 'complete') return;
    if (job.overall === undefined || !job.bucket) return;
    if (persistedJobIdsRef.current.has(job.jobId)) return;
    persistedJobIdsRef.current.add(job.jobId);
    const entry: RecentCheck = {
      url,
      title: job.article?.title ?? url,
      overall: job.overall,
      bucket: job.bucket,
      checkedAt: new Date().toISOString()
    };
    pushRecentCheck(entry).then(setRecentChecks).catch(() => {});
  }, [state, url]);

  async function onLookupPublisher(): Promise<void> {
    if (state.kind !== 'result' || !state.job.publisher) return;
    const jobId = state.job.jobId;
    setAiLookupInFlight(true);
    setAiLookupError(null);
    const deviceId = await getDeviceId();
    const r = await requestPublisherResearch(jobId, deviceId);
    setAiLookupInFlight(false);
    if (!r.ok) {
      setAiLookupError(r.error.message);
      return;
    }
    setState((prev) => {
      if (prev.kind !== 'result' || !prev.job.publisher) return prev;
      return {
        kind: 'result',
        job: {
          ...prev.job,
          publisher: { ...prev.job.publisher, aiResearch: r.value }
        }
      };
    });
  }

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
    setAiLookupInFlight(false);
    setAiLookupError(null);
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
    setAiLookupInFlight(false);
    setAiLookupError(null);
    setState({ kind: 'idle' });
    // Scroll back to the top of the empty state.
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }

  function onPickExample(exampleUrl: string): void {
    setUrl(exampleUrl);
  }

  async function onPickRecent(entry: RecentCheck): Promise<void> {
    // Re-runs the check against the same URL so the user gets the latest score.
    setUrl(entry.url);
    if (state.kind === 'submitting' || state.kind === 'polling') return;
    setAiLookupInFlight(false);
    setAiLookupError(null);
    setState({ kind: 'submitting' });
    const deviceId = await getDeviceId();
    const submission = await submitCheck(entry.url, deviceId);
    if (!submission.ok) {
      setState({ kind: 'error', message: submission.error.message });
      return;
    }
    setState({ kind: 'polling', jobId: submission.value.jobId });
    await pollUntilDone(submission.value.jobId);
  }

  async function onPasteFromClipboard(): Promise<void> {
    try {
      const text = await Clipboard.getStringAsync();
      const trimmed = text?.trim() ?? '';
      if (trimmed.length > 0) setUrl(trimmed);
    } catch {
      // Permissions on iOS are tied to the tap itself — failures are silent.
    }
  }

  async function onShareResult(job: JobResult): Promise<void> {
    if (job.overall === undefined || !job.bucket) return;
    const articleUrl = url;
    const title = job.article?.title ?? 'Article';
    const message =
      `${title} — scored ${job.overall}/100 (${bucketLabel(job.bucket)}) on CredCheck. ` +
      `Check it yourself: ${articleUrl}`;
    try {
      await Share.share({ message, url: articleUrl });
    } catch {
      // user cancelled or platform unsupported — no-op
    }
  }

  const isWorking = state.kind === 'submitting' || state.kind === 'polling';
  const polling = state.kind === 'polling' ? state.job : undefined;
  const completeJob = state.kind === 'result' && state.job.status === 'complete' ? state.job : null;
  const failedJob = state.kind === 'result' && state.job.status === 'failed' ? state.job : null;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.sageStrip} />
      <ScrollView ref={scrollRef} contentContainerStyle={styles.container}>
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
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Media literacy tips"
              onPress={onOpenMediaLiteracy}
              style={({ pressed }) => [styles.headerLinkButton, pressed && styles.pressed]}
            >
              <Text style={styles.headerLinkText}>Tips</Text>
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

        {state.kind === 'idle' && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Paste URL from clipboard"
            onPress={onPasteFromClipboard}
            style={({ pressed }) => [styles.pasteButton, pressed && styles.pressed]}
          >
            <Text style={styles.pasteButtonText}>📋 Paste from clipboard</Text>
          </Pressable>
        )}

        {state.kind === 'result' && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Start a new check"
            onPress={onReset}
            style={({ pressed }) => [styles.newCheckButton, pressed && styles.pressed]}
          >
            <Text style={styles.newCheckButtonText}>✕ New check</Text>
          </Pressable>
        )}

        <View style={styles.resultArea}>
          {state.kind === 'idle' && (
            <View style={styles.stack}>
              <HeroStatCard stat={heroStat} />
              <ExampleChips onPickExample={onPickExample} />
              <RecentChecksList items={recentChecks} onPick={onPickRecent} />
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
              <DidYouKnowCard tip={dyKnowTip} />
            </View>
          )}

          {state.kind === 'submitting' && (
            <View style={styles.card}>
              <View style={styles.inline}>
                <ActivityIndicator color={COLORS.deepTeal} />
                <Text style={styles.muted}>{loadingStage}</Text>
              </View>
            </View>
          )}

          {state.kind === 'polling' && (
            <View style={styles.stack}>
              {polling?.publisher && (
                <PublisherDetailBlock publisher={polling.publisher} onInfo={openInfo} />
              )}
              {polling?.article?.title && (
                <View style={styles.card}>
                  <SectionTitleWithInfo title="ARTICLE" onPressInfo={() => openInfo('ARTICLE')} />
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
                  <Text style={styles.muted}>{loadingStage}</Text>
                </View>
              </View>
            </View>
          )}

          {completeJob && (
            <View style={styles.stack}>
              <View style={styles.card}>
                <HeadlineBlock job={completeJob} onInfo={openInfo} />
              </View>

              {completeJob.article?.title && (
                <View style={styles.card}>
                  <SectionTitleWithInfo title="ARTICLE" onPressInfo={() => openInfo('ARTICLE')} />
                  <Text style={styles.value}>{completeJob.article.title}</Text>
                  {completeJob.article.excerpt && (
                    <Text style={styles.articleExcerpt} numberOfLines={3}>
                      {completeJob.article.excerpt}
                    </Text>
                  )}
                </View>
              )}

              <BreakdownBlock job={completeJob} onInfo={openInfo} />
              {completeJob.publisher && (
                <PublisherDetailBlock
                  publisher={completeJob.publisher}
                  onInfo={openInfo}
                  aiHandlers={{
                    jobId: completeJob.jobId,
                    inFlight: aiLookupInFlight,
                    error: aiLookupError,
                    onLookup: onLookupPublisher
                  }}
                />
              )}

              {completeJob.counterArgument && (
                <View style={styles.counterBox}>
                  <View style={styles.sectionTitleRow}>
                    <Text style={styles.counterTitle}>DEVIL'S ADVOCATE</Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="More info about DEVIL'S ADVOCATE"
                      onPress={() => openInfo("DEVIL'S ADVOCATE")}
                      hitSlop={8}
                      style={({ pressed }) => [styles.infoIcon, pressed && styles.pressed]}
                    >
                      <Text style={styles.infoIconText}>i</Text>
                    </Pressable>
                  </View>
                  <Text style={styles.counterText}>{completeJob.counterArgument}</Text>
                  <Text style={styles.counterFootnote}>
                    The strongest reason this rating could be wrong. Media-literacy tool.
                  </Text>
                </View>
              )}

              <FeedbackBlock jobId={completeJob.jobId} deviceId={feedbackDeviceId} />

              {completeJob.overall !== undefined && completeJob.bucket && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Share this result"
                  onPress={() => onShareResult(completeJob)}
                  style={({ pressed }) => [styles.shareButton, pressed && styles.pressed]}
                >
                  <Text style={styles.shareButtonText}>Share result</Text>
                </Pressable>
              )}

              {completeJob.article?.title && (
                <View style={styles.lateralCard}>
                  <Text style={styles.lateralLabel}>READ LATERALLY</Text>
                  <Text style={styles.lateralCopy}>
                    Don't trust one source alone. See what other publishers are saying:
                  </Text>
                  <Pressable
                    accessibilityRole="link"
                    accessibilityLabel="See coverage on Google News"
                    onPress={() => {
                      const q = encodeURIComponent(completeJob.article?.title ?? '');
                      Linking.openURL('https://news.google.com/search?q=' + q).catch(() => {});
                    }}
                    style={({ pressed }) => [styles.lateralButton, pressed && styles.pressed]}
                  >
                    <Text style={styles.lateralButtonText}>See coverage on Google News</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="link"
                    accessibilityLabel="Wikipedia entry"
                    onPress={() => {
                      const q = encodeURIComponent(completeJob.article?.title ?? '');
                      Linking.openURL('https://en.wikipedia.org/wiki/Special:Search?search=' + q).catch(() => {});
                    }}
                    style={({ pressed }) => [styles.lateralButton, pressed && styles.pressed]}
                  >
                    <Text style={styles.lateralButtonText}>Wikipedia entry</Text>
                  </Pressable>
                </View>
              )}

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
                <DeepAnalysisBlock deep={completeJob.deepAnalysis} onInfo={openInfo} />
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
                <Text style={styles.errorMessage}>
                  {friendlyErrorMessage(failedJob.error.message)}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={onReset}
                  style={({ pressed }) => [styles.resetLink, pressed && styles.pressed]}
                >
                  <Text style={styles.resetText}>Try another URL</Text>
                </Pressable>
              </View>
              <ExampleChips
                onPickExample={(u) => {
                  onReset();
                  setUrl(u);
                }}
                title="TRY ONE OF THESE INSTEAD"
              />
            </View>
          )}

          {state.kind === 'error' && (
            <View style={styles.stack}>
              <View style={styles.card}>
                <Text style={styles.errorTitle}>Error</Text>
                <Text style={styles.errorMessage}>{friendlyErrorMessage(state.message)}</Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={onReset}
                  style={({ pressed }) => [styles.resetLink, pressed && styles.pressed]}
                >
                  <Text style={styles.resetText}>Try again</Text>
                </Pressable>
              </View>
              <ExampleChips
                onPickExample={(u) => {
                  onReset();
                  setUrl(u);
                }}
                title="TRY ONE OF THESE INSTEAD"
              />
            </View>
          )}
        </View>
      </ScrollView>
      <InfoModal
        visible={infoOpen !== null}
        title={infoOpen ?? ''}
        copy={infoOpen ? TOOLTIPS[infoOpen] ?? null : null}
        onClose={() => setInfoOpen(null)}
      />
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
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10
  },
  infoIcon: {
    width: 22,
    height: 22,
    borderRadius: 999,
    borderWidth: 1.2,
    borderColor: COLORS.deepTealLight,
    backgroundColor: COLORS.cream,
    alignItems: 'center',
    justifyContent: 'center'
  },
  infoIconText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.deepTeal,
    lineHeight: 14,
    fontStyle: 'italic'
  },

  // ---- Tooltip modal ----
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(31, 41, 55, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20
  },
  modalCard: {
    backgroundColor: COLORS.cream,
    borderRadius: 20,
    padding: 20,
    width: '100%',
    maxWidth: 420,
    borderColor: COLORS.sageBg,
    borderWidth: 1,
    ...cardShadow
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 8
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.deepTeal,
    flexShrink: 1,
    letterSpacing: 0.4
  },
  modalClose: {
    width: 30,
    height: 30,
    borderRadius: 999,
    backgroundColor: COLORS.sageLight,
    alignItems: 'center',
    justifyContent: 'center'
  },
  modalCloseText: {
    color: COLORS.deepTeal,
    fontWeight: '700',
    fontSize: 14
  },
  modalSubLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.0,
    color: COLORS.deepTeal,
    textTransform: 'uppercase',
    marginTop: 8,
    marginBottom: 4
  },
  modalParagraph: {
    fontSize: 14,
    color: COLORS.text,
    lineHeight: 21
  },

  // ---- Read laterally card ----
  lateralCard: {
    backgroundColor: COLORS.cream,
    borderColor: COLORS.sageBg,
    borderWidth: 1,
    borderRadius: 20,
    padding: 18,
    gap: 10,
    ...cardShadow
  },
  lateralLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.deepTeal,
    letterSpacing: 1.2
  },
  lateralCopy: {
    fontSize: 14,
    color: COLORS.text,
    lineHeight: 20
  },
  lateralButton: {
    borderWidth: 1.5,
    borderColor: COLORS.deepTeal,
    borderRadius: 999,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    backgroundColor: COLORS.cream
  },
  lateralButtonText: {
    color: COLORS.deepTeal,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.2
  },

  // ---- Judge label row ----
  judgeLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6
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

  // ---- AI publisher research ----
  lookupButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    height: 40,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: COLORS.deepTealLight,
    backgroundColor: COLORS.cream,
    alignItems: 'center',
    justifyContent: 'center'
  },
  lookupButtonDisabled: {
    opacity: 0.7
  },
  lookupButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.deepTeal
  },
  lookupHint: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 8,
    lineHeight: 16
  },
  lookupError: {
    fontSize: 13,
    color: COLORS.lowSoft,
    marginTop: 8
  },
  aiResearchBox: {
    marginTop: 12,
    backgroundColor: COLORS.cream,
    borderColor: COLORS.borderSoft,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14
  },
  aiResearchLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: COLORS.deepTeal,
    marginBottom: 6
  },
  aiResearchSummary: {
    fontSize: 14,
    color: COLORS.text,
    lineHeight: 20
  },
  sentimentChip: {
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999
  },
  sentimentChipText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4
  },
  citationList: {
    marginTop: 12,
    gap: 6
  },
  citationRow: {
    paddingVertical: 6
  },
  citationTitle: {
    fontSize: 14,
    color: COLORS.deepTeal,
    fontWeight: '600'
  },
  citationUrl: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2
  },
  aiResearchFootnote: {
    fontSize: 11,
    color: COLORS.textDim,
    fontStyle: 'italic',
    marginTop: 10
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
  },

  // ---- v1.2: Hero stat card -------------------------------------------------
  heroStatCard: {
    backgroundColor: COLORS.cream,
    borderColor: COLORS.sageBg,
    borderWidth: 1,
    borderRadius: 20,
    padding: 20,
    ...cardShadow
  },
  heroStatQuoteMark: {
    fontSize: 36,
    lineHeight: 36,
    color: COLORS.deepTealLight,
    fontWeight: '800',
    marginBottom: -6
  },
  heroStatQuote: {
    fontSize: 18,
    lineHeight: 26,
    fontWeight: '600',
    color: COLORS.text
  },
  heroStatSource: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 10,
    fontStyle: 'italic'
  },

  // ---- v1.2: Try-an-example chips ------------------------------------------
  exampleChipsWrap: {
    gap: 4
  },
  exampleChipsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2
  },
  exampleChip: {
    borderWidth: 1.2,
    borderColor: COLORS.deepTeal,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: COLORS.cream
  },
  exampleChipText: {
    color: COLORS.deepTeal,
    fontSize: 13,
    fontWeight: '600'
  },

  // ---- v1.2: Did You Know card ---------------------------------------------
  didYouKnowCard: {
    backgroundColor: COLORS.sageLight,
    borderColor: COLORS.sageBg,
    borderWidth: 1,
    borderRadius: 20,
    padding: 18,
    ...cardShadow
  },
  didYouKnowText: {
    fontSize: 14,
    lineHeight: 21,
    color: COLORS.text
  },

  // ---- v1.2: Recent checks list --------------------------------------------
  recentChecksCard: {
    backgroundColor: COLORS.cream,
    borderColor: COLORS.borderSoft,
    borderWidth: 1,
    borderRadius: 20,
    padding: 18,
    ...cardShadow
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderSoft
  },
  recentRowFirst: { borderTopWidth: 0 },
  recentRowText: { flex: 1 },
  recentTitle: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '600'
  },
  recentBucket: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2
  },
  recentScorePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    minWidth: 38,
    alignItems: 'center'
  },
  recentScoreText: {
    fontSize: 14,
    fontWeight: '700'
  },

  // ---- v1.2: Paste from clipboard ------------------------------------------
  pasteButton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: COLORS.deepTealLight,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: COLORS.cream
  },
  pasteButtonText: {
    color: COLORS.deepTeal,
    fontSize: 13,
    fontWeight: '600'
  },

  // ---- v1.2: New check button ----------------------------------------------
  newCheckButton: {
    alignSelf: 'flex-end',
    borderWidth: 1,
    borderColor: COLORS.deepTealLight,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: COLORS.cream
  },
  newCheckButtonText: {
    color: COLORS.deepTeal,
    fontSize: 13,
    fontWeight: '600'
  },

  // ---- v1.2: Share button --------------------------------------------------
  shareButton: {
    alignSelf: 'flex-start',
    borderWidth: 1.5,
    borderColor: COLORS.sageBg,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
    backgroundColor: COLORS.cream
  },
  shareButtonText: {
    color: COLORS.deepTeal,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.2
  }
});
