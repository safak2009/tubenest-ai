# NewPipe – Tam Mimari Analiz

Kaynak: newpipe.net + github.com/TeamNewPipe/NewPipe + NewPipeExtractor

## 1. Genel
- **Dil:** Kotlin / Java
- **Min SDK:** Android 5+
- **Lisans:** GPL-3.0
- **Star:** 38.9k, Fork 3.7k
- **Commit:** 12,204
- **Son sürüm:** 0.28.8 – 2026
- **Boyut:** ~12 MB, reklamsız, hesapsız

## 2. Çekirdek: NewPipeExtractor
Ayrı repo: TeamNewPipe/NewPipeExtractor

Provider-based architecture:
- `NewPipe.init(Downloader, Localization)`
- `StreamingService` – abstract factory
- `LinkHandler` – URL → ID parse
- `Extractor` – base, `onFetchPage(downloader)`
- `Info` / `InfoItem` – structured data

> “The library is designed around a provider-based architecture where NewPipe.init() sets up the global environment, and StreamingService implementations act as factories for extractors.”

Extractor/Collector pattern:
> “the extractor would produce fragments of data, and the collector would collect them and assemble that data into a readable format for the front end.”

Desteklenen servisler (ServiceList.java):
- YouTube
- SoundCloud
- PeerTube (herhangi instance eklenebilir)
- Bandcamp
- media.ccc.de

## 3. YouTube Extraction Mantığı
Resmi API kullanmıyor:
> “NewPipe works by fetching the required data from the official API (e.g. PeerTube) of the service you’re using. If the official API is restricted (e.g. YouTube) for our purposes, or is proprietary, the app parses the website or uses an internal API instead.”

- YouTube.com HTML scrape + innertube internal API
- Client spoofing: Android, iOS, TVHTML5, Web
  > “The extractor spoofs YouTube clients to get streams.”
- Signature / throttling deobfuscation: Rhino JavaScript engine ile çözülüyor
- SABR workaround: 360p üstü çözünürlükler için (0.28.8 changelog)
- PoToken / integrity token sorunları sürekli patchleniyor

YoutubeStreamExtractor metodları:
getName(), getTextualUploadDate(), getUploadDate(), getThumbnails(), getDescription(), getAgeLimit(), getLength(), getViewCount(), getLikeCount(), getUploaderUrl(), getUploaderName(), isUploaderVerified(), getUploaderAvatars(), getSubtitles(), getStreamSegments() …

## 4. App Katmanı
`org.schabi.newpipe`

- UI: Activities + Fragments, Material
- Player: ExoPlayer 2.x – background service, popup overlay (SYSTEM_ALERT_WINDOW)
- Database: Room – subscriptions, playlists, history, feed
- Download: kendi DownloadManager – video/audio/caption ayrı seçilebilir
- Import/Export: JSON – NewPipe subscriptions, Google Takeout
- Privacy: 0 tracker, tüm veri cihazda, sadece video/stream için YouTube’a istek

Özellikler:
- Background Player – sadece audio indiriyor, data tasarrufu
- Popup Player – resize/move, picture-in-picture
- Subscriptions – local feed
- Bookmarks / Local Playlists
- History – aramalar dahil
- 110 dil çevirisi (Weblate)

## 5. Klasör yapısı (GitHub dev branch)
- /app – Android app
- /app/src/main/java/org/schabi/newpipe/extractor – bridge
- /desktopApp – Compose Multiplatform denemesi
- /doc – extractor dokümantasyonu
- Ayrı: NewPipeExtractor repo

## 6. Zayıf noktalar (neden TubeNest yapıyoruz)
- YouTube sürekli kırıyor – extractor her 2-3 haftada patch istiyor
- UI eski – Material 2
- AI yok – dublaj, çeviri, özet yok
- Cloud sync yok – hep local
- AI Studio’daki crash’in sebebi büyük ihtimal: extractor signature değişimi + Gemini rate limit

## 7. TubeNest AI stratejisi
NewPipeExtractor’ı 3 katmanlı yap:
1. **Primary:** NewPipeExtractor JS port (youtubei.js)
2. **Fallback 1:** Piped / Invidious API
3. **Fallback 2:** Cobalt / yt-dlp server

Üstüne:
- Gemini 2.5 Flash: transcribe → translate → TTS → dub
- ExoPlayer aynı kalabilir (React Native: expo-av / react-native-video)
- Room yerine: MMKV + SQLite + Supabase sync (opsiyonel Google login)
- UI: senin screenshot birebir – dark, “Continue with Google / Guest”

## 8. API Eşleştirme
NewPipe → TubeNest
- StreamExtractor.getName() → youtube.video.snippet.title
- getThumbnails() → maxresdefault.jpg
- getDescription() → snippet.description
- getUploaderName() → channelTitle
- getStreamUrls() → innertube streamingData.adaptiveFormats
- getSubtitles() → captionTracks → Gemini translate
- getLikeCount()/getViewCount() → statistics

Hepsi NewPipeExtractor mantığıyla birebir eşlendi.

---
Analiz tarihi: 1 Temmuz 2026 – Konya
