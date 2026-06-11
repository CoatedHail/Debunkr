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

// Match the CheckScreen brand palette.
const COLORS = {
  sageBg:        '#A8D5BA',
  sageLight:     '#D7EAD9',
  cream:         '#FAF4E6',
  deepTeal:      '#2F6B5C',
  deepTealLight: '#4A8A78',
  high:          '#3FA66B',
  mediumWarm:    '#E89B4C',
  lowSoft:       '#D26464',
  text:          '#1F2937',
  textMuted:     '#6B7280',
  textDim:       '#9CA3AF',
  borderSoft:    '#EFE9DC',
  white:         '#FFFFFF'
};

function verdictColor(v: EvidenceVerdict): string {
  switch (v) {
    case 'corroborated':   return COLORS.high;
    case 'contradicted':   return COLORS.lowSoft;
    case 'mixed':          return COLORS.mediumWarm;
    case 'uncorroborated': return COLORS.textMuted;
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
    case 'high':   return COLORS.high;
    case 'medium': return COLORS.mediumWarm;
    case 'low':    return COLORS.textMuted;
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
    case 'agrees':      return COLORS.high;
    case 'contradicts': return COLORS.lowSoft;
    case 'context':     return COLORS.textMuted;
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
      accessibilityLabel={`Open citation from ${citation.source}`}
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
      <Text style={styles.header}>EXTERNAL EVIDENCE</Text>

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

      <Text style={styles.sectionLabel}>CITATIONS</Text>
      {citations.length === 0 ? (
        <Text style={styles.empty}>No citations were collected for these claims.</Text>
      ) : (
        <View>
          {visibleCitations.map((c, i) => (
            <CitationRow key={i} citation={c} />
          ))}
          {hasMore && (
            <Pressable
              accessibilityRole="button"
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

const cardShadow = {
  shadowColor: '#1F2937',
  shadowOpacity: 0.06,
  shadowOffset: { width: 0, height: 2 },
  shadowRadius: 8,
  elevation: 2
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.white,
    borderColor: COLORS.borderSoft,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginTop: 10,
    marginBottom: 4,
    ...cardShadow
  },
  header: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMuted,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 10
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap'
  },
  verdictBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    alignSelf: 'flex-start'
  },
  verdictBadgeText: {
    color: COLORS.white,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3
  },
  confidenceChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    alignSelf: 'flex-start',
    backgroundColor: COLORS.white
  },
  confidenceChipText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4
  },
  reasoning: {
    fontSize: 15,
    color: COLORS.text,
    marginTop: 12,
    lineHeight: 22
  },
  expandHint: {
    fontSize: 13,
    color: COLORS.deepTeal,
    fontWeight: '600',
    marginTop: 6
  },
  sectionLabel: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginTop: 16,
    marginBottom: 6
  },
  empty: {
    fontSize: 14,
    color: COLORS.textMuted,
    fontStyle: 'italic'
  },
  citationRow: {
    backgroundColor: COLORS.cream,
    borderColor: COLORS.borderSoft,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginTop: 8
  },
  citationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 6
  },
  publisherChip: {
    backgroundColor: COLORS.sageLight,
    borderColor: COLORS.sageBg,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    flexShrink: 1
  },
  publisherChipText: {
    fontSize: 11,
    color: COLORS.deepTeal,
    fontWeight: '700',
    letterSpacing: 0.3
  },
  supportTag: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3
  },
  snippet: {
    fontSize: 14,
    color: COLORS.text,
    lineHeight: 20
  },
  showMore: {
    marginTop: 10,
    alignSelf: 'flex-start'
  },
  showMoreText: {
    fontSize: 13,
    color: COLORS.deepTeal,
    fontWeight: '600'
  },
  pressed: {
    opacity: 0.7
  }
});
