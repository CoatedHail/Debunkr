import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';

export interface MediaLiteracyScreenProps {
  onBack: () => void;
}

interface TipCard {
  title: string;
  body: string;
}

const SIFT_CARDS: TipCard[] = [
  {
    title: 'Stop',
    body:
      'When a story makes you feel strong emotion, pause. Strong emotion is the most common trigger for sharing misinformation. Don\'t engage until you\'ve checked.'
  },
  {
    title: 'Investigate the source',
    body:
      "Open a new tab. Search '[publisher name] Wikipedia' or '[publisher name] reliability'. Don't rely only on the site's About page."
  },
  {
    title: 'Find better coverage',
    body:
      'Search the same story across multiple sources. If only one publisher is reporting a major event, that\'s a red flag. If reliable sources contradict it, trust them.'
  },
  {
    title: 'Trace the original',
    body:
      'Most news articles are about something — a study, a statement, an event. Find the primary source. Quotes can be cropped. Statistics can be misrepresented. Go upstream when you can.'
  }
];

const TACTIC_CARDS: TipCard[] = [
  {
    title: 'Loaded language',
    body:
      "Words that smuggle in opinion. 'Bombshell report' vs 'investigation finds'. Read the same story in two outlets and compare the verbs."
  },
  {
    title: 'False equivalence',
    body:
      "Treating a major scandal and a minor mistake as 'both sides did something wrong'. Look for where the article downplays a significant difference."
  },
  {
    title: 'Cherry-picked statistics',
    body:
      'Picking the one statistic that supports the argument while ignoring the rest. Ask: was this the only data point available? What was the trend over time?'
  },
  {
    title: 'Anonymous sources',
    body:
      'Sometimes necessary (whistleblowers). Often a red flag (no accountability). The most reliable articles cite named people you can verify.'
  },
  {
    title: 'Image and video out of context',
    body:
      'A real photo from a different event. A real quote cropped to remove qualifiers. Reverse-image-search and check timestamps.'
  },
  {
    title: 'Headline ≠ article',
    body:
      'Many readers share based on headline alone. The headline often overpromises what the article actually proves. Read the body, especially the middle.'
  }
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
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Pressable onPress={onBack} style={styles.back}>
          <Text style={styles.backText}>← Back</Text>
        </Pressable>

        <Text style={styles.title}>Media literacy</Text>
        <Text style={styles.subtitle}>Skills for spotting bad info — not just our rating.</Text>

        <Text style={styles.sectionHeader}>THE SIFT METHOD</Text>
        <View style={styles.introCard}>
          <Text style={styles.introText}>
            Four moves you can run on any article in under a minute. Build the habit and you'll
            catch most misinformation before it sticks.
          </Text>
        </View>

        {SIFT_CARDS.map((c, i) => (
          <TipCardView key={c.title} index={i + 1} title={c.title} body={c.body} />
        ))}

        <Text style={styles.footnote}>
          SIFT is the most-evidenced media-literacy framework, developed by Mike Caulfield. Used
          widely in journalism schools.
        </Text>

        <Text style={[styles.sectionHeader, { marginTop: 24 }]}>COMMON MANIPULATION TACTICS</Text>
        <View style={styles.introCard}>
          <Text style={styles.introText}>Once you know these, you'll see them everywhere.</Text>
        </View>

        {TACTIC_CARDS.map((c, i) => (
          <TipCardView key={c.title} index={i + 1} title={c.title} body={c.body} />
        ))}

        <Text style={styles.disclaimer}>
          Sift is a tool for media literacy practice — it doesn't replace your own judgment.
          The skills above work even when our score is wrong.
        </Text>
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
