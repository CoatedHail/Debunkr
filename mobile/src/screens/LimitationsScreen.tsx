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
  bullet: { fontSize: 14, color: '#1a1a1a', lineHeight: 22, marginBottom: 4 }
});
