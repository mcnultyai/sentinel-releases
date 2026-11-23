# Camera Measure (Expo app)

A phone app that measures flat objects from a photo. It uses a live camera preview, and you calibrate against
a reference of known size: a bank card, A4 or US Letter paper, a custom rectangle, or any known length.
With a rectangular reference the app corrects for perspective, so the photo doesn't have to be taken exactly square-on.

Built with Expo SDK 58 (`expo-camera`, `expo-image-picker`, `react-native-svg`).

## How to use it

1. Lay the reference object flat on the same surface as the thing you want to measure.
2. Take a photo in the app (or pick one with **Photos**).
3. Tap the 4 corners of the reference (or both ends of a known length).
4. Tap the two ends of anything you want to measure. Drag any point to adjust; a magnifier shows what's under your finger.

Measurements are only valid for things lying on the same flat surface as the reference.

## Run it on your phone (Expo Go)

You need Node.js on a computer and the **Expo Go** app on your phone (App Store / Google Play).

```bash
cd measure-app
npm install
npx expo start
```

Scan the QR code with your phone's camera (iPhone) or with Expo Go (Android). Phone and computer must be on
the same Wi-Fi; if they aren't, use `npx expo start --tunnel`.

## Install it as a standalone app (EAS Build)

Needs a free Expo account (`npx eas-cli login`).

```bash
npx eas-cli build:configure
npx eas-cli build --platform android --profile preview   # gives you an .apk to install directly
npx eas-cli build --platform ios                         # needs an Apple Developer account
```

## Code

- `App.tsx`: switches between the camera and the measuring screen
- `src/CameraScreen.tsx`: live camera preview, capture, photo library picker
- `src/MeasureScreen.tsx`: calibration and measuring UI (touch handling, overlay, magnifier)
- `src/geometry.ts`: the measuring math (homography for perspective correction)
