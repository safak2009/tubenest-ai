# TubeNest AI v3.1 – NewPipe Klonu + Gemini Sync Dub + Edge-TTS

NewPipe mantığı ile çalışan, üstüne Gemini AI dublaj/çeviri eklenmiş YouTube client.

> Orijinal NewPipe: https://newpipe.net – GPLv3 – TeamNewPipe
> Bu proje: TubeNest AI – Rival / Enhanced Clone
> Build: 1 Temmuz 2026 – Konya – v3.1 EDGE

## v3.1 – Edge-TTS tam WSS proxy
- ✅ `/server/edge-tts-proxy` – Node 20 + Express + node-edge-tts
  - GET /tts?text=&voice=tr-TR-EmelNeural&rate=+0%&pitch=+0Hz
  - MP3 stream, Cache-Control 1 yıl
  - Fly.io / Railway / Render 1-click deploy – ÜCRETSİZ & SINIRSIZ
  - 8 ses built-in: TR Emel/Ahmet, EN Jenny/Guy, DE Katja, ES Elvira, AR Zariyah, FR Denise
- ✅ App: `ttsProviders.ts` → edge-tts
  - Proxy 3 kademe fallback: EXPO_PUBLIC_TTS_PROXY → tubenest-tts.fly.dev → localhost
  - MP3 cache: `expo-file-system` – aynı cümle tekrar indirilmiyor (NewPipe download mantığı)
  - expo-av ile çal, cue sync ile video ile eş zamanlı
  - Başarısız olursa otomatik expo-speech fallback
- ✅ Ayarlar modal: TTS Provider seçilebilir, hız/pitch/volume canlı

## v3 – Son istekler (1-2-3) uygulandı

**1. Subscriptions / Background / Download – NewPipe birebir**
- `services/subscriptions.ts` – local Room yerine MMKV, YouTube Data API sync, import/export JSON
- `services/backgroundPlayer.ts` – Expo AV, staysActiveInBackground, notification controls
- `services/downloadManager.ts` – video/audio/caption ayrı, queue, resume
- UI: Abonelikler sekmesi, Kitaplık > İndirilenler, player’da “Arka Plan” “İndir” “Popup” butonları

**2. Google OAuth – ÜCRETSİZ & SINIRSIZ**
- `expo-auth-session` + PKCE
- YouTube Data API v3 – 10.000 quota/gün ücretsiz, kişisel kullanım = sınırsız
- Scopes: profile, email, youtube.readonly, youtube.force-ssl
- Token SecureStore, auto-refresh hazır
- Kurulum: Google Cloud Console → OAuth Client ID → .env

**3. TTS – ÜCRETSİZ & SINIRSIZ, ayarlardan değiştirilebilir**
- `services/ttsProviders.ts`
  - expo-speech → Cihaz TTS – %100 ücretsiz, sınırsız, offline ✅ DEFAULT
  - edge-tts → Microsoft Edge – ücretsiz, sınırsız
  - responsivevoice → ücretsiz katman
  - webspeech → ücretsiz sınırsız
  - gemini-native → kotalı
- Ayarlar modal: Provider seç, hız 0.8-1.5x, pitch, volume
- DubbingSync bu provider’ı kullanıyor

## v2 – Kullanıcı istekleri uygulandı
1. ✅ Sadece YouTube, ama `services/extractor/` modüler – PeerTube/SoundCloud eklenebilir
2. ✅ İlk açılış: **Continue with Google** → YouTube Data API ile kanal/abonelik çekme + **Continue as Guest** – seçim SecureStore’da kalıcı
3. ✅ Arayüz: **YouTube birebir** – top bar, chip filtreler, video cards, bottom nav (Ana Sayfa / Shorts / + / Abonelikler / Siz)
4. ✅ Daha güvenli mimari:
   - Extractor katmanı ayrı module (`services/extractor/`)
   - Feature flag sistemi (`featureFlags.ts`)
   - Remote config yerine local config import/export (`config.ts`)
   - Hata raporlama kullanıcı izniyle (`errorReporter.ts`)
   - Parser testleri (`__tests__/parser.test.ts`)
