import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from './theme';

export type Photo = { uri: string; width: number; height: number };

export default function CameraScreen({ onPhoto }: { onPhoto: (p: Photo) => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const insets = useSafeAreaInsets();

  async function capture() {
    if (!camera.current || !ready || busy) return;
    setBusy(true);
    try {
      const pic = await camera.current.takePictureAsync({ quality: 0.9, shutterSound: false });
      if (pic) onPhoto({ uri: pic.uri, width: pic.width, height: pic.height });
    } finally {
      setBusy(false);
    }
  }

  async function pickFromLibrary() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    const a = res.canceled ? null : res.assets[0];
    if (a) onPhoto({ uri: a.uri, width: a.width, height: a.height });
  }

  if (!permission) {
    return <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>;
  }

  if (!permission.granted) {
    return (
      <View style={[styles.center, { padding: 24 }]}>
        <Text style={styles.title}>Camera Measure</Text>
        <Text style={styles.body}>
          The app needs your camera to take a photo of the thing you want to measure.
        </Text>
        {permission.canAskAgain ? (
          <Btn label="Allow camera" primary onPress={requestPermission} />
        ) : (
          <Text style={styles.body}>
            Camera access is turned off. Turn it on for this app in your phone's Settings.
          </Text>
        )}
        <Btn label="Choose a photo instead" onPress={pickFromLibrary} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <CameraView
        ref={camera}
        style={StyleSheet.absoluteFill}
        facing="back"
        onCameraReady={() => setReady(true)}
      />
      <View style={[styles.tip, { top: insets.top + 12 }]}>
        <Text style={styles.tipText}>
          Lay a bank card or sheet of paper flat beside what you're measuring. Fit both in the
          frame and hold the phone square-on.
        </Text>
      </View>
      <View style={[styles.controls, { paddingBottom: insets.bottom + 24 }]}>
        <Pressable onPress={pickFromLibrary} style={styles.side} accessibilityLabel="Choose a photo">
          <Text style={styles.sideText}>Photos</Text>
        </Pressable>
        <Pressable
          onPress={capture}
          disabled={!ready || busy}
          style={({ pressed }) => [styles.shutter, (pressed || busy) && { opacity: 0.6 }]}
          accessibilityLabel="Take photo"
        >
          <View style={styles.shutterInner} />
        </Pressable>
        <View style={styles.side} />
      </View>
    </View>
  );
}

function Btn({ label, onPress, primary }: { label: string; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable onPress={onPress} style={[styles.btn, primary && styles.btnPrimary]}>
      <Text style={[styles.btnText, primary && { color: colors.inkOnAccent }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: 16 },
  title: { color: colors.text, fontSize: 24, fontWeight: '700' },
  body: { color: colors.muted, fontSize: 16, textAlign: 'center', maxWidth: 320 },
  tip: { position: 'absolute', left: 16, right: 16, backgroundColor: colors.scrim, borderRadius: 12, padding: 12 },
  tipText: { color: colors.text, fontSize: 14, lineHeight: 20 },
  controls: {
    position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 24,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around',
  },
  side: { width: 72, height: 44, alignItems: 'center', justifyContent: 'center' },
  sideText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  shutter: {
    width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: colors.text,
    alignItems: 'center', justifyContent: 'center',
  },
  shutterInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.text },
  btn: {
    minWidth: 240, paddingVertical: 14, paddingHorizontal: 20, borderRadius: 12,
    backgroundColor: colors.control, borderWidth: 1, borderColor: colors.border, alignItems: 'center',
  },
  btnPrimary: { backgroundColor: colors.accent, borderColor: colors.accent },
  btnText: { color: colors.text, fontSize: 16, fontWeight: '600' },
});
