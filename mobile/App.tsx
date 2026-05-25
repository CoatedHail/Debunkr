import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { CheckScreen } from './src/screens/CheckScreen';
import { MethodologyScreen } from './src/screens/MethodologyScreen';
import { LimitationsScreen } from './src/screens/LimitationsScreen';

type Route = 'check' | 'methodology' | 'limitations';

export default function App() {
  const [route, setRoute] = useState<Route>('check');

  return (
    <>
      <StatusBar style="dark" />
      {route === 'check' && (
        <CheckScreen
          onOpenMethodology={() => setRoute('methodology')}
          onOpenLimitations={() => setRoute('limitations')}
        />
      )}
      {route === 'methodology' && <MethodologyScreen onBack={() => setRoute('check')} />}
      {route === 'limitations' && <LimitationsScreen onBack={() => setRoute('check')} />}
    </>
  );
}
