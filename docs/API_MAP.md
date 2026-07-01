# NewPipe → TubeNest API eşleme

NewPipeExtractor (Java)
- NewPipe.init(downloader)
- ServiceList.getService(0) // YouTube
- service.getStreamLHFactory().fromUrl(url)
- extractor = service.getStreamExtractor(linkHandler)
- extractor.fetchPage()
- StreamInfo.getInfo(extractor)

TubeNest JS
- getYT() // Innertube.create()
- parseYouTubeId()
- extractStream(id)
- youtube.getInfo(id)

Metod eşleme:
getName() → basic_info.title
getThumbnails() → basic_info.thumbnail[]
getDescription() → basic_info.short_description
getUploaderName() → basic_info.author
getUploaderUrl() → channel_id
getViewCount() → basic_info.view_count
getLikeCount() → basic_info.like_count
getLength() → basic_info.duration
getSubtitles() → player_captions_tracklist
getAudioStreams() → streaming_data.adaptive_formats audio only
getVideoStreams() → streaming_data.adaptive_formats video only
getHlsUrl() → streaming_data.hls_manifest_url

Background Player: audioUrl only indir
Popup Player: expo-av + overlay
Download: expo-file-system
