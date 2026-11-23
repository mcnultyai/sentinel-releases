import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import CameraScreen, { Photo } from './src/CameraScreen';
import MeasureScreen from './src/MeasureScreen';

export default function App() {
  const [photo, setPhoto] = useState<Photo | null>(null);
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {photo ? (
        <MeasureScreen photo={photo} onNewPhoto={() => setPhoto(null)} />
      ) : (
        <CameraScreen onPhoto={setPhoto} />
      )}
    </SafeAreaProvider>
  );
}
