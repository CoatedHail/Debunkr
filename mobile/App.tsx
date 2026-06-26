import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { CheckScreen } from './src/screens/CheckScreen';
import { MethodologyScreen } from './src/screens/MethodologyScreen';
import { LimitationsScreen } from './src/screens/LimitationsScreen';
import { MediaLiteracyScreen } from './src/screens/MediaLiteracyScreen';

type Route = 'check' | 'methodology' | 'limitations' | 'media-literacy';

export default function App() {
  const [route, setRoute] = useState<Route>('check');

  return (
    <>
      <StatusBar style="dark" />
      {route === 'check' && (
        <CheckScreen
          onOpenMethodology={() => setRoute('methodology')}
          onOpenLimitations={() => setRoute('limitations')}
          onOpenMediaLiteracy={() => setRoute('media-literacy')}
        />
      )}
      {route === 'methodology' && <MethodologyScreen onBack={() => setRoute('check')} />}
      {route === 'limitations' && <LimitationsScreen onBack={() => setRoute('check')} />}
      {route === 'media-literacy' && <MediaLiteracyScreen onBack={() => setRoute('check')} />}
    </>
  );
}
