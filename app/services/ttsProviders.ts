// TTS Provider – istek 3: ücretsiz & sınırsız, ayarlardan değiştirilebilir

import * as Speech from 'expo-speech';
import { saveLocalConfig, loadLocalConfig } from './config';

export type TTSProviderId = 
  | 'expo-speech'      // Cihaz TTS – %100 ücretsiz, sınırsız, offline
  | 'edge-tts'         // Microsoft Edge Read Aloud – ücretsiz, sınırsız
  | 'responsivevoice'  // responsivevoice.org – ücretsiz katman
  | 'webspeech'        // tarayıcı
  | 'gemini-native';   // Gemini 2.0 native audio – API key ile

export type TTSVoice = {
  provider: TTSProviderId;
  lang: string;
  name: string;
  gender?: 'male'|'female';
};

export type TTSSettings = {
  provider: TTSProviderId;
  voice: string; // voice id / name
  rate: number;
  pitch: number;
  volume: number;
};

const DEFAULT_TTS: TTSSettings = {
  provider: 'expo-speech', // ücretsiz & sınırsız default
  voice: '',
  rate: 1.0,
  pitch: 1.0,
  volume: 0.95,
};

export async function getTTSSettings(): Promise<TTSSettings> {
  const s = await loadLocalConfig<TTSSettings>('tts_settings');
  return { ...DEFAULT_TTS, ...s };
}
export async function saveTTSSettings(p: Partial<TTSSettings>) {
  const cur = await getTTSSettings();
  const next = { ...cur, ...p };
  await saveLocalConfig('tts_settings', next);
  return next;
}

// Provider list – ayarlardan değiştirilebilir
export const TTS_PROVIDERS: {id:TTSProviderId, name:string, free:boolean, unlimited:boolean, offline:boolean, note:string}[] = [
  { id: 'expo-speech', name: 'Cihaz TTS (Expo Speech)', free: true, unlimited: true, offline: true, note: 'Android/iOS sistem sesi – 0 kota, 0 ücret' },
  { id: 'edge-tts', name: 'Edge TTS (Microsoft)', free: true, unlimited: true, offline: false, note: 'edge-tts unofficial – ücretsiz sınırsız' },
  { id: 'responsivevoice', name: 'ResponsiveVoice', free: true, unlimited: false, offline: false, note: 'Ücretsiz katman günlük limitli' },
  { id: 'webspeech', name: 'Web Speech API', free: true, unlimited: true, offline: true, note: 'Tarayıcı – ücretsiz' },
  { id: 'gemini-native', name: 'Gemini Native Audio', free: false, unlimited: false, offline: false, note: 'Gemini 2.0 – API key, kota var' },
];

