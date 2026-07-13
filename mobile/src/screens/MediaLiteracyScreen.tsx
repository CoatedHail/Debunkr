import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { t } from '../lib/i18n';

export interface MediaLiteracyScreenProps {
  onBack: () => void;
}

interface TipCard {
  title: string;
  body: string;
}

// Keys are looked up at render time so a language switch flows through
// without re-instantiating anything at module scope.
const SIFT_KEY_PAIRS: [string, string][] = [
  ['mediaLit.sift.stopTitle',         'mediaLit.sift.stopBody'],
  ['mediaLit.sift.investigateTitle',  'mediaLit.sift.investigateBody'],
  ['mediaLit.sift.findTitle',         'mediaLit.sift.findBody'],
  ['mediaLit.sift.traceTitle',        'mediaLit.sift.traceBody']
];

const TACTIC_KEY_PAIRS: [string, string][] = [
  ['mediaLit.tactics.loadedTitle',    'mediaLit.tactics.loadedBody'],
  ['mediaLit.tactics.falseEqTitle',   'mediaLit.tactics.falseEqBody'],
  ['mediaLit.tactics.cherryTitle',    'mediaLit.tactics.cherryBody'],
  ['mediaLit.tactics.anonTitle',      'mediaLit.tactics.anonBody'],
  ['mediaLit.tactics.imageTitle',     'mediaLit.tactics.imageBody'],
  ['mediaLit.tactics.headlineTitle',  'mediaLit.tactics.headlineBody']
];

function TipCardView({ index, title, body }: { index: number; title: string; body: string }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.numberBadge}>
          <Text style={styles.numberBadgeText}>{index}</Text>
        </View>
        <Text style={styles.cardTitle}>{title}</Text>
      </View>
      <Text style={styles.cardBody}>{body}</Text>
    </View>
  );
}

export function MediaLiteracyScreen({ onBack }: MediaLiteracyScreenProps) {
  const siftCards: TipCard[] = SIFT_KEY_PAIRS.map(([tk, bk]) => ({ title: t(tk), body: t(bk) }));
  const tacticCards: TipCard[] = TACTIC_KEY_PAIRS.map(([tk, bk]) => ({ title: t(tk), body: t(bk) }));

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Pressable onPress={onBack} style={styles.back}>
          <Text style={styles.backText}>{t('mediaLit.back')}</Text>
        </Pressable>

        <Text style={styles.title}>{t('mediaLit.title')}</Text>
        <Text style={styles.subtitle}>{t('mediaLit.subtitle')}</Text>

        <Text style={styles.sectionHeader}>{t('mediaLit.siftHeader')}</Text>
        <View style={styles.introCard}>
          <Text style={styles.introText}>{t('mediaLit.siftIntro')}</Text>
        </View>

        {siftCards.map((c, i) => (
          <TipCardView key={c.title} index={i + 1} title={c.title} body={c.body} />
        ))}

        <Text style={styles.footnote}>{t('mediaLit.siftFootnote')}</Text>

        <Text style={[styles.sectionHeader, { marginTop: 24 }]}>{t('mediaLit.tacticsHeader')}</Text>
        <View style={styles.introCard}>
          <Text style={styles.introText}>{t('mediaLit.tacticsIntro')}</Text>
        </View>

        {tacticCards.map((c, i) => (
          <TipCardView key={c.title} index={i + 1} title={c.title} body={c.body} />
        ))}

        <Text style={styles.disclaimer}>{t('mediaLit.disclaimer')}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const COLORS = {
  pageBg: '#F7F4EC',
  cream: '#FAF4E6',
  deepTeal: '#2F6B5C',
  deepTealLight: '#4A8A78',
  sageLight: '#D7EAD9',
  sageBg: '#A8D5BA',
  text: '#1F2937',
  textMuted: '#6B7280',
  borderSoft: '#EFE9DC'
};

const cardShadow = {
  shadowColor: '#1F2937',
  shadowOpacity: 0.06,
  shadowOffset: { width: 0, height: 2 },
  shadowRadius: 8,
  elevation: 2
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.pageBg },
  container: { padding: 20, gap: 12 },
  back: { paddingVertical: 6 },
  backText: { color: COLORS.deepTeal, fontWeight: '600' },
  title: {
    fontSize: 26,
    fontWeight: '800',
    marginTop: 8,
    color: COLORS.deepTeal,
    letterSpacing: -0.3
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginBottom: 8,
    fontStyle: 'italic'
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.deepTeal,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginTop: 12,
    marginBottom: 4
  },
  introCard: {
    backgroundColor: COLORS.sageLight,
    borderColor: COLORS.sageBg,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14
  },
  introText: {
    fontSize: 14,
    color: COLORS.text,
    lineHeight: 20
  },
  card: {
    backgroundColor: COLORS.cream,
    borderColor: COLORS.borderSoft,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    ...cardShadow
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6
  },
  numberBadge: {
    width: 26,
    height: 26,
    borderRadius: 999,
    backgroundColor: COLORS.deepTeal,
    alignItems: 'center',
    justifyContent: 'center'
  },
  numberBadgeText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.deepTeal,
    flexShrink: 1
  },
  cardBody: {
    fontSize: 14,
    color: COLORS.text,
    lineHeight: 21
  },
  footnote: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontStyle: 'italic',
    lineHeight: 18,
    marginTop: 6
  },
  disclaimer: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontStyle: 'italic',
    lineHeight: 18,
    marginTop: 16,
    marginBottom: 8
  }
});
