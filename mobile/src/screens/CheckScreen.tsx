import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
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
  | { kind: 'polling'; jobId: string }
  | { kind: 'result'; job: JobResult }
  | { kind: 'error'; message: string };

const POLL_INTERVAL_MS = 1000;
const POLL_MAX_ATTEMPTS = 30;

export function CheckScreen() {
  const [url, setUrl] = useState('');
  const [state, setState] = useState<ScreenState>({ kind: 'idle' });

  async function pollUntilComplete(jobId: string): Promise<void> {
    for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
      const result = await getJob(jobId);
      if (!result.ok) {
        setState({ kind: 'error', message: result.error.message });
        return;
      }
      if (result.value.status === 'complete') {
        setState({ kind: 'result', job: result.value });
        return;
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
    setState({ kind: 'error', message: 'Timed out waiting for result.' });
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
    await pollUntilComplete(submission.value.jobId);
  }

  function onReset() {
    setUrl('');
    setState({ kind: 'idle' });
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>Credibility Check</Text>
        <Text style={styles.subtitle}>
          M1 — paste a URL, see the backend echo it back.
        </Text>

        <TextInput
          style={styles.input}
          placeholder="https://example.com/article"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          value={url}
          onChangeText={setUrl}
          editable={state.kind === 'idle' || state.kind === 'error'}
        />

        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.button,
            pressed && styles.buttonPressed,
            (state.kind === 'submitting' || state.kind === 'polling') &&
              styles.buttonDisabled
          ]}
          disabled={state.kind === 'submitting' || state.kind === 'polling'}
          onPress={onSubmit}
        >
          <Text style={styles.buttonText}>Check</Text>
        </Pressable>

        <View style={styles.resultBox}>
          {state.kind === 'idle' && (
            <Text style={styles.muted}>Awaiting a URL.</Text>
          )}
          {(state.kind === 'submitting' || state.kind === 'polling') && (
            <View style={styles.inline}>
              <ActivityIndicator />
              <Text style={styles.muted}>
                {state.kind === 'submitting'
                  ? 'Submitting…'
                  : `Polling jobId ${state.jobId.slice(0, 8)}…`}
              </Text>
            </View>
          )}
          {state.kind === 'result' && (
            <View>
              <Text style={styles.label}>Status</Text>
              <Text style={styles.value}>{state.job.status}</Text>
              <Text style={styles.label}>Echo (M1)</Text>
              <Text style={styles.value}>{state.job.echo}</Text>
              <Pressable onPress={onReset} style={styles.resetLink}>
                <Text style={styles.resetText}>Check another URL</Text>
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
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fafaf7' },
  container: { padding: 20, gap: 12 },
  title: { fontSize: 28, fontWeight: '700' },
  subtitle: { fontSize: 14, color: '#5f6368', marginBottom: 8 },
  input: {
    backgroundColor: '#fff',
    borderColor: '#e6e3dc',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16
  },
  button: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center'
  },
  buttonPressed: { opacity: 0.85 },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  resultBox: {
    backgroundColor: '#fff',
    borderColor: '#e6e3dc',
    borderWidth: 1,
    borderRadius: 8,
    padding: 16,
    marginTop: 8
  },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  muted: { color: '#5f6368' },
  label: {
    color: '#5f6368',
    fontSize: 12,
    textTransform: 'uppercase',
    marginTop: 8
  },
  value: { fontSize: 16, color: '#1a1a1a' },
  errorTitle: { color: '#b91c1c', fontWeight: '600', marginBottom: 4 },
  errorMessage: { color: '#1a1a1a' },
  resetLink: { marginTop: 16 },
  resetText: { color: '#2563eb', fontWeight: '600' }
});
