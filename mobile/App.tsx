import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { CheckScreen } from './src/screens/CheckScreen';
import { MethodologyScreen } from './src/screens/MethodologyScreen';
import { LimitationsScreen } from './src/screens/LimitationsScreen';
import { MediaLiteracyScreen } from './src/screens/MediaLiteracyScreen';
import { initializeLocale, onLocaleChange } from './src/lib/i18n';

type Route = 'check' | 'methodology' | 'limitations' | 'media-literacy';

export default function App() {
  const [route, setRoute] = useState<Route>('check');
  // Bump this to force a re-render tree when the locale changes at runtime.
  // Everything in the tree reads i18n.t() synchronously, so a top-level key
  // change is the simplest way to flush stale strings out.
  const [localeVersion, setLocaleVersion] = useState(0);

  useEffect(() => {
    // Fire and forget: the app renders immediately in the default locale and
    // switches once expo-secure-store resolves. That's imperceptible.
    initializeLocale().then(() => setLocaleVersion((v) => v + 1));
    const unsubscribe = onLocaleChange(() => setLocaleVersion((v) => v + 1));
    return unsubscribe;
  }, []);

  return (
    <>
      <StatusBar style="dark" />
      {route === 'check' && (
        <CheckScreen
          key={`check-${localeVersion}`}
          onOpenMethodology={() => setRoute('methodology')}
          onOpenLimitations={() => setRoute('limitations')}
          onOpenMediaLiteracy={() => setRoute('media-literacy')}
        />
      )}
      {route === 'methodology' && (
        <MethodologyScreen key={`method-${localeVersion}`} onBack={() => setRoute('check')} />
      )}
      {route === 'limitations' && (
        <LimitationsScreen key={`limits-${localeVersion}`} onBack={() => setRoute('check')} />
      )}
      {route === 'media-literacy' && (
        <MediaLiteracyScreen key={`ml-${localeVersion}`} onBack={() => setRoute('check')} />
      )}
    </>
  );
}
