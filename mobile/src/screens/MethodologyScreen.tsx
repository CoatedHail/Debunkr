import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';

export interface MethodologyScreenProps {
  onBack: () => void;
}

export function MethodologyScreen({ onBack }: MethodologyScreenProps) {
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Pressable onPress={onBack} style={styles.back}>
          <Text style={styles.backText}>← Back</Text>
        </Pressable>

        <Text style={styles.title}>How this works</Text>
        <Text style={styles.subtitle}>Stub content — final wording lands at launch (M7).</Text>

        <Text style={styles.h2}>What we do</Text>
        <Text style={styles.p}>
          When you paste a URL, our backend downloads the article and asks
          Claude (an AI model from Anthropic) to evaluate the writing for
          sourcing, tone, logic, and hedging. The score is an opinion based
          on the words in the article. It is not a statement of fact about
          the publisher.
        </Text>

        <Text style={styles.h2}>What we do not do yet (V1)</Text>
        <Text style={styles.p}>
          We do not yet check publisher reputation against rating databases,
          compute combined source/content/bias scores, run multi-perspective
          AI debate, or detect publication updates. Those land in later
          updates (M3–M6).
        </Text>

        <Text style={styles.h2}>Sources we plan to use (M3+)</Text>
        <Text style={styles.p}>
          AllSides (if license permits), a hand-curated reliability list
          derived from Wikipedia's Perennial Sources, and the IFCN signatory
          list. All ratings will be attributed to their sources, not
          presented as our opinion.
        </Text>

        <Text style={styles.h2}>Feedback</Text>
        <Text style={styles.p}>
          A 👍/👎 widget is coming in M6. For now, errors and bad ratings
          can be reported to the developer directly.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fafaf7' },
  container: { padding: 20, gap: 8 },
  back: { paddingVertical: 6 },
  backText: { color: '#2563eb', fontWeight: '600' },
  title: { fontSize: 26, fontWeight: '700', marginTop: 8 },
  subtitle: { fontSize: 12, color: '#5f6368', marginBottom: 12, fontStyle: 'italic' },
  h2: { fontSize: 16, fontWeight: '700', marginTop: 16, marginBottom: 4 },
  p: { fontSize: 14, color: '#1a1a1a', lineHeight: 20 }
});
