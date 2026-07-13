import {
  Linking,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { t } from '../lib/i18n';

export interface MethodologyScreenProps {
  onBack: () => void;
}

export function MethodologyScreen({ onBack }: MethodologyScreenProps) {
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Pressable onPress={onBack} style={styles.back}>
          <Text style={styles.backText}>{t('methodology.back')}</Text>
        </Pressable>

        <Text style={styles.title}>{t('methodology.title')}</Text>
        <Text style={styles.subtitle}>{t('methodology.subtitle')}</Text>

        <Text style={styles.h2}>{t('methodology.overallH')}</Text>
        <Text style={styles.p}>{t('methodology.overallP')}</Text>

        <Text style={styles.h2}>{t('methodology.publisherH')}</Text>
        <Text style={styles.p}>{t('methodology.publisherP')}</Text>

        <Text style={styles.h2}>{t('methodology.qualityH')}</Text>
        <Text style={styles.p}>{t('methodology.qualityP')}</Text>

        <Text style={styles.h2}>{t('methodology.deepH')}</Text>
        <Text style={styles.p}>{t('methodology.deepP')}</Text>
        <Text style={styles.p}>{t('methodology.deepP2')}</Text>

        <Text style={styles.h2}>{t('methodology.factCheckH')}</Text>
        <Text style={styles.p}>{t('methodology.factCheckP1')}</Text>
        <Text style={styles.p}>{t('methodology.factCheckP2')}</Text>

        <Text style={styles.h2}>{t('methodology.ratingH')}</Text>
        <Text style={styles.p}>{t('methodology.ratingP')}</Text>

        <Text style={styles.h2}>{t('methodology.todoH')}</Text>
        <Text style={styles.p}>{t('methodology.todoP')}</Text>

        <Text style={styles.h2}>{t('methodology.feedbackH')}</Text>
        <Text style={styles.p}>{t('methodology.feedbackP')}</Text>

        <View style={styles.legalSection}>
          <Text style={styles.h2}>{t('methodology.legalH')}</Text>
          <Pressable
            accessibilityRole="link"
            onPress={() => Linking.openURL('https://coatedhail.github.io/Fake_News_Detector/legal/privacy')}
          >
            <Text style={styles.link}>{t('methodology.legalPrivacy')}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="link"
            onPress={() => Linking.openURL('https://coatedhail.github.io/Fake_News_Detector/legal/terms')}
          >
            <Text style={styles.link}>{t('methodology.legalTerms')}</Text>
          </Pressable>
          <Text style={styles.legalNote}>{t('methodology.legalNote')}</Text>
        </View>
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
  p: { fontSize: 14, color: '#1F2937', lineHeight: 22 },
  legalSection: { marginTop: 8, gap: 4 },
  link: { fontSize: 14, color: '#2F6B5C', fontWeight: '600', paddingVertical: 6, textDecorationLine: 'underline' },
  legalNote: { fontSize: 12, color: '#6B7280', marginTop: 4, lineHeight: 18 }
});
