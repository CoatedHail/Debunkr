import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text
} from 'react-native';
import { t } from '../lib/i18n';

export interface LimitationsScreenProps {
  onBack: () => void;
}

const BULLET_KEYS = [
  'limitations.b1',
  'limitations.b2',
  'limitations.b3',
  'limitations.b4',
  'limitations.b5',
  'limitations.b6',
  'limitations.b7',
  'limitations.b8',
  'limitations.b9',
  'limitations.b10',
  'limitations.b11',
  'limitations.b12',
  'limitations.b13',
  'limitations.b14'
];

export function LimitationsScreen({ onBack }: LimitationsScreenProps) {
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Pressable onPress={onBack} style={styles.back}>
          <Text style={styles.backText}>{t('limitations.back')}</Text>
        </Pressable>

        <Text style={styles.title}>{t('limitations.title')}</Text>
        <Text style={styles.subtitle}>{t('limitations.subtitle')}</Text>

        {BULLET_KEYS.map((k) => (
          <Text key={k} style={styles.bullet}>• {t(k)}</Text>
        ))}
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
