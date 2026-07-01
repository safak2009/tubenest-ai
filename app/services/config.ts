// Remote config yerine local config/import sistemi – madde 4

import * as SecureStore from 'expo-secure-store';

const PREFIX = 'tubenest_cfg_';

export async function saveLocalConfig<T>(key: string, data: T) {
  await SecureStore.setItemAsync(PREFIX + key, JSON.stringify(data));
}

export async function loadLocalConfig<T>(key: string): Promise<T | null> {
  try {
    const raw = await SecureStore.getItemAsync(PREFIX + key);
    return raw ? JSON.parse(raw) as T : null;
  } catch { return null; }
}

export async function exportAllConfig() {
  // NewPipe import/export mantığı
  const keys = [
    'feature_flags',
    'auth_profile',
    'dub_settings',
    'subscriptions',
    'playlists'
  ];
  const out: any = {};
  for (const k of keys) {
    out[k] = await loadLocalConfig(k);
  }
  return JSON.stringify(out, null, 2);
}

export async function importAllConfig(json: string) {
  const data = JSON.parse(json);
  for (const [k, v] of Object.entries(data)) {
    if (v !== null) await saveLocalConfig(k, v);
  }
  return true;
}

// Parser test config
export const PARSER_TEST_URLS = [
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  'https://www.youtube.com/watch?v=jNQXAC9IVRw', // first yt video
  'https://youtu.be/9bZkp7q19f0',
];
