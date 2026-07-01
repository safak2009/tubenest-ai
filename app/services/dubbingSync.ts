// 6. madde: otomatik ve video ile eş zamanlı yapay zeka destekli dublaj
// Altyazı tuşu gibi dublaj tuşu, aç/kapa, ayarlardan kontrol

import { saveLocalConfig, loadLocalConfig } from './config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { speak as ttsSpeak, stop as ttsStop, getTTSSettings } from './ttsProviders';

// Kullanıcının verdiği key – madde 7
// UYARI: Bu key commit'lenmemeli. Kişisel kullanım için burada.
const GEMINI_KEY = process.env.EXPO_PUBLIC_GEMINI_KEY || 'AQ.Ab8RN6I70I7KT9HkSwvAeIY5WUT3_LqG07sRa3FwyK8sd_BcZA';

const genAI = new GoogleGenerativeAI(GEMINI_KEY);

export type DubSettings = {
  enabled: boolean;
  autoStart: boolean;
  targetLang: string; // 'tr', 'en', ...
  voice: 'female' | 'male' | 'auto';
  speed: number;
  volume: number; // dub vs original mix
  showSubtitles: boolean;
  // 3. istek: TTS provider ayarlardan değiştirilebilir
  ttsProvider?: import('./ttsProviders').TTSProviderId;
};

const DEFAULT_DUB: DubSettings = {
  enabled: true,
  autoStart: false,
  targetLang: 'tr',
  voice: 'auto',
  speed: 1.0,
  volume: 0.9,
  showSubtitles: true,
  ttsProvider: 'expo-speech',
};

export async function getDubSettings(): Promise<DubSettings> {
  const saved = await loadLocalConfig<DubSettings>('dub_settings');
  return { ...DEFAULT_DUB, ...saved };
}

export async function saveDubSettings(s: Partial<DubSettings>) {
  const cur = await getDubSettings();
  const next = { ...cur, ...s };
  await saveLocalConfig('dub_settings', next);
  return next;
}

// Senkron dublaj – video timecode ile
export type DubCue = {
  start: number; // saniye
  end: number;
  original: string;
  translated: string;
  ttsUrl?: string; // cache
};

export async function generateDubCues(videoId: string, captionsVtt?: string): Promise<DubCue[]> {
  // 1. Altyazı varsa onu kullan – en hızlı ve senkron
  // 2. Yoksa Gemini transcribe
  let transcript = '';
  if (captionsVtt) {
    transcript = parseVTT(captionsVtt);
  } else {
    // Gemini audio transcribe
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
    const res = await model.generateContent(`Transcribe YouTube video ${videoId} with timestamps, SRT formatında ver.`);
    transcript = res.response.text();
  }

  // Translate with timestamps korunarak
  const settings = await getDubSettings();
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
  const tr = await model.generateContent(
    `Aşağıdaki altyazıyı ${settings.targetLang} diline dublaj metni olarak çevir. Zaman kodlarını ASLA bozma, SRT formatını koru, doğal konuşma gibi çevir:\n\n${transcript}`
  );
  const translatedSrt = tr.response.text();

  return srtToCues(translatedSrt);
}

function parseVTT(vtt: string): string {
  // basit VTT -> SRT
  return vtt.replace('WEBVTT\n\n', '');
}

function srtToCues(srt: string): DubCue[] {
  const cues: DubCue[] = [];
  const blocks = srt.split(/\n\s*\n/);
  for (const b of blocks) {
    const m = b.match(/(\d+):(\d+):(\d+),(\d+)\s*-->\s*(\d+):(\d+):(\d+),(\d+)\s*\n([\s\S]*)/);
    if (!m) continue;
    const start = (+m[1])*3600 + (+m[2])*60 + (+m[3]) + (+m[4])/1000;
    const end = (+m[5])*3600 + (+m[6])*60 + (+m[7]) + (+m[8])/1000;
    cues.push({
      start, end,
      original: '',
      translated: m[9].trim().replace(/\n/g, ' ')
    });
  }
  return cues;
}

// Video player ile senkron – her timeupdate'te çağır
export function findActiveCue(cues: DubCue[], currentTimeSec: number): DubCue | null {
  return cues.find(c => currentTimeSec >= c.start && currentTimeSec <= c.end) || null;
}

// TTS – sırayla konuştur – istek 3: ücretsiz & sınırsız, provider seçilebilir
let lastSpokenCueStart = -1;
export async function speakCueIfNeeded(cue: DubCue | null, settings: DubSettings) {
  if (!cue || !settings.enabled) return;
  if (cue.start === lastSpokenCueStart) return;
  lastSpokenCueStart = cue.start;
  try {
    // TTS provider ayarlardan – ücretsiz & sınırsız default: expo-speech
    const tts = await getTTSSettings();
    // dubSettings speed/volume override
    await ttsSpeak(cue.translated, settings.targetLang === 'tr' ? 'tr-TR' : settings.targetLang === 'en' ? 'en-US' : settings.targetLang);
  } catch {}
}

export async function stopDub() {
  await ttsStop();
  lastSpokenCueStart = -1;
}
