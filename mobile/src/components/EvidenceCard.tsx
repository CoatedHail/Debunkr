import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import type {
  CitationSupport,
  Confidence,
  EvidenceCitation,
  EvidenceResult,
  EvidenceVerdict
} from '../types/api';

const COLLAPSED_REASONING_MAX = 120;
const COLLAPSED_CITATION_COUNT = 3;

function verdictColor(v: EvidenceVerdict): string {
  switch (v) {
    case 'corroborated':   return '#34A853';
    case 'contradicted':   return '#D93025';
    case 'mixed':          return '#F9AB00';
    case 'uncorroborated': return '#5F6368';
  }
}

function verdictLabel(v: EvidenceVerdict): string {
  switch (v) {
    case 'corroborated':   return 'Corroborated';
    case 'contradicted':   return 'Contradicted';
    case 'mixed':          return 'Mixed';
    case 'uncorroborated': return 'Uncorroborated';
  }
}

function confidenceColor(c: Confidence): string {
  switch (c) {
    case 'high':   return '#15803d';
    case 'medium': return '#b45309';
    case 'low':    return '#5f6368';
  }
}

function confidenceLabel(c: Confidence): string {
  switch (c) {
    case 'high':   return 'High confidence';
    case 'medium': return 'Medium confidence';
    case 'low':    return 'Low confidence';
  }
}

function supportColor(s: CitationSupport): string {
  switch (s) {
    case 'agrees':      return '#15803d';
    case 'contradicts': return '#b91c1c';
    case 'context':     return '#5f6368';
  }
}

function supportLabel(s: CitationSupport): string {
  switch (s) {
    case 'agrees':      return '✓ Agrees';
    case 'contradicts': return '✗ Contradicts';
    case 'context':     return '· Context';
  }
}

function truncate(s: string, max: number): { text: string; truncated: boolean } {
  if (s.length <= max) return { text: s, truncated: false };
  return { text: s.slice(0, max).trimEnd() + '…', truncated: true };
}

function CitationRow({ citation }: { citation: EvidenceCitation }) {
  const color = supportColor(citation.supports);
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => { Linking.openURL(citation.url); }}
      style={({ pressed }) => [styles.citationRow, pressed && styles.pressed]}
    >
      <View style={styles.citationHeader}>
        <View style={styles.publisherChip}>
          <Text style={styles.publisherChipText}>{citation.source}</Text>
        </View>
        <Text style={[styles.supportTag, { color }]}>{supportLabel(citation.supports)}</Text>
      </View>
      <Text style={styles.snippet}>{citation.snippet}</Text>
    </Pressable>
  );
}

export interface EvidenceCardProps {
  evidence: EvidenceResult;
}

export function EvidenceCard({ evidence }: EvidenceCardProps) {
  const [reasoningExpanded, setReasoningExpanded] = useState(false);
  const [allCitations, setAllCitations] = useState(false);

  const vColor = verdictColor(evidence.verdict);
  const cColor = confidenceColor(evidence.confidence);

  const { text: reasoningPreview, truncated: reasoningTruncated } =
    truncate(evidence.reasoning, COLLAPSED_REASONING_MAX);
  const reasoningText = reasoningExpanded ? evidence.reasoning : reasoningPreview;

  const citations = evidence.citations;
  const hasMore = citations.length > COLLAPSED_CITATION_COUNT;
  const visibleCitations = allCitations ? citations : citations.slice(0, COLLAPSED_CITATION_COUNT);

  return (
    <View style={styles.card}>
      <Text style={styles.header}>External Evidence</Text>

      <View style={styles.topRow}>
        <View style={[styles.verdictBadge, { backgroundColor: vColor }]}>
          <Text style={styles.verdictBadgeText}>{verdictLabel(evidence.verdict)}</Text>
        </View>
        <View style={[styles.confidenceChip, { borderColor: cColor }]}>
          <Text style={[styles.confidenceChipText, { color: cColor }]}>
            {confidenceLabel(evidence.confidence)}
          </Text>
        </View>
      </View>

      <Pressable
        onPress={() => reasoningTruncated && setReasoningExpanded(!reasoningExpanded)}
        disabled={!reasoningTruncated}
      >
        <Text style={styles.reasoning}>{reasoningText}</Text>
        {reasoningTruncated && (
          <Text style={styles.expandHint}>
            {reasoningExpanded ? 'Show less' : 'Show more'}
          </Text>
        )}
      </Pressable>

      <Text style={styles.sectionLabel}>Citations</Text>
      {citations.length === 0 ? (
        <Text style={styles.empty}>No citations were collected for these claims.</Text>
      ) : (
        <View>
          {visibleCitations.map((c, i) => (
            <CitationRow key={i} citation={c} />
          ))}
          {hasMore && (
            <Pressable
              onPress={() => setAllCitations(!allCitations)}
              style={({ pressed }) => [styles.showMore, pressed && styles.pressed]}
            >
              <Text style={styles.showMoreText}>
                {allCitations
                  ? 'Show fewer'
                  : `Show more (${citations.length - COLLAPSED_CITATION_COUNT})`}
              </Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderColor: '#c4b5fd',
    borderWidth: 1,
    borderRadius: 6,
    padding: 10,
    marginTop: 6,
    marginBottom: 8
  },
  header: {
    fontSize: 12,
    fontWeight: '700',
    color: '#5b21b6',
    textTransform: 'uppercase',
    marginBottom: 8
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap'
  },
  verdictBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    alignSelf: 'flex-start'
  },
  verdictBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700'
  },
  confidenceChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: 'flex-start'
  },
  confidenceChipText: {
    fontSize: 10,
    fontWeight: '700'
  },
  reasoning: {
    fontSize: 14,
    color: '#1a1a1a',
    marginTop: 10,
    lineHeight: 20
  },
  expandHint: {
    fontSize: 12,
    color: '#2563eb',
    fontWeight: '500',
    marginTop: 4
  },
  sectionLabel: {
    color: '#5f6368',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginTop: 12,
    marginBottom: 4
  },
  empty: {
    fontSize: 13,
    color: '#5f6368',
    fontStyle: 'italic'
  },
  citationRow: {
    backgroundColor: '#fafaf7',
    borderColor: '#e6e3dc',
    borderWidth: 1,
    borderRadius: 6,
    padding: 10,
    marginTop: 6
  },
  citationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 4
  },
  publisherChip: {
    backgroundColor: '#f5f3ff',
    borderColor: '#c4b5fd',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    flexShrink: 1
  },
  publisherChipText: {
    fontSize: 11,
    color: '#5b21b6',
    fontWeight: '600'
  },
  supportTag: {
    fontSize: 11,
    fontWeight: '700'
  },
  snippet: {
    fontSize: 13,
    color: '#1a1a1a',
    lineHeight: 18
  },
  showMore: {
    marginTop: 8,
    alignSelf: 'flex-start'
  },
  showMoreText: {
    fontSize: 12,
    color: '#2563eb',
    fontWeight: '600'
  },
  pressed: {
    opacity: 0.7
  }
});
