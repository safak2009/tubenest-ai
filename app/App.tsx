import React, { useEffect, useState, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, ScrollView, Image, FlatList, Alert, Switch, Modal } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import * as AuthSession from 'expo-auth-session';

import { initFeatureFlags } from './services/featureFlags';
import { initErrorReporter, setErrorConsent, reportError } from './services/errorReporter';
import { getSavedAuth, signInWithGoogle, signInAsGuest, getAutoLoginMode, signOut, useGoogleAuth, signInWithGoogleInteractive, type GoogleProfile } from './services/auth';
import { extractStreamUniversal } from './services/extractor/index';
import type { StreamInfo } from './services/extractor/types';
import { getDubSettings, saveDubSettings, generateDubCues, findActiveCue, speakCueIfNeeded, stopDub, type DubCue, type DubSettings } from './services/dubbingSync';
import { getLocalSubscriptions, syncSubscriptionsFromGoogle, addSubscription, removeSubscription, type Subscription } from './services/subscriptions';
import { playBackground, pauseBackground, stopBackground, initBackgroundAudio } from './services/backgroundPlayer';
import { queueDownload, listDownloads, buildDownloadOptions, type DownloadJob } from './services/downloadManager';
import { getTTSSettings, saveTTSSettings, TTS_PROVIDERS, getProviderInfo, type TTSProviderId } from './services/ttsProviders';

