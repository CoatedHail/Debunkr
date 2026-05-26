import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text
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
          When you paste a URL, our backend (1) identifies the publisher
          from the domain, (2) looks the publisher up in a curated reliability
          list and the IFCN signatory list, then (3) downloads the article
          and asks Claude (an AI model from Anthropic) to evaluate the writing
          for sourcing, tone, logic, and hedging. You see both the publisher
          tier and the article-level AI score, with their sources attributed.
        </Text>

        <Text style={styles.h2}>Sources we use today</Text>
        <Text style={styles.p}>
          • Curated reliability list — ~30 publishers, hand-picked from
          Wikipedia's Perennial Sources editor consensus. We commit the list
          to the codebase so you can see exactly what we have.{'\n'}
          • IFCN signatory list — fact-checking organizations certified by
          the International Fact-Checking Network at Poynter.{'\n'}
          • Article content — sent to Claude (Haiku 4.5 by default) for
          writing-quality analysis.
        </Text>

        <Text style={styles.h2}>What we do not do yet</Text>
        <Text style={styles.p}>
          We do not yet compute a single combined score, surface a
          confidence indicator, show the strongest counter-argument, or run
          multi-perspective AI debate. Those land in M4 and M5.
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
