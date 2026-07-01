// Background Player – NewPipe birebir
// Sadece audio stream indir, ekran kapalıyken çal

import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

let sound: Audio.Sound | null = null;
let currentUrl: string | null = null;

export async function initBackgroundAudio() {
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    staysActiveInBackground: true,
    interruptionModeIOS: InterruptionModeIOS.DuckOthers,
    playsInSilentModeIOS: true,
    shouldDuckAndroid: true,
    interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
    playThroughEarpieceAndroid: false,
  });

  // Android notification – media controls
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('playback', {
      name: 'TubeNest Playback',
      importance: Notifications.AndroidImportance.LOW,
      sound: null,
      vibrationPattern: [0],
    });
  }
}

export type BgTrack = {
  id: string;
  title: string;
  artist: string;
  artwork?: string;
  url: string; // audio only – NewPipe background mantığı
};

export async function playBackground(track: BgTrack) {
  await initBackgroundAudio();
  if (sound) {
    await sound.unloadAsync();
    sound = null;
  }
  currentUrl = track.url;
  const { sound: s } = await Audio.Sound.createAsync(
    { uri: track.url },
    { shouldPlay: true, staysActiveInBackground: true },
    onStatus
  );
  sound = s;

  // Bildirim
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: track.title,
        body: track.artist,
        sound: null,
        sticky: true,
      },
      trigger: null,
    });
  } catch {}
}

async function onStatus(status: any) {
  // NewPipe: playback position kaydet, history ekle
}

export async function pauseBackground() {
  if (sound) await sound.pauseAsync();
}
export async function resumeBackground() {
  if (sound) await sound.playAsync();
}
export async function stopBackground() {
  if (sound) {
    await sound.stopAsync();
    await sound.unloadAsync();
    sound = null;
  }
  await Notifications.dismissAllNotificationsAsync().catch(()=>{});
}

export async function seekBackground(positionMs: number) {
  if (sound) await sound.setPositionAsync(positionMs);
}

export function getCurrentTrackUrl() { return currentUrl; }
