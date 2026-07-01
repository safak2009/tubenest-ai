// TubeNest Edge-TTS Proxy – %100 ücretsiz, sınırsız
// 10 satır core – NewPipe güvenli mimari: extractor ayrı module
// Kur: npm i && npm start
// Deploy: flyctl launch / railway / render – ücretsiz tier yeter

import express from 'express';
import cors from 'cors';
import { EdgeTTS } from 'node-edge-tts';

const app = express();
app.use(cors());
app.use(express.json());

// GET /tts?text=merhaba&voice=tr-TR-EmelNeural&rate=+0%
app.get('/tts', async (req, res) => {
  try {
    const text = String(req.query.text || '').slice(0, 5000);
    const voice = String(req.query.voice || 'tr-TR-EmelNeural');
    const rate = String(req.query.rate || '+0%');
    const pitch = String(req.query.pitch || '+0Hz');
    if (!text) return res.status(400).send('text required');

    const tts = new EdgeTTS();
    await tts.setMetadata(voice, { rate, pitch });
    const audio = await tts.toBuffer(text); // mp3 buffer

    res.set({
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'public, max-age=31536000',
      'Access-Control-Allow-Origin': '*'
    });
    res.send(audio);
  } catch (e) {
    console.error(e);
    res.status(500).send(String(e));
  }
});

// POST JSON – uzun metinler için
app.post('/tts', async (req, res) => {
  req.query = { ...req.query, ...req.body };
  return app._router.handle({ ...req, method: 'GET', url: '/tts' }, res, ()=>{});
});

// Ses listesi – ayarlardan seçilebilir
app.get('/voices', async (req, res) => {
  // statik liste – Edge 400+ ses
  res.json([
    { name: 'tr-TR-EmelNeural', lang: 'tr-TR', gender: 'female', free: true },
    { name: 'tr-TR-AhmetNeural', lang: 'tr-TR', gender: 'male', free: true },
    { name: 'en-US-JennyNeural', lang: 'en-US', gender: 'female', free: true },
    { name: 'en-US-GuyNeural', lang: 'en-US', gender: 'male', free: true },
    { name: 'de-DE-KatjaNeural', lang: 'de-DE', gender: 'female', free: true },
    { name: 'es-ES-ElviraNeural', lang: 'es-ES', gender: 'female', free: true },
    { name: 'ar-SA-ZariyahNeural', lang: 'ar-SA', gender: 'female', free: true },
    { name: 'fr-FR-DeniseNeural', lang: 'fr-FR', gender: 'female', free: true }
  ]);
});

app.get('/', (_req,res)=>res.send('TubeNest Edge-TTS – free & unlimited'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=> console.log(`Edge-TTS proxy :${PORT} – free unlimited`));
