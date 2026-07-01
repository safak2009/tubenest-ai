// 1. madde: ileride farklı platformlar eklenebilir
// PeerTube stub – NewPipe ile aynı serviceId

import { StreamingService, ServiceId } from '../extractor/types';

export class PeerTubeService implements StreamingService {
  serviceId: ServiceId = 'peertube';
  getName() { return 'PeerTube'; }
  getStreamExtractor() { throw new Error('PeerTube not enabled yet – enable extractor_peertube_enabled flag'); }
  getSearchExtractor() { return null; }
  getChannelExtractor() { return null; }
}

// Kayıt:
// import { registerService } from '../extractor/index';
// registerService('peertube', new PeerTubeService());
