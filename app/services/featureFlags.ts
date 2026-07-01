// Feature flag sistemi – madde 4
// Remote config yerine local config/import

import { loadLocalConfig } from './config';

export type FeatureFlags = {
  // Extractor
  extractor_youtube_innertube: boolean;
  extractor_youtube_piped_fallback: boolean;
  extractor_peertube_enabled: boolean; // ileride
  extractor_soundcloud_enabled: boolean;

  // Player
  player_background: boolean;
  player_popup: boolean;
  player_download: boolean;

  // AI
  ai_dubbing: boolean;
  ai_dubbing_auto: boolean;
  ai_dubbing_sync: boolean;
  ai_transcription: boolean;
  ai_translation: boolean;

  // Auth
  auth_google: boolean;
  auth_guest: boolean;

  // Debug
  error_reporting: boolean;
  parser_tests: boolean;
};

const DEFAULT_FLAGS: FeatureFlags = {
  extractor_youtube_innertube: true,
  extractor_youtube_piped_fallback: true,
  extractor_peertube_enabled: false, // 1. madde: YT only şimdi, ileride true
  extractor_soundcloud_enabled: false,

  player_background: true,
  player_popup: true,
  player_download: true,

  ai_dubbing: true,
  ai_dubbing_auto: false,
  ai_dubbing_sync: true, // 6. madde: video ile eş zamanlı
  ai_transcription: true,
  ai_translation: true,

  auth_google: true,
  auth_guest: true,

  error_reporting: true,
  parser_tests: true,
};

let flags = { ...DEFAULT_FLAGS };

export async function initFeatureFlags() {
  const local = await loadLocalConfig<Partial<FeatureFlags>>('feature_flags');
  if (local) flags = { ...flags, ...local };
  return flags;
}

export function getFlag<K extends keyof FeatureFlags>(key: K): FeatureFlags[K] {
  return flags[key];
}

export function setFlag<K extends keyof FeatureFlags>(key: K, value: FeatureFlags[K]) {
  flags[key] = value;
}

export function getAllFlags() { return { ...flags }; }

// Local import/export – madde 4
export function exportFlags() { return JSON.stringify(flags, null, 2); }
export function importFlags(json: string) {
  try {
    const parsed = JSON.parse(json);
    flags = { ...DEFAULT_FLAGS, ...parsed };
    return true;
  } catch { return false; }
}
