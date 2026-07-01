# TubeNest AI – APK Build

## 1. Hızlı test (Expo Go)
```bash
cd app
npm i
npx expo start
```
Telefonuna Expo Go indir, QR okut.

## 2. Native APK (EAS)
```bash
npm install -g eas-cli
eas login
eas build:configure
eas build -p android --profile preview
```
10-15 dk sonra APK linki gelir. Direkt indir kur.

Local build:
```bash
npx expo prebuild
cd android
./gradlew assembleRelease
# çıktı: android/app/build/outputs/apk/release/app-release.apk
```

## 3. Gemini Key
app/.env
```
EXPO_PUBLIC_GEMINI_KEY=AIzaSy....
```

## 4. NewPipeExtractor fallback
- Primary: youtubei.js (Innertube)
- Fallback: pipedapi.kavin.rocks
- Kendi extractor sunucun: /server klasörüne node yt-dlp wrapper koyabiliriz.

Hazır.
