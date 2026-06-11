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

        <Text style={styles.h2}>The overall score</Text>
        <Text style={styles.p}>
          Overall = 0.45 × Publisher reputation + 0.45 × Article content quality + 0.10 × Bias adjustment.
          The bias adjustment is a small penalty for extreme political lean
          (either direction); bias itself isn't "wrong" but extreme lean
          correlates with selective reporting.
        </Text>

        <Text style={styles.h2}>Publisher reputation</Text>
        <Text style={styles.p}>
          Pulled from our curated list (~30 publishers, hand-picked from
          Wikipedia's Perennial Sources editor consensus) plus the IFCN
          signatory list of certified fact-checkers. If we don't recognize
          the publisher, we fall back to article-level signals (HTTPS, byline
          present, article length, extracted publisher name). Fallback scores
          are bounded 30–60 and the confidence indicator drops to "low".
        </Text>

        <Text style={styles.h2}>Content quality + bias + counter-argument</Text>
        <Text style={styles.p}>
          All three come from a single call to Claude (an AI model from
          Anthropic). The model reads the article and returns: a 0–100
          quality score, a –5 to +5 bias estimate (LLM-estimated, low
          confidence on its own), and the strongest argument that the
          rating could be wrong. The counter-argument is always shown
          because it trains media literacy.
        </Text>

        <Text style={styles.h2}>Deep Analysis (opt-in)</Text>
        <Text style={styles.p}>
          The "Run Deep Analysis" button on a result spawns three more
          Claude calls in sequence: a SKEPTIC searching for every reason
          to distrust the article, an ADVOCATE searching for every reason
          to trust it, and a JUDGE weighing both reports and returning a
          final verdict. Each agent cites specific evidence from the
          article. Costs ~3-5× a normal check and takes ~10-20s.
        </Text>
        <Text style={styles.p}>
          KNOWN LIMITATION: in V1 all three agents are the same model
          family (Claude), so they share underlying biases. A future
          update will mix model families for genuine bias reduction.
        </Text>

        <Text style={styles.h2}>How we fact-check claims (Deep Analysis only)</Text>
        <Text style={styles.p}>
          During Deep Analysis we also run a five-stage fact-check pipeline:
        </Text>
        <Text style={styles.p}>
          1. An LLM extracts up to 3 verifiable factual claims from the
          article (numbers, named events, quotes — not opinions).{'\n'}
          2. We query the Google Fact Check Tools API, which aggregates
          fact-checks from PolitiFact, Snopes, AFP Fact Check, Reuters
          Fact Check, and dozens of other IFCN-signatory outlets.{'\n'}
          3. We search the open web via Brave Search and keep only
          results from a hand-curated list of ~30 Tier-1 publishers
          (Reuters, AP, BBC, NYT, etc.) — everything else is discarded.{'\n'}
          4. Named entities (people, organizations, events) are checked
          against Wikipedia to catch fabricated names.{'\n'}
          5. A second LLM call synthesizes all the evidence into a
          per-claim verdict (corroborated / contradicted / uncorroborated
          / mixed) and adjusts the article's overall score by up to ±30
          points.
        </Text>

        <Text style={styles.h2}>Confidence</Text>
        <Text style={styles.p}>
          • High — publisher in 2+ datasets AND article successfully read.{'\n'}
          • Medium — 1 dataset, OR datasets known but article couldn't be read.{'\n'}
          • Low — unknown publisher (cheap-signals fallback).{'\n'}
          Computed by deterministic rules, not LLM judgment, so it's
          consistent across calls.
        </Text>

        <Text style={styles.h2}>What we don't do yet</Text>
        <Text style={styles.p}>
          No caching, no rate limit, no real bias dataset (AllSides license
          pending), no domain-age WHOIS lookup. All deferred to M6.
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
  safe: { flex: 1, backgroundColor: '#F7F4EC' },
  container: { padding: 20, gap: 8 },
  back: { paddingVertical: 6 },
  backText: { color: '#2F6B5C', fontWeight: '600' },
  title: { fontSize: 26, fontWeight: '800', marginTop: 8, color: '#2F6B5C', letterSpacing: -0.3 },
  subtitle: { fontSize: 13, color: '#6B7280', marginBottom: 12, fontStyle: 'italic' },
  h2: { fontSize: 16, fontWeight: '700', marginTop: 16, marginBottom: 4, color: '#1F2937' },
  p: { fontSize: 14, color: '#1F2937', lineHeight: 22 }
});
