// Parser testleri – madde 4
// NewPipe: her extractor için unit test var

import { extractStreamUniversal } from '../services/extractor/index';
import { PARSER_TEST_URLS } from '../services/config';

describe('YouTube Extractor – NewPipe parity', () => {
  jest.setTimeout(30000);

  test.each(PARSER_TEST_URLS)('extract %s', async (url) => {
    const info = await extractStreamUniversal(url, 'youtube');
    expect(info.title).toBeTruthy();
    expect(info.id).toBeTruthy();
    expect(info.videoStreams.length + info.audioStreams.length).toBeGreaterThan(0);
    expect(info.thumbnails.length).toBeGreaterThan(0);
    // NewPipe: viewCount -1 olabilir ama field var
    expect(info.viewCount).toBeDefined();
  });

  test('fallback chain works', async () => {
    // innertube kapalıyken piped dene
    const info = await extractStreamUniversal('dQw4w9WgXcQ');
    expect(info.hlsUrl || info.videoStreams[0]?.url).toBeTruthy();
  });

  test('subtitles parsed', async () => {
    const info = await extractStreamUniversal(PARSER_TEST_URLS[0]);
    // altyazı olabilir / olmayabilir – array olmalı
    expect(Array.isArray(info.subtitles)).toBe(true);
  });
});

// npm test
// CI: her PR'da parser testleri koşsun – madde 4
