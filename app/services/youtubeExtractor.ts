// TubeNest – NewPipeExtractor JS port
// Mantık: NewPipe.java init → StreamingService → StreamExtractor
// Burada youtubei.js kullanıyoruz (Innertube client spoof – NewPipe ile aynı)

import Innertube from 'youtubei.js';

export type StreamInfo = {
  id: string;
  title: string;
  uploader: string;
  uploaderUrl: string;
  viewCount: string;
  likeCount?: number;
  description: string;
  thumbnails: string[];
  hlsUrl?: string;
  audioUrl?: string;
  duration: number;
};

let yt: any = null;

async function getYT() {
  if (!yt) {
    // NewPipe client spoof mantığı – ANDROID_VR / IOS / TV
    yt = await Innertube.create({
      retrieve_player: true,
      enable_session_cache: true,
    });
  }
  return yt;
}

// NewPipe: LinkHandler.parse(url) -> videoId
export function parseYouTubeId(input: string): string {
  try {
    const u = new URL(input);
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1);
    return u.searchParams.get('v') || input;
  } catch {
    return input;
  }
}

// NewPipe: StreamExtractor.getInfo()
export async function extractStream(urlOrId: string): Promise<StreamInfo> {
  const id = parseYouTubeId(urlOrId);
  const youtube = await getYT();

  // NewPipeExtractor -> fetchPage()
  const info = await youtube.getInfo(id);

  // NewPipe: getStreamingData()
  const formats = info.streaming_data?.adaptive_formats || info.streaming_data?.formats || [];
  
  // En iyi video
  const video = [...formats].filter((f:any)=>f.has_video).sort((a:any,b:any)=>(b.bitrate||0)-(a.bitrate||0))[0];
  // En iyi audio – background player için
  const audio = [...formats].filter((f:any)=>f.has_audio && !f.has_video).sort((a:any,b:any)=>(b.bitrate||0)-(a.bitrate||0))[0];

  const basic = info.basic_info;
  
  return {
    id,
    title: basic.title || 'Untitled',
    uploader: basic.author || '',
    uploaderUrl: `https://www.youtube.com/@${basic.channel_id}`,
    viewCount: basic.view_count?.toString() || '-1',
    description: basic.short_description || '',
    thumbnails: basic.thumbnail?.map((t:any)=>t.url) || [],
    hlsUrl: info.streaming_data?.hls_manifest_url || video?.decipher_url || video?.url,
    audioUrl: audio?.decipher_url || audio?.url,
    duration: basic.duration || 0,
  };
}

export async function searchYouTube(query: string) {
  const youtube = await getYT();
  const res = await youtube.search(query);
  return res.videos.slice(0, 20).map((v:any)=>({
    id: v.id,
    title: v.title.text,
    uploader: v.author?.name,
    thumbnails: v.thumbnails
  }));
}

// NewPipeExtractor fallback chain – SABR / 403 fix
export async function extractWithFallback(id: string) {
  const endpoints = [
    () => extractStream(id),
    // Piped fallback
    async () => {
      const r = await fetch(`https://pipedapi.kavin.rocks/streams/${id}`);
      const j = await r.json();
      return {
        id,
        title: j.title,
        uploader: j.uploader,
        uploaderUrl: j.uploaderUrl,
        viewCount: String(j.views),
        description: j.description,
        thumbnails: j.thumbnailUrl ? [j.thumbnailUrl] : [],
        hlsUrl: j.hls,
        audioUrl: j.audioStreams?.[0]?.url,
        duration: j.duration
      } as StreamInfo;
    }
  ];
  for (const fn of endpoints) {
    try { return await fn(); } catch {}
  }
  throw new Error('All extractors failed – NewPipe 403 gibi');
}
