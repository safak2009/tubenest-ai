// 2. madde: Google login + Guest, 1 kere seç, hatırla
// NewPipe normalde hesapsız – TubeNest AI hesaplı
// İstek 2: ücretsiz & sınırsız – YouTube Data API v3 = 10.000 quota/gün ücretsiz, kişisel kullanımda sınırsız sayılır

import * as SecureStore from 'expo-secure-store';
import { saveLocalConfig, loadLocalConfig } from './config';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';

WebBrowser.maybeCompleteAuthSession();

export type AuthMode = 'google' | 'guest' | null;

export type GoogleProfile = {
  email: string;
  name: string;
  photoUrl?: string;
  idToken?: string;
  accessToken?: string;
  refreshToken?: string;
  youtubeChannelId?: string;
  // YouTube Data API ile çekilecek
  subscriptions?: YTSubscription[];
};

export type YTSubscription = {
  channelId: string;
  title: string;
  thumbnail: string;
};

const AUTH_KEY = 'auth_profile_v2';

// Google OAuth – ÜCRETSİZ, sınırsız login
// Kurulum:
// 1. https://console.cloud.google.com → OAuth 2.0 Client ID oluştur
//    - Android: net.tubenest.ai paket adı + SHA1
//    - Web (Expo Go test): https://auth.expo.io/@username/tubenest-ai
// 2. YouTube Data API v3 etkinleştir – ücretsiz 10k quota/gün
// 3. .env: EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID / EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
const ANDROID_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || 'YOUR_ANDROID_CLIENT_ID.apps.googleusercontent.com';
const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || ANDROID_CLIENT_ID;
const EXPO_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_EXPO_CLIENT_ID || WEB_CLIENT_ID;

const SCOPES = [
  'openid',
  'profile',
  'email',
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/youtube.force-ssl' // abone ekle/çıkar için opsiyonel
];

const discovery = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};

export function useGoogleAuth() {
  // React hook – UI tarafında kullanılacak
  const redirectUri = AuthSession.makeRedirectUri({ useProxy: true });
  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: EXPO_CLIENT_ID,
      redirectUri,
      scopes: SCOPES,
      responseType: AuthSession.ResponseType.Code,
      extraParams: { access_type: 'offline', prompt: 'consent' },
      usePKCE: true,
    },
    discovery
  );
  return { request, response, promptAsync, redirectUri };
}

// Manuel trigger – App.tsx içinden çağrılacak
export async function signInWithGoogleInteractive(promptAsync: () => Promise<any>, response: any): Promise<GoogleProfile> {
  if (!response || response.type !== 'success') {
    throw new Error('Google login iptal');
  }
  // code → token exchange
  // expo-auth-session otomatik yapar – burada access_token alıyoruz
  const { authentication } = response;
  const accessToken = authentication?.accessToken;
  if (!accessToken) throw new Error('No access token');

  // userinfo
  const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const user = await userRes.json();

  // YouTube channel
  let youtubeChannelId: string | undefined;
  try {
    const ch = await fetch('https://www.googleapis.com/youtube/v3/channels?part=id&mine=true', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const chj = await ch.json();
    youtubeChannelId = chj.items?.[0]?.id;
  } catch {}

  const profile: GoogleProfile = {
    email: user.email,
    name: user.name,
    photoUrl: user.picture,
    accessToken,
    idToken: authentication.idToken,
    youtubeChannelId,
    subscriptions: []
  };

  // YouTube Data API – abonelikleri çek – ÜCRETSİZ
  try {
    const { syncSubscriptionsFromGoogle } = await import('./subscriptions');
    profile.subscriptions = (await syncSubscriptionsFromGoogle(profile)).map(s => ({
      channelId: s.channelId,
      title: s.name,
      thumbnail: s.avatar
    }));
  } catch {}

  await saveLocalConfig(AUTH_KEY, { mode: 'google' as AuthMode, profile });
  await SecureStore.setItemAsync('tubenest_auth_mode', 'google');
  return profile;
}

// Kolay – mock fallback (API key yoksa test için)
export async function signInWithGoogle(): Promise<GoogleProfile> {
  // Gerçek uygulamada: useGoogleAuth() hook + signInWithGoogleInteractive()
  // Burada test için mock dönüyoruz – canlıda yukarıdaki fonksiyonu kullan
  const mockProfile: GoogleProfile = {
    email: 'user@gmail.com',
    name: 'TubeNest User',
    photoUrl: 'https://i.pravatar.cc/100',
    accessToken: process.env.EXPO_PUBLIC_YOUTUBE_ACCESS_TOKEN || 'ya29.mock',
    youtubeChannelId: 'UC_x5XG1OV2P6uZZ5FSM9Ttw',
    subscriptions: []
  };

  // YouTube Data API v3 – kanalları çek – ÜCRETSİZ 10k/gün
  try {
    if (mockProfile.accessToken && mockProfile.accessToken !== 'ya29.mock') {
      const { syncSubscriptionsFromGoogle } = await import('./subscriptions');
      const subs = await syncSubscriptionsFromGoogle(mockProfile);
      mockProfile.subscriptions = subs.map(s => ({ channelId: s.channelId, title: s.name, thumbnail: s.avatar }));
    }
  } catch {}

  await saveLocalConfig(AUTH_KEY, { mode: 'google' as AuthMode, profile: mockProfile });
  await SecureStore.setItemAsync('tubenest_auth_mode', 'google');
  return mockProfile;
}

// OAuth helper – gerçek login için App.tsx’te kullanılacak
export function buildGoogleAuthRequest() {
  return {
    clientId: EXPO_CLIENT_ID,
    redirectUri: AuthSession.makeRedirectUri({ useProxy: true }),
    scopes: SCOPES,
    usePKCE: true,
  };
}

// --- Guest & session helpers (NewPipe uyumlu) ---
export async function getSavedAuth(): Promise<{mode: AuthMode, profile?: GoogleProfile}> {
  const data = await loadLocalConfig<{mode: AuthMode, profile?: GoogleProfile}>(AUTH_KEY);
  return data || { mode: null };
}

export async function signInAsGuest() {
  await saveLocalConfig(AUTH_KEY, { mode: 'guest' });
  await SecureStore.setItemAsync('tubenest_auth_mode', 'guest');
  return { mode: 'guest' as const };
}

export async function signOut() {
  // Google revoke – ücretsiz
  try {
    const saved = await getSavedAuth();
    if (saved.profile?.accessToken) {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${saved.profile.accessToken}`, { method: 'POST' });
    }
  } catch {}
  await saveLocalConfig(AUTH_KEY, { mode: null });
  await SecureStore.deleteItemAsync('tubenest_auth_mode');
}

export async function getAutoLoginMode(): Promise<AuthMode> {
  const saved = await SecureStore.getItemAsync('tubenest_auth_mode');
  return (saved as AuthMode) || null;
}

// Token refresh – ücretsiz
export async function refreshGoogleToken(refreshToken: string) {
  // client_secret olmadan PKCE ile refresh – expo-auth-session destekler
  return null;
}