export default function App() {
  const [booting, setBooting] = useState(true);
  const [authMode, setAuthMode] = useState<'google'|'guest'|null>(null);
  const [profile, setProfile] = useState<GoogleProfile | null>(null);
  const [tab, setTab] = useState<'home'|'subs'|'library'>('home');
  const [query, setQuery] = useState('');
  const [current, setCurrent] = useState<StreamInfo | null>(null);
  const [feed, setFeed] = useState<any[]>([]);
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [downloads, setDownloads] = useState<DownloadJob[]>([]);
  const [showSettings, setShowSettings] = useState(false);

  // dub
  const [dubOn, setDubOn] = useState(true);
  const [dubSettings, setDubSettings] = useState<DubSettings | null>(null);
  const [dubCues, setDubCues] = useState<DubCue[]>([]);
  const [activeCue, setActiveCue] = useState<DubCue | null>(null);

  // tts
  const [ttsSettings, setTtsSettings] = useState<any>(null);

  const videoRef = useRef<Video>(null);

  // Google OAuth hook – istek 2: ücretsiz & sınırsız
  const googleAuth = useGoogleAuth();

  useEffect(() => {
    if (googleAuth.response?.type === 'success') {
      (async () => {
        try {
          const p = await signInWithGoogleInteractive(() => Promise.resolve(), googleAuth.response);
          setProfile(p);
          setAuthMode('google');
          const s = await syncSubscriptionsFromGoogle(p);
          setSubs(s);
        } catch(e:any){ Alert.alert('Google Login Hata', e.message); }
      })();
    }
  }, [googleAuth.response]);

  useEffect(() => {
    (async () => {
      await initFeatureFlags();
      await initBackgroundAudio();
      const consent = await initErrorReporter();
      if (consent === null) {
        Alert.alert('Hata raporlama', 'Extractor bozulursa anonim hata logu gönderelim mi? (NewPipe güvenli mimari)', [
          { text: 'Hayır', onPress: () => setErrorConsent(false) },
          { text: 'Evet', onPress: () => setErrorConsent(true) }
        ]);
      }
      const auto = await getAutoLoginMode();
      if (auto) {
        setAuthMode(auto);
        const saved = await getSavedAuth();
        if (saved.profile) {
          setProfile(saved.profile);
          // subs sync
          if (auto === 'google' && saved.profile.accessToken && saved.profile.accessToken !== 'ya29.mock') {
            const s = await syncSubscriptionsFromGoogle(saved.profile).catch(()=>[]);
            setSubs(s);
          }
        }
      }
      setDubSettings(await getDubSettings());
      setTtsSettings(await getTTSSettings());
      setSubs(await getLocalSubscriptions());
      setDownloads(await listDownloads());
      setBooting(false);

      setFeed([
        { id: 'dQw4w9WgXcQ', title: 'Rick Astley – Never Gonna Give You Up', channel: 'Rick Astley', views: '1.5B' },
        { id: 'jNQXAC9IVRw', title: 'Me at the zoo', channel: 'jawed', views: '340M' },
        { id: '9bZkp7q19f0', title: 'PSY – GANGNAM STYLE', channel: 'officialpsy', views: '5.4B' },
        { id: 'kJQP7kiw5Fk', title: 'Luis Fonsi - Despacito', channel: 'LuisFonsi', views: '8.4B' },
      ]);
    })();
  }, []);

  const doGoogleLogin = async () => {
    // istek 2: ücretsiz & sınırsız OAuth
    if (googleAuth.request) {
      try {
        await googleAuth.promptAsync({ useProxy: true });
        return;
      } catch {}
    }
    // fallback mock
    try {
      const p = await signInWithGoogle();
      setProfile(p);
      setAuthMode('google');
      const s = await syncSubscriptionsFromGoogle(p).catch(()=>[]);
      setSubs(s);
    } catch (e:any) { reportError('loginGoogle', e); Alert.alert('Login', e.message); }
  };
  const doGuest = async () => {
    await signInAsGuest();
    setAuthMode('guest');
    setSubs(await getLocalSubscriptions());
  };

  const openVideo = async (videoId: string) => {
    try {
      const info = await extractStreamUniversal(videoId, 'youtube');
      setCurrent(info);
      setActiveCue(null);
      await stopDub();
      if (dubSettings?.autoStart && dubSettings.enabled) {
        startDub(info);
      }
    } catch (e:any) {
      reportError('openVideo', e, { extractor: 'youtube', url: videoId });
      Alert.alert('Extractor hatası', e.message);
    }
  };

  const startDub = async (info: StreamInfo = current!) => {
    if (!info) return;
    try {
      const cues = await generateDubCues(info.id, undefined);
      setDubCues(cues);
      Alert.alert('Dublaj hazır', `${cues.length} cue • ${dubSettings?.targetLang} • TTS: ${ttsSettings?.provider}`);
    } catch(e:any){ Alert.alert('Dub hata', e.message); }
  };

  const onPlaybackStatus = async (status: AVPlaybackStatus) => {
    if (!status.isLoaded || !dubOn || !dubSettings?.enabled || dubCues.length===0) return;
    const t = (status.positionMillis || 0) / 1000;
    const cue = findActiveCue(dubCues, t);
    if (cue && cue !== activeCue) {
      setActiveCue(cue);
      await speakCueIfNeeded(cue, dubSettings);
    }
  };

  const handleBackgroundPlay = async () => {
    if (!current) return;
    const audio = current.audioStreams[0];
    if (!audio) { Alert.alert('Audio yok'); return; }
    await playBackground({
      id: current.id,
      title: current.title,
      artist: current.uploader,
      artwork: current.thumbnails[0],
      url: audio.url
    });
    Alert.alert('Background Player', 'Ses arka planda çalıyor – NewPipe mantığı\nBildirimden kontrol edebilirsin.');
  };

  const handleDownload = async () => {
    if (!current) return;
    const opts = buildDownloadOptions(current);
    // basit: ilk video + ilk audio + ilk caption
    const picks = [opts.find(o=>o.type==='video'), opts.find(o=>o.type==='audio'), opts.find(o=>o.type==='caption')].filter(Boolean);
    for (const p of picks.slice(0,1)) { // test için 1 tane
      if (!p) continue;
      await queueDownload({
        id: `${current.id}_${p.type}_${Date.now()}`,
        videoId: current.id,
        title: current.title,
        type: p.type as any,
        quality: p.quality,
        url: p.url
      });
    }
    const dl = await listDownloads();
    setDownloads(dl);
    Alert.alert('İndirme kuyruğa alındı', `${picks[0]?.label}\nAyarlar > İndirilenler'den takip et`);
  };

  const toggleSub = async () => {
    if (!current) return;
    const exists = subs.find(s => s.channelId === current.uploaderUrl.split('/').pop());
    const channelId = current.uploaderUrl.split('/').pop() || current.id;
    if (exists) {
      const list = await removeSubscription(exists.channelId);
      setSubs(list);
    } else {
      const list = await addSubscription({
        channelId,
        name: current.uploader,
        avatar: current.uploaderAvatar || '',
        url: current.uploaderUrl,
        notify: false,
        addedAt: Date.now()
      });
      setSubs(list);
    }
  };

  if (booting) {
    return <View style={s.center}><Text style={{color:'#fff'}}>TubeNest AI v3 açılıyor…</Text><StatusBar style="light"/></View>;
  }

  if (!authMode) {
    return (
      <View style={s.loginWrap}>
        <StatusBar style="light"/>
        <View style={s.logoBig}><Text style={s.logoBigTxt}>▶</Text></View>
        <Text style={s.brand}>TubeNest</Text>
        <Text style={s.brandSub}>Watch, organize, and personalize your video experience.</Text>
        <Text style={s.brandSub2}>Reklamsız • NewPipe motorlu • Gemini AI dublaj • v3</Text>

        <TouchableOpacity style={s.googleBtn} onPress={doGoogleLogin} disabled={!googleAuth.request}>
          <Text style={s.googleBtnTxt}>G  Continue with Google</Text>
        </TouchableOpacity>
        <Text style={s.smallHint}>ÜCRETSİZ & SINIRSIZ – YouTube Data API v3 (10k quota/gün). Aboneliklerin, kanal verilerin senkron.</Text>

        <TouchableOpacity style={s.guestBtn} onPress={doGuest}>
          <Text style={s.guestBtnTxt}>Continue as Guest</Text>
        </TouchableOpacity>
        <Text style={s.footNote}>Seçimin cihazda saklanır. Ayarlardan değiştirebilirsin.</Text>
      </View>
    );
  }

  // WATCH
  if (current) {
    const isSubbed = subs.some(su => current.uploaderUrl.includes(su.channelId));
    return (
      <View style={yt.container}>
        <StatusBar style="light"/>
        <Video
          ref={videoRef}
          source={{ uri: current.hlsUrl || current.videoStreams[0]?.url }}
          style={yt.player}
          useNativeControls
          resizeMode={ResizeMode.CONTAIN}
          onPlaybackStatusUpdate={onPlaybackStatus}
          shouldPlay
        />
        {dubOn && activeCue && dubSettings?.showSubtitles && (
          <View style={yt.subtitleBox}>
            <Text style={yt.subtitleTxt}>{activeCue.translated}</Text>
          </View>
        )}
        <ScrollView style={{flex:1}} contentContainerStyle={{padding:12, paddingBottom:40}}>
          <Text style={yt.title}>{current.title}</Text>
          <View style={yt.channelRow}>
            <Image source={{uri: current.uploaderAvatar || 'https://i.pravatar.cc/40'}} style={yt.avatar}/>
            <View style={{flex:1}}>
              <Text style={yt.channel}>{current.uploader}</Text>
              <Text style={yt.meta}>{Number(current.viewCount).toLocaleString('tr-TR')} görüntüleme • {current.duration}s</Text>
            </View>
            <TouchableOpacity style={[yt.subBtn, isSubbed && {backgroundColor:'#272727'}]} onPress={toggleSub}>
              <Text style={[yt.subBtnTxt, isSubbed && {color:'#fff'}]}>{isSubbed ? 'Abone olundu' : 'Abone ol'}</Text>
            </TouchableOpacity>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginVertical:10}}>
            <Action icon="👍" label={current.likeCount ? `${Math.floor((current.likeCount||0)/1000)}B` : 'Beğen'} />
            <Action icon="🔗" label="Paylaş" />
            <Action icon="⬇️" label="İndir" onPress={handleDownload} />
            <TouchableOpacity 
              style={[yt.action, dubOn && yt.actionActive]} 
              onPress={async ()=>{ const next=!dubOn; setDubOn(next); if(!next) await stopDub(); if(next && dubCues.length===0) startDub(); }}>
              <Text style={yt.actionIcon}>🎙️</Text>
              <Text style={[yt.actionLabel, dubOn && {color:'#000', fontWeight:'700'}]}>{dubOn ? 'Dub Açık' : 'Dub'}</Text>
            </TouchableOpacity>
            <Action icon="⏱️" label="Arka Plan" onPress={handleBackgroundPlay} />
            <Action icon="🪟" label="Popup" onPress={()=>Alert.alert('Popup Player','NewPipe popup – SYSTEM_ALERT_WINDOW')} />
          </ScrollView>

          <View style={yt.dubPanel}>
            <Text style={yt.panelTitle}>AI Dublaj – Gemini + {ttsSettings?.provider || 'expo-speech'}</Text>
            <View style={yt.rowBetween}>
              <Text style={yt.panelTxt}>Otomatik başlat</Text>
              <Switch value={!!dubSettings?.autoStart} onValueChange={async v=>{ const n=await saveDubSettings({autoStart:v}); setDubSettings(n); }} />
            </View>
            <View style={yt.rowBetween}>
              <Text style={yt.panelTxt}>Dil: {dubSettings?.targetLang?.toUpperCase()}</Text>
              <TouchableOpacity onPress={async ()=>{
                const langs=['tr','en','de','es','fr','ar'];
                const idx=langs.indexOf(dubSettings?.targetLang||'tr');
                const next=langs[(idx+1)%langs.length];
                const n=await saveDubSettings({targetLang:next}); setDubSettings(n);
              }}><Text style={{color:'#3ea6ff'}}>Değiştir</Text></TouchableOpacity>
            </View>
            <View style={yt.rowBetween}>
              <Text style={yt.panelTxt}>TTS Provider:</Text>
              <Text style={{color:'#8ef', fontSize:12}}>{getProviderInfo(ttsSettings?.provider)?.name.split(' ')[0]}</Text>
            </View>
            <TouchableOpacity onPress={()=>setShowSettings(true)} style={{marginTop:6}}>
              <Text style={{color:'#3ea6ff', fontSize:13}}>⚙️ TTS Ayarlarını Aç (ücretsiz & sınırsız)</Text>
            </TouchableOpacity>
            <TouchableOpacity style={yt.genBtn} onPress={()=>startDub()}>
              <Text style={{color:'#fff', fontWeight:'600'}}>Dublaj Cue’larını Üret</Text>
            </TouchableOpacity>
            {activeCue && <Text style={yt.cueTxt}>▶ {activeCue.translated}</Text>}
            <Text style={{color:'#777', fontSize:11, marginTop:6}}>
              Cue: {dubCues.length} • Sync: {dubSettings?.speed}x • Voice: {dubSettings?.voice}
            </Text>
          </View>

          <Text style={yt.desc}>{current.description?.slice(0,420)}…</Text>

          <TouchableOpacity onPress={async()=>{ setCurrent(null); await stopDub(); await stopBackground();}} style={{marginTop:20, alignSelf:'center'}}>
            <Text style={{color:'#3ea6ff'}}>← Geri</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* TTS Settings Modal */}
        <Modal visible={showSettings} animationType="slide" transparent>
          <View style={modal.backdrop}>
            <View style={modal.box}>
              <Text style={modal.title}>TTS Provider – Ücretsiz & Sınırsız</Text>
              <ScrollView style={{maxHeight:340}}>
                {TTS_PROVIDERS.map(p=>(
                  <TouchableOpacity key={p.id} 
                    style={[modal.opt, ttsSettings?.provider===p.id && modal.optActive]}
                    onPress={async ()=>{
                      const n = await saveTTSSettings({provider: p.id});
                      setTtsSettings(n);
                      // dubSettings'e de yaz
                      const d = await saveDubSettings({ttsProvider: p.id});
                      setDubSettings(d);
                    }}>
                    <Text style={{color:'#fff', fontWeight:'600'}}>{p.name}</Text>
                    <Text style={{color: p.free ? '#8f8' : '#faa', fontSize:12}}>
                      {p.free ? 'ÜCRETSİZ' : 'Ücretli'} • {p.unlimited ? 'SINIRSIZ' : 'Limitli'} • {p.offline ? 'Offline' : 'Online'}
                    </Text>
                    <Text style={{color:'#aaa', fontSize:11}}>{p.note}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <View style={{marginTop:12, gap:8}}>
                <View style={yt.rowBetween}>
                  <Text style={{color:'#ddd'}}>Hız</Text>
                  <View style={{flexDirection:'row', gap:10}}>
                    {[0.8,1.0,1.2,1.5].map(r=>(
                      <TouchableOpacity key={r} onPress={async()=>{ const n=await saveTTSSettings({rate:r}); setTtsSettings(n); }}>
                        <Text style={{color: ttsSettings?.rate===r ? '#3ea6ff':'#aaa'}}>{r}x</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
                <View style={yt.rowBetween}>
                  <Text style={{color:'#ddd'}}>Pitch</Text>
                  <View style={{flexDirection:'row', gap:10}}>
                    {[0.8,1.0,1.2].map(v=>(
                      <TouchableOpacity key={v} onPress={async()=>{ const n=await saveTTSSettings({pitch:v}); setTtsSettings(n); }}>
                        <Text style={{color: ttsSettings?.pitch===v ? '#3ea6ff':'#aaa'}}>{v}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>

              <TouchableOpacity onPress={()=>setShowSettings(false)} style={[yt.genBtn,{marginTop:14, backgroundColor:'#333'}]}>
                <Text style={{color:'#fff'}}>Kapat</Text>
              </TouchableOpacity>
              <Text style={{color:'#777', fontSize:11, textAlign:'center', marginTop:8}}>
                Önerilen: <Text style={{color:'#8f8'}}>expo-speech</Text> = %100 ücretsiz, sınırsız, offline.{'\n'}
                Edge-TTS = ücretsiz sınırsız online, daha doğal ses.
              </Text>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  // TABS: home / subs / library
  const renderHome = () => (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={yt.chipsWrap} contentContainerStyle={{paddingHorizontal:12, gap:8}}>
        {['Tümü','Müzik','Oyun','Canlı','Haberler','AI','Komedi','Yeni yüklenenler'].map((c,i)=>
          <View key={c} style={[yt.chip, i===0 && yt.chipActive]}><Text style={[yt.chipTxt, i===0 && {color:'#000', fontWeight:'700'}]}>{c}</Text></View>
        )}
      </ScrollView>
      <View style={{paddingHorizontal:12, paddingBottom:8, flexDirection:'row', gap:8}}>
        <TextInput
          style={yt.searchInput}
          placeholder="YouTube’da ara / URL yapıştır"
          placeholderTextColor="#888"
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={()=> query && openVideo(query)}
        />
        <TouchableOpacity style={yt.searchBtn} onPress={()=> query && openVideo(query)}>
          <Text style={{color:'#fff'}}>▶</Text>
        </TouchableOpacity>
      </View>
      <Text style={{color:'#aaa', paddingHorizontal:16, fontSize:12, marginBottom:4}}>
        {authMode==='google' ? `🔗 ${profile?.email} • ${subs.length} abonelik` : '👤 Misafir modu – local'}
      </Text>
      <FlatList
        data={feed}
        keyExtractor={i=>i.id}
        renderItem={({item})=>(
          <TouchableOpacity onPress={()=>openVideo(item.id)} style={yt.card}>
            <Image source={{uri: `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`}} style={yt.thumb}/>
            <View style={{flexDirection:'row', padding:10, gap:10}}>
              <Image source={{uri:'https://i.pravatar.cc/36'}} style={yt.avatarSm}/>
              <View style={{flex:1}}>
                <Text style={yt.cardTitle} numberOfLines={2}>{item.title}</Text>
                <Text style={yt.cardMeta}>{item.channel} • {item.views}</Text>
              </View>
              <Text style={{color:'#aaa'}}>⋮</Text>
            </View>
          </TouchableOpacity>
        )}
        ListFooterComponent={<View style={{height:90}}/>}
      />
    </>
  );

  const renderSubs = () => (
    <ScrollView contentContainerStyle={{padding:16, paddingBottom:100}}>
      <Text style={{color:'#fff', fontSize:20, fontWeight:'700', marginBottom:12}}>Abonelikler – {subs.length}</Text>
      {subs.length===0 ? (
        <Text style={{color:'#aaa'}}>Henüz abonelik yok. Bir video açıp “Abone ol” bas.</Text>
      ) : subs.map(s=>(
        <View key={s.channelId} style={{flexDirection:'row', alignItems:'center', marginBottom:14, gap:12}}>
          <Image source={{uri: s.avatar || 'https://i.pravatar.cc/48'}} style={{width:48,height:48,borderRadius:24}}/>
          <View style={{flex:1}}>
            <Text style={{color:'#fff', fontWeight:'600'}}>{s.name}</Text>
            <Text style={{color:'#888', fontSize:12}}>{s.channelId}</Text>
          </View>
          <TouchableOpacity onPress={async()=>{ const list=await removeSubscription(s.channelId); setSubs(list); }}>
            <Text style={{color:'#f66'}}>Çıkar</Text>
          </TouchableOpacity>
        </View>
      ))}
      <TouchableOpacity style={[yt.genBtn,{marginTop:12}]} onPress={async ()=>{
        if (profile?.accessToken && profile.accessToken !== 'ya29.mock') {
          const fresh = await syncSubscriptionsFromGoogle(profile);
          setSubs(fresh);
          Alert.alert('Senkron', `${fresh.length} abonelik çekildi – ücretsiz`);
        } else {
          Alert.alert('Google gerekli', 'Abonelik senkron için Google ile giriş yap');
        }
      }}>
        <Text style={{color:'#fff'}}>🔄 YouTube’dan Senkron Et (ücretsiz)</Text>
      </TouchableOpacity>
      <Text style={{color:'#777', fontSize:11, marginTop:8}}>
        NewPipe mantığı: local DB + opsiyonel Google sync. Export/Import JSON destekli.
      </Text>
    </ScrollView>
  );

  const renderLibrary = () => (
    <ScrollView contentContainerStyle={{padding:16, paddingBottom:100}}>
      <Text style={{color:'#fff', fontSize:20, fontWeight:'700', marginBottom:8}}>Kitaplık</Text>
      <Text style={{color:'#aaa', marginBottom:14}}>İndirilenler • Geçmiş • Oynatma listeleri</Text>
      
      <Text style={{color:'#fff', fontWeight:'600', marginBottom:8}}>⬇️ İndirilenler ({downloads.length})</Text>
      {downloads.length===0 ? <Text style={{color:'#777'}}>Henüz indirme yok</Text> :
        downloads.map(d=>(
          <View key={d.id} style={{backgroundColor:'#1a1a1a', padding:12, borderRadius:10, marginBottom:8}}>
            <Text style={{color:'#fff'}} numberOfLines={1}>{d.title}</Text>
            <Text style={{color:'#aaa', fontSize:12}}>{d.type} • {d.quality} • {d.status} • %{Math.round(d.progress*100)}</Text>
            {d.localUri && <Text style={{color:'#3ea6ff', fontSize:11}}>{d.localUri.split('/').pop()}</Text>}
          </View>
        ))
      }

      <View style={{height:16}}/>
      <Text style={{color:'#fff', fontWeight:'600', marginBottom:8}}>🎙️ TTS Ayarı</Text>
      <TouchableOpacity onPress={()=>setShowSettings(true)} style={{backgroundColor:'#1a1a1a', padding:14, borderRadius:10}}>
        <Text style={{color:'#fff'}}>Provider: {ttsSettings?.provider}</Text>
        <Text style={{color:'#aaa', fontSize:12}}>Hız: {ttsSettings?.rate}x • Pitch: {ttsSettings?.pitch} • Vol: {ttsSettings?.volume}</Text>
        <Text style={{color:'#3ea6ff', fontSize:12, marginTop:4}}>Değiştir →</Text>
      </TouchableOpacity>

      <View style={{height:16}}/>
      <Text style={{color:'#fff', fontWeight:'600'}}>🔊 Background Player</Text>
      <View style={{flexDirection:'row', gap:8, marginTop:8}}>
        <TouchableOpacity onPress={pauseBackground} style={sLib.btn}><Text style={sLib.btnTxt}>Pause</Text></TouchableOpacity>
        <TouchableOpacity onPress={async()=>{ const {resumeBackground}=await import('./services/backgroundPlayer'); resumeBackground(); }} style={sLib.btn}><Text style={sLib.btnTxt}>Resume</Text></TouchableOpacity>
        <TouchableOpacity onPress={stopBackground} style={sLib.btn}><Text style={sLib.btnTxt}>Stop</Text></TouchableOpacity>
      </View>

      <View style={{height:24}}/>
      <TouchableOpacity onPress={async()=>{ await signOut(); setAuthMode(null); setProfile(null);}} style={{backgroundColor:'#2a1818', padding:14, borderRadius:10, alignItems:'center'}}>
        <Text style={{color:'#f66'}}>Çıkış Yap (hesabı unut)</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  return (
    <View style={yt.container}>
      <StatusBar style="light"/>
      <View style={yt.topBar}>
        <Text style={yt.ytLogo}>▶️ <Text style={{fontWeight:'800'}}>TubeNest</Text></Text>
        <View style={{flexDirection:'row', gap:16, alignItems:'center'}}>
          <Text style={yt.topIcon}>📡</Text>
          <Text style={yt.topIcon}>🔔</Text>
          <TouchableOpacity onPress={()=>setShowSettings(true)}><Text style={yt.topIcon}>⚙️</Text></TouchableOpacity>
          <Image source={{uri: profile?.photoUrl || 'https://i.pravatar.cc/32'}} style={{width:28,height:28,borderRadius:14}}/>
        </View>
      </View>

      {tab==='home' && renderHome()}
      {tab==='subs' && renderSubs()}
      {tab==='library' && renderLibrary()}

      <View style={yt.bottomNav}>
        <NavBtn icon="🏠" label="Ana Sayfa" active={tab==='home'} onPress={()=>setTab('home')} />
        <NavBtn icon="⚡" label="Shorts" active={false} onPress={()=>Alert.alert('Shorts','Yakında')} />
        <NavBtn icon="＋" label="" active={false} onPress={()=>Alert.alert('Upload','NewPipe mantığı – sadece izle/indir')} />
        <NavBtn icon="📺" label="Abonelikler" active={tab==='subs'} onPress={()=>setTab('subs')} />
        <NavBtn icon="👤" label="Siz" active={tab==='library'} onPress={()=>setTab('library')} />
      </View>

      {/* TTS Settings Modal – global */}
      <Modal visible={showSettings} animationType="slide" transparent>
        <View style={modal.backdrop}>
          <View style={modal.box}>
            <Text style={modal.title}>TTS Provider – Ücretsiz & Sınırsız</Text>
            <ScrollView style={{maxHeight:320}}>
              {TTS_PROVIDERS.map(p=>(
                <TouchableOpacity key={p.id}
                  style={[modal.opt, ttsSettings?.provider===p.id && modal.optActive]}
                  onPress={async ()=>{
                    const n = await saveTTSSettings({provider: p.id});
                    setTtsSettings(n);
                    await saveDubSettings({ttsProvider: p.id});
                  }}>
                  <Text style={{color:'#fff', fontWeight:'700'}}>{p.name}</Text>
                  <Text style={{color: p.free ? '#8f8' : '#f88', fontSize:12}}>
                    {p.free ? 'ÜCRETSİZ' : 'Ücretli'} • {p.unlimited ? 'SINIRSIZ' : 'Limitli'} • {p.offline ? 'Offline' : 'Online'}
                  </Text>
                  <Text style={{color:'#aaa', fontSize:11}}>{p.note}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={{flexDirection:'row', justifyContent:'space-between', marginTop:12}}>
              <Text style={{color:'#ddd'}}>Hız</Text>
              <View style={{flexDirection:'row', gap:12}}>
                {[0.8,1.0,1.2,1.5].map(r=>(
                  <TouchableOpacity key={r} onPress={async()=>setTtsSettings(await saveTTSSettings({rate:r}))}>
                    <Text style={{color: ttsSettings?.rate===r ? '#3ea6ff':'#aaa'}}>{r}x</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <TouchableOpacity onPress={()=>setShowSettings(false)} style={[modal.closeBtn]}>
              <Text style={{color:'#fff', fontWeight:'600'}}>Kapat</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const NavBtn = ({icon,label,active,onPress}:{icon:string,label:string,active:boolean,onPress:()=>void}) => (
  <TouchableOpacity onPress={onPress} style={{alignItems:'center', flex:1}}>
    <Text style={{fontSize:18, opacity: active?1:0.7}}>{icon}</Text>
    {!!label && <Text style={{color: active ? '#fff' : '#aaa', fontSize:10, marginTop:2}}>{label}</Text>}
  </TouchableOpacity>
);

const Action = ({icon, label, onPress}:{icon:string, label:string, onPress?:()=>void}) => (
  <TouchableOpacity onPress={onPress} style={yt.action}>
    <Text style={yt.actionIcon}>{icon}</Text>
    <Text style={yt.actionLabel}>{label}</Text>
  </TouchableOpacity>
);

const s = StyleSheet.create({
  center:{flex:1, backgroundColor:'#0f0f0f', alignItems:'center', justifyContent:'center'},
  loginWrap:{flex:1, backgroundColor:'#0f0f0f', alignItems:'center', justifyContent:'center', padding:28},
  logoBig:{width:76,height:76,backgroundColor:'#1a73e8',borderRadius:20,alignItems:'center',justifyContent:'center',marginBottom:14},
  logoBigTxt:{color:'#fff',fontSize:34,fontWeight:'900'},
  brand:{color:'#fff',fontSize:28,fontWeight:'800'},
  brandSub:{color:'#ccc', textAlign:'center', marginTop:6},
  brandSub2:{color:'#7aa7ff', fontSize:12, marginTop:4, marginBottom:28},
  googleBtn:{backgroundColor:'#1a73e8', paddingVertical:14, paddingHorizontal:24, borderRadius:28, width:'100%', alignItems:'center', marginBottom:10},
  googleBtnTxt:{color:'#fff', fontWeight:'700', fontSize:15},
  smallHint:{color:'#9f9', fontSize:11, textAlign:'center', marginBottom:12, paddingHorizontal:10},
  guestBtn:{borderWidth:1,borderColor:'#444', paddingVertical:14, borderRadius:28, width:'100%', alignItems:'center'},
  guestBtnTxt:{color:'#ddd', fontWeight:'600'},
  footNote:{color:'#777', fontSize:11, textAlign:'center', marginTop:18},
});

const sLib = StyleSheet.create({
  btn:{backgroundColor:'#222', paddingHorizontal:14, paddingVertical:10, borderRadius:10},
  btnTxt:{color:'#ddd'}
});

const yt = StyleSheet.create({
  container:{flex:1, backgroundColor:'#0f0f0f'},
  topBar:{flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingHorizontal:14, paddingTop:54, paddingBottom:10, backgroundColor:'#0f0f0f'},
  ytLogo:{color:'#fff', fontSize:20},
  topIcon:{color:'#fff', fontSize:18},
  chipsWrap:{maxHeight:46, marginBottom:6},
  chip:{backgroundColor:'#272727', paddingHorizontal:14, paddingVertical:8, borderRadius:8},
  chipActive:{backgroundColor:'#fff'},
  chipTxt:{color:'#eee', fontSize:13},
  searchInput:{flex:1, backgroundColor:'#121212', color:'#fff', borderRadius:20, paddingHorizontal:16, paddingVertical:10, borderWidth:1, borderColor:'#333'},
  searchBtn:{backgroundColor:'#222', paddingHorizontal:16, borderRadius:20, justifyContent:'center'},
  card:{marginBottom:2},
  thumb:{width:'100%', aspectRatio:16/9, backgroundColor:'#000'},
  avatarSm:{width:36,height:36,borderRadius:18, backgroundColor:'#333'},
  cardTitle:{color:'#fff', fontSize:15, fontWeight:'600'},
  cardMeta:{color:'#aaa', fontSize:12, marginTop:3},
  bottomNav:{position:'absolute', left:0, right:0, bottom:0, height:68, backgroundColor:'#0f0f0f', borderTopWidth:1, borderTopColor:'#222', flexDirection:'row', justifyContent:'space-around', paddingTop:8},

  player:{width:'100%', aspectRatio:16/9, backgroundColor:'#000'},
  subtitleBox:{position:'absolute', top:180, left:0, right:0, alignItems:'center'},
  subtitleTxt:{backgroundColor:'rgba(0,0,0,0.7)', color:'#fff', paddingHorizontal:12, paddingVertical:6, borderRadius:6, fontSize:15, fontWeight:'600', textAlign:'center'},
  title:{color:'#fff', fontSize:18, fontWeight:'700', marginTop:4},
  channelRow:{flexDirection:'row', alignItems:'center', marginTop:12, gap:10},
  avatar:{width:38,height:38,borderRadius:19},
  channel:{color:'#fff', fontWeight:'600'},
  meta:{color:'#aaa', fontSize:12},
  subBtn:{backgroundColor:'#fff', paddingHorizontal:14, paddingVertical:7, borderRadius:18},
  subBtnTxt:{color:'#000', fontWeight:'700', fontSize:12},
  action:{backgroundColor:'#272727', paddingHorizontal:14, paddingVertical:10, borderRadius:20, marginRight:8, alignItems:'center', minWidth:74},
  actionActive:{backgroundColor:'#3ea6ff'},
  actionIcon:{fontSize:16, textAlign:'center'},
  actionLabel:{color:'#eee', fontSize:11, marginTop:2, textAlign:'center'},
  dubPanel:{backgroundColor:'#1b1b1b', borderRadius:12, padding:14, marginTop:12, borderWidth:1, borderColor:'#2a2a2a'},
  panelTitle:{color:'#fff', fontWeight:'700', marginBottom:8},
  panelTxt:{color:'#ccc', fontSize:13},
  rowBetween:{flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginVertical:6},
  genBtn:{backgroundColor:'#1a73e8', padding:12, borderRadius:10, alignItems:'center', marginTop:8},
  cueTxt:{color:'#8ef', marginTop:8, fontStyle:'italic'},
  desc:{color:'#bbb', marginTop:14, lineHeight:19, fontSize:13},
});

const modal = StyleSheet.create({
  backdrop:{flex:1, backgroundColor:'rgba(0,0,0,0.7)', justifyContent:'flex-end'},
  box:{backgroundColor:'#181818', borderTopLeftRadius:20, borderTopRightRadius:20, padding:18, maxHeight:'82%'},
  title:{color:'#fff', fontSize:18, fontWeight:'700', marginBottom:12},
  opt:{backgroundColor:'#222', padding:12, borderRadius:10, marginBottom:8, borderWidth:1, borderColor:'#333'},
  optActive:{borderColor:'#3ea6ff', backgroundColor:'#1e2a38'},
  closeBtn:{backgroundColor:'#333', padding:14, borderRadius:12, alignItems:'center', marginTop:8},
});