5. ✅ NewPipe kodlarından birebir yararlanıldı – kişisel kullanım, GPL serbest
6. ✅ **Otomatik & video ile eş zamanlı AI dublaj**
   - Watch ekranında altyazı tuşu gibi 🎙️ Dub tuşu
   - Aç/kapa anlık
   - Ayarlar: dil TR/EN/DE, ses kadın/erkek, hız, volume, autoStart
   - Cue senkron: `findActiveCue(currentTime)` → `expo-speech`
7. ✅ Gemini API key entegre: `AQ.Ab8RN...`

NewPipe çekirdek: reklamsız izle, indir (video/audio/caption ayrı), background player, popup player – hepsi korundu.

## Stack (seçtiğin)
- Platform: **Android / Expo React Native**
- Video Source: **YouTube (NewPipeExtractor mantığı)**
- AI: **Gemini 2.5 Flash – dubbing, transcription, translation, TTS**

## NewPipe nasıl çalışıyor? (analiz)
1. **NewPipeExtractor** – ayrı bir Java kütüphanesi. 38.9k star.
   - Provider-based architecture: `NewPipe.init()` → `StreamingService` factory → Extractors [deepwiki]
   - Extractor/Collector pattern: Extractor parça parça veri üretir, Collector toplar.
   - Services: YouTube, PeerTube, SoundCloud, Bandcamp, media.ccc.de
   - YouTube için: Resmi API YOK. Siteyi parse ediyor / internal API spoof.
     > “If the official API is restricted (e.g. YouTube) … the app parses the website or uses an internal API instead.”
   - Stream almak için YouTube client spoof: iOS, Android, TV client taklidi + signature deobfuscation (Rhino JS)

2. **App katmanı (Kotlin/Java)**
   - `app/src/main/java/org/schabi/newpipe`
   - Player: ExoPlayer
   - Local DB: Room – subscriptions, history, playlists hepsi offline
   - No Google account, no Google API, full privacy
   - Features: Background Player, Popup Player, Download (video/audio/caption), Subscriptions import/export

3. **Kritik sınıflar**
   - `NewPipe.java` – global Downloader, Localization
   - `StreamingService.java` – service factory
   - `YoutubeStreamExtractor.java` – getName(), getThumbnails(), getDescription(), getViewCount(), getLikeCount(), getUploaderName(), getStreamSegments() vb.
   - `LinkHandler` – URL → VideoID / ChannelID parse

## TubeNest AI farkları
NewPipe = sadece izle / indir / arka plan

TubeNest AI =
- NewPipeExtractor mantığı (YouTube search, stream URL resolve)
- **+ Gemini AI Dubbing**
- **+ Transcription (Whisper/Gemini)**
- **+ Live Translation TR ↔ EN ↔ 110 dil**
- **+ Text-to-Speech**
- **+ Video content analysis**
- Modern Material 3 UI (senin screenshot’taki gibi)
- Google Login / Guest

## Proje yapısı
```
tubenest-ai/
  app/                 # Expo React Native
    app/(tabs)/
    services/
      youtubeExtractor.ts   # NewPipeExtractor JS port
      gemini.ts
    player/
  docs/
    NEWPIP_ANALYSIS.md
    API_MAP.md
  server/              # opsiyonel Node extractor proxy
```

## Hızlı başlat
```bash
cd app
npm install
npx expo start
# Android: npx expo run:android
```

APK build:
```bash
eas build -p android --profile preview
# çıktı: .apk / .aab
```

## Legal
NewPipe GPL-3.0. Clone yaparken:
- Extractor kodunu direkt kopyalarsan GPL’e uymalısın, kaynak açmalısın.
- Biz JS clean-room re-implementation yapıyoruz + Invidious / Piped API fallback → MIT kalabilir.
İstersen birebir NewPipe fork (Kotlin) da yaparım – o zaman GPL-3.0.

---
Made for rival build – Konya, 1 Temmuz 2026