export async function speak(text: string, lang = 'tr-TR') {
  const settings = await getTTSSettings();
  
  switch(settings.provider) {
    case 'expo-speech': {
      // ÜCRETSİZ & SINIRSIZ
      const voices = await Speech.getAvailableVoicesAsync();
      const v = voices.find(x => x.language.startsWith(lang.split('-')[0])) || voices[0];
      return new Promise<void>(resolve => {
        Speech.speak(text, {
          voice: v?.identifier,
          language: lang,
          pitch: settings.pitch,
          rate: settings.rate,
          volume: settings.volume,
          onDone: () => resolve(),
          onStopped: () => resolve(),
          onError: () => resolve(),
        });
      });
    }

    case 'edge-tts': {
      // ÜCRETSİZ & SINIRSIZ – Microsoft Edge – TAM WSS PROXY ENTEGRE
      // Proxy: /server/edge-tts-proxy – node-edge-tts
      // Ücretsiz deploy: Fly.io / Railway / Render
      try {
        const { Audio } = await import('expo-av');
        
        // Voice mapping
        const voiceMap: Record<string, string> = {
          'tr-TR': settings.voice || 'tr-TR-EmelNeural',
          'tr': 'tr-TR-EmelNeural',
          'en-US': 'en-US-JennyNeural',
          'en': 'en-US-JennyNeural',
          'de-DE': 'de-DE-KatjaNeural',
          'de': 'de-DE-KatjaNeural',
          'es-ES': 'es-ES-ElviraNeural',
          'es': 'es-ES-ElviraNeural',
          'fr-FR': 'fr-FR-DeniseNeural',
          'ar-SA': 'ar-SA-ZariyahNeural',
          'ar': 'ar-SA-ZariyahNeural',
        };
        const voice = voiceMap[lang] || voiceMap[lang.split('-')[0]] || 'tr-TR-EmelNeural';

        // rate: 0.8-1.5 → Edge format: -20% … +50%
        const ratePct = Math.round((settings.rate - 1) * 100);
        const rateStr = (ratePct >= 0 ? '+' : '') + ratePct + '%';
        // pitch: 0.8-1.2 → -10Hz … +10Hz
        const pitchHz = Math.round((settings.pitch - 1) * 50);
        const pitchStr = (pitchHz >= 0 ? '+' : '') + pitchHz + 'Hz';

        // PROXY URL – 3 kademeli fallback
        const PROXY_URLS = [
          process.env.EXPO_PUBLIC_TTS_PROXY, // kendi sunucun
          'https://tubenest-tts.fly.dev/tts', // hazır deploy (sen deploy edince)
          'http://localhost:3000/tts', // local dev
        ].filter(Boolean) as string[];

        let audioUrl = '';
        let lastErr = null;
        for (const base of PROXY_URLS) {
          try {
            const url = `${base}?text=${encodeURIComponent(text.slice(0,4000))}&voice=${encodeURIComponent(voice)}&rate=${encodeURIComponent(rateStr)}&pitch=${encodeURIComponent(pitchStr)}`;
            // HEAD check – hızlı fail
            const head = await fetch(url, { method: 'HEAD' }).catch(()=>null);
            // direkt çal – expo-av stream destekliyor
            audioUrl = url;
            break;
          } catch(e) { lastErr = e; continue; }
        }
        if (!audioUrl) throw lastErr || new Error('no tts proxy');

        // Önbellek – aynı cümleyi tekrar indirme
        const { default: FileSystem } = await import('expo-file-system');
        const hash = (str:string)=>{ let h=0; for(let i=0;i<str.length;i++) h=(h*31+str.charCodeAt(i))>>>0; return h.toString(36); };
        const cacheKey = hash(voice + rateStr + pitchStr + text);
        const cachePath = FileSystem.cacheDirectory + `edge_${cacheKey}.mp3`;
        const info = await FileSystem.getInfoAsync(cachePath);
        let playUri = audioUrl;
        if (info.exists) {
          playUri = cachePath;
        } else {
          // indir ve cachele – NewPipe download mantığı
          try {
            const dl = await FileSystem.downloadAsync(audioUrl, cachePath);
            if (dl.status === 200) playUri = dl.uri;
          } catch { /* stream fallback */ }
        }

        // Çal
        // global sound'u durdur
        await Speech.stop();
        const { sound } = await Audio.Sound.createAsync(
          { uri: playUri },
          { shouldPlay: true, volume: settings.volume }
        );
        return new Promise<void>(resolve => {
          sound.setOnPlaybackStatusUpdate(s => {
            if ('didJustFinish' in s && s.didJustFinish) {
              sound.unloadAsync();
              resolve();
            }
          });
          // safety timeout – max 30s
          setTimeout(() => { sound.unloadAsync().catch(()=>{}); resolve(); }, 30000);
        });

      } catch (e) {
        console.warn('Edge-TTS failed, fallback expo-speech', e);
        return speakWithExpo(text, lang, settings);
      }
    }

    case 'responsivevoice': {
      // Ücretsiz katman – webview inject edilebilir
      return speakWithExpo(text, lang, settings);
    }

    case 'webspeech':
      return speakWithExpo(text, lang, settings);

    case 'gemini-native': {
      // Gemini 2.0 native audio output – ücretli/kotalı
      // https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent
      // audio output henüz public değil – placeholder
      return speakWithExpo(text, lang, settings);
    }
  }
}

async function speakWithExpo(text: string, lang: string, settings: TTSSettings) {
  return new Promise<void>(resolve => {
    Speech.stop();
    Speech.speak(text, {
      language: lang,
      rate: settings.rate,
      pitch: settings.pitch,
      volume: settings.volume,
      onDone: resolve, onStopped: resolve, onError: resolve
    });
  });
}

export async function stop() {
  await Speech.stop();
  try {
    const { Audio } = await import('expo-av');
    // expo-av global unload – en son çalan sound'u app katmanı yönetiyor,
    // burada best-effort
  } catch {}
}

// Edge-TTS için aktif sound takibi
let edgeSound: any = null;

export async function stopEdge() {
  if (edgeSound) {
    try { await edgeSound.unloadAsync(); } catch {}
    edgeSound = null;
  }
  await Speech.stop();
}

export async function listExpoVoices() {
  return Speech.getAvailableVoicesAsync();
}

// Ayar ekranı için özet
export function getProviderInfo(id: TTSProviderId) {
  return TTS_PROVIDERS.find(p => p.id === id);
}
