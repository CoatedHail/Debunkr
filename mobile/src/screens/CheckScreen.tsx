import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { submitCheck, getJob } from '../api/client';
import { getDeviceId } from '../lib/device-id';
import type { JobResult } from '../types/api';

type ScreenState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'polling'; jobId: string; job?: JobResult }
  | { kind: 'result'; job: JobResult }
  | { kind: 'error'; message: string };

const POLL_INTERVAL_MS = 1000;
const POLL_MAX_ATTEMPTS = 30;

export interface CheckScreenProps {
  onOpenMethodology: () => void;
  onOpenLimitations: () => void;
}

function scoreColor(score: number): string {
  if (score >= 70) return '#15803d';
  if (score >= 40) return '#b45309';
  return '#b91c1c';
}

function scoreLabel(score: number): string {
  if (score >= 80) return 'Highly credible';
  if (score >= 60) return 'Mostly credible';
  if (score >= 40) return 'Mixed';
  if (score >= 20) return 'Questionable';
  return 'Low credibility';
}

export function CheckScreen({ onOpenMethodology, onOpenLimitations }: CheckScreenProps) {
  const [url, setUrl] = useState('');
  const [state, setState] = useState<ScreenState>({ kind: 'idle' });

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

  async function onSubmit() {
    if (!url.trim()) return;
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

  function onReset() {
    setUrl('');
    setState({ kind: 'idle' });
  }

  const isWorking = state.kind === 'submitting' || state.kind === 'polling';
  const polling = state.kind === 'polling' ? state.job : undefined;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Credibility Check</Text>
        <Text style={styles.subtitle}>Paste an article URL.</Text>

        <TextInput
          style={styles.input}
          placeholder="https://example.com/article"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          value={url}
          onChangeText={setUrl}
          editable={!isWorking}
        />

        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.button,
            pressed && styles.buttonPressed,
            isWorking && styles.buttonDisabled
          ]}
          disabled={isWorking}
          onPress={onSubmit}
        >
          <Text style={styles.buttonText}>Check</Text>
        </Pressable>

        <View style={styles.resultBox}>
          {state.kind === 'idle' && <Text style={styles.muted}>Awaiting a URL.</Text>}

          {state.kind === 'submitting' && (
            <View style={styles.inline}>
              <ActivityIndicator />
              <Text style={styles.muted}>Submitting…</Text>
            </View>
          )}

          {state.kind === 'polling' && (
            <View>
              {polling?.article?.title ? (
                <>
                  <Text style={styles.label}>Article</Text>
                  <Text style={styles.value}>{polling.article.title}</Text>
                  {polling.article.siteName && (
                    <Text style={styles.muted}>{polling.article.siteName}</Text>
                  )}
                </>
              ) : null}
              <View style={[styles.inline, { marginTop: 12 }]}>
                <ActivityIndicator />
                <Text style={styles.muted}>Analyzing…</Text>
              </View>
            </View>
          )}

          {state.kind === 'result' && state.job.status === 'complete' && state.job.contentQuality !== undefined && (
            <View>
              {state.job.article?.title && (
                <>
                  <Text style={styles.label}>Article</Text>
                  <Text style={styles.value}>{state.job.article.title}</Text>
                  {state.job.article.siteName && (
                    <Text style={styles.muted}>{state.job.article.siteName}</Text>
                  )}
                </>
              )}

              <Text style={[styles.label, { marginTop: 16 }]}>Content quality</Text>
              <View style={styles.inline}>
                <Text style={[styles.score, { color: scoreColor(state.job.contentQuality) }]}>
                  {state.job.contentQuality}
                </Text>
                <Text style={[styles.scoreLabel, { color: scoreColor(state.job.contentQuality) }]}>
                  {scoreLabel(state.job.contentQuality)}
                </Text>
              </View>

              {state.job.contentReasoning && (
                <>
                  <Text style={[styles.label, { marginTop: 12 }]}>AI reasoning</Text>
                  <Text style={styles.value}>{state.job.contentReasoning}</Text>
                </>
              )}

              <Text style={[styles.disclaimer, { marginTop: 16 }]}>
                AI-generated analysis. May contain errors. Source reputation and combined scoring land in later updates.
              </Text>

              <View style={styles.linkRow}>
                <Pressable onPress={onOpenMethodology}><Text style={styles.link}>How this works</Text></Pressable>
                <Pressable onPress={onOpenLimitations}><Text style={styles.link}>Limitations</Text></Pressable>
              </View>

              <Pressable onPress={onReset} style={styles.resetLink}>
                <Text style={styles.resetText}>Check another URL</Text>
              </Pressable>
            </View>
          )}

          {state.kind === 'result' && state.job.status === 'failed' && state.job.error && (
            <View>
              <Text style={styles.errorTitle}>Couldn't analyze this URL</Text>
              <Text style={styles.errorMessage}>{state.job.error.message}</Text>
              <Pressable onPress={onReset} style={styles.resetLink}>
                <Text style={styles.resetText}>Try another URL</Text>
              </Pressable>
            </View>
          )}

          {state.kind === 'error' && (
            <View>
              <Text style={styles.errorTitle}>Error</Text>
              <Text style={styles.errorMessage}>{state.message}</Text>
              <Pressable onPress={onReset} style={styles.resetLink}>
                <Text style={styles.resetText}>Try again</Text>
              </Pressable>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fafaf7' },
  container: { padding: 20, gap: 12 },
  title: { fontSize: 28, fontWeight: '700' },
  subtitle: { fontSize: 14, color: '#5f6368', marginBottom: 8 },
  input: {
    backgroundColor: '#fff', borderColor: '#e6e3dc', borderWidth: 1,
    borderRadius: 8, padding: 12, fontSize: 16
  },
  button: { backgroundColor: '#2563eb', borderRadius: 8, padding: 14, alignItems: 'center' },
  buttonPressed: { opacity: 0.85 },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  resultBox: {
    backgroundColor: '#fff', borderColor: '#e6e3dc', borderWidth: 1,
    borderRadius: 8, padding: 16, marginTop: 8
  },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  muted: { color: '#5f6368' },
  label: { color: '#5f6368', fontSize: 12, textTransform: 'uppercase', marginTop: 8 },
  value: { fontSize: 16, color: '#1a1a1a' },
  score: { fontSize: 40, fontWeight: '700' },
  scoreLabel: { fontSize: 16, fontWeight: '600' },
  disclaimer: { fontSize: 12, color: '#5f6368', fontStyle: 'italic' },
  linkRow: { flexDirection: 'row', gap: 18, marginTop: 8 },
  link: { color: '#2563eb', fontWeight: '500' },
  errorTitle: { color: '#b91c1c', fontWeight: '600', marginBottom: 4 },
  errorMessage: { color: '#1a1a1a' },
  resetLink: { marginTop: 16 },
  resetText: { color: '#2563eb', fontWeight: '600' }
});
