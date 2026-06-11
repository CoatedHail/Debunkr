import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text
} from 'react-native';

export interface LimitationsScreenProps {
  onBack: () => void;
}

export function LimitationsScreen({ onBack }: LimitationsScreenProps) {
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Pressable onPress={onBack} style={styles.back}>
          <Text style={styles.backText}>← Back</Text>
        </Pressable>

        <Text style={styles.title}>Limitations</Text>
        <Text style={styles.subtitle}>Stub content — final wording lands at launch (M7).</Text>

        <Text style={styles.bullet}>• AI analysis. Output may contain errors. Treat as a starting point, not a verdict.</Text>
        <Text style={styles.bullet}>• Paywalled or JavaScript-only articles often can not be read by the backend. Confidence drops or the check fails.</Text>
        <Text style={styles.bullet}>• Breaking news. A single article in isolation is hard to judge; cross-reference matters.</Text>
        <Text style={styles.bullet}>• Satire. We do not yet detect satire — sites like The Onion may be rated as low credibility.</Text>
        <Text style={styles.bullet}>• Opinion vs reporting. The score evaluates writing quality, not whether you should agree with the opinion.</Text>
        <Text style={styles.bullet}>• V1 has no publisher database yet. Source reputation lands in a later update.</Text>
        <Text style={styles.bullet}>• V1 has no real bias rating yet. That lands in a later update.</Text>
        <Text style={styles.bullet}>• We do not store or share the URLs you check. They live only on your device's local history.</Text>
        <Text style={styles.bullet}>• Fact-checking is English-only. Non-English articles are checked weakly or not at all.</Text>
        <Text style={styles.bullet}>• Breaking news (less than 24 hours old) often has no fact-check or Tier-1 coverage yet. We will say "uncorroborated" rather than guess.</Text>
        <Text style={styles.bullet}>• Fabricated entities slip through if they are not yet on Wikipedia — and some real people aren't on Wikipedia either, so this is not perfect.</Text>
        <Text style={styles.bullet}>• Our Tier-1 publisher list is hand-picked and skews US/UK English-language. Quality sources in other regions may not be reflected.</Text>
        <Text style={styles.bullet}>• The aggregator LLM can hallucinate citations. We cap citation count at 5 and require URLs come from the actual search results, but errors are still possible.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F7F4EC' },
  container: { padding: 20, gap: 8 },
  back: { paddingVertical: 6 },
  backText: { color: '#2F6B5C', fontWeight: '600' },
  title: { fontSize: 26, fontWeight: '800', marginTop: 8, color: '#2F6B5C', letterSpacing: -0.3 },
  subtitle: { fontSize: 13, color: '#6B7280', marginBottom: 12, fontStyle: 'italic' },
  bullet: { fontSize: 14, color: '#1F2937', lineHeight: 22, marginBottom: 4 }
});
