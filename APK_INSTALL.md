# TubeNest AI – APK Kurulum

Hazır – telefonuna kurup direkt kullanabilirsin.

## Hızlı Yöntem 1 – EAS (önerilir, 15 dk)
```bash
cd app
npm install -g eas-cli
eas login
# ilk kez:
eas build:configure
# APK build:
eas build -p android --profile preview
```
Build bitince mail + QR gelir. Telefonda aç → “Install”.

APK çıkar: `app-release.apk` ~45 MB

## Yöntem 2 – GitHub Actions (ücretsiz, otomatik)
1. Bu repo'yu GitHub'a push et:
```bash
cd /home/user/tubenest-ai
git init
git add .
git commit -m "TubeNest AI v3.1"
gh repo create tubenest-ai --public --source=. --push
```
2. GitHub → Settings → Secrets → Actions:
```
GEMINI_KEY = AQ.Ab8RN6I70I7KT9HkSwvAeIY5WUT3_LqG07sRa3FwyK8sd_BcZA
TTS_PROXY = https://tubenest-tts.fly.dev/tts
GOOGLE_ANDROID_CLIENT_ID = xxx.apps.googleusercontent.com
GOOGLE_WEB_CLIENT_ID = xxx.apps.googleusercontent.com
```
3. Actions sekmesi → “TubeNest AI – Android APK” → Run workflow
4. 15-20 dk sonra Artifacts → **TubeNest-AI-v3.apk** indir
5. Telefona at → yükle → “Bilinmeyen kaynaklara izin ver”

APK otomatik Release’e de eklenir.

## Yöntem 3 – Local (Android Studio)
```bash
cd app
npm i
npx expo prebuild --clean
cd android
./gradlew assembleRelease
# çıktı: android/app/build/outputs/apk/release/app-release.apk
adb install app-release.apk
```

## Edge-TTS Server (opsiyonel ama önerilir)
Ücretsiz sınırsız doğal ses için:
```bash
cd server/edge-tts-proxy
npm i
npm start
# → http://localhost:3000/tts?text=merhaba

# Deploy Fly.io – ücretsiz:
flyctl launch --no-deploy
flyctl secrets set PORT=8080
flyctl deploy
# URL: https://tubenest-tts.fly.dev/tts
```
Sonra app/.env:
```
EXPO_PUBLIC_TTS_PROXY=https://tubenest-tts.fly.dev/tts
```

Yerel test: `EXPO_PUBLIC_TTS_PROXY=http://10.0.2.2:3000/tts` (Android emulator)

---

APK izinleri:
- INTERNET
- ACCESS_NETWORK_STATE
- FOREGROUND_SERVICE_MEDIA_PLAYBACK
- POST_NOTIFICATIONS
- SYSTEM_ALERT_WINDOW (popup player)
- WAKE_LOCK
- READ/WRITE_EXTERNAL_STORAGE (download)

Boyut: ~38-48 MB
Min SDK: Android 7+
Target: Android 14
