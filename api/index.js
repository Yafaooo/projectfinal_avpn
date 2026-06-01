import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import multer from 'multer';

const app = express();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL   = process.env.MODEL || 'gemini-2.5-flash';

app.use(cors());
app.use(express.json({ limit: '50mb' }));

if (process.env.NODE_ENV !== 'production') {
  app.use(express.static(path.join(process.cwd(), 'public')));
}

async function geminiText(prompt) {
  const models = [MODEL, 'gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'];
  let lastError = null;
  for (const m of models) {
    if (!m) continue;
    for (const version of ['v1beta', 'v1']) {
      try {
        const url = `https://generativelanguage.googleapis.com/${version}/models/${m}:generateContent?key=${API_KEY}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        });
        const data = await res.json();
        if (data?.error) throw new Error(`${data.error.message} (${data.error.code})`);
        if (data?.candidates?.[0]?.content?.parts?.[0]?.text) {
          global.WORKING_MODEL = m;
          return data.candidates[0].content.parts[0].text;
        }
      } catch (e) { lastError = e; }
    }
  }
  throw lastError || new Error('All possible Gemini models failed.');
}

async function pollinationsFallback(prompt, model = 'flux') {
  try {
    const encodedPrompt = encodeURIComponent(prompt);
    const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&nologo=true&enhance=true&model=${model}&seed=${Date.now()}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
    const response = await fetch(pollinationsUrl, { signal: controller.signal });
    clearTimeout(timeout);
    if (response.ok) {
      const arrayBuffer = await response.arrayBuffer();
      const b64 = Buffer.from(arrayBuffer).toString('base64');
      return { b64, mime: 'image/png', source: 'pollinations' };
    }
  } catch (e) { console.error(`Pollinations (${model}) Failed:`, e.message); }
  return null;
}

function generateBeautifulSVGTemplate(prompt) {
  const words = prompt.split(' ').slice(0, 5).join(' ');
  const h1 = Math.floor(Math.random()*360), h2 = (h1+120)%360, h3 = (h1+240)%360;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <radialGradient id="bg" cx="50%" cy="50%"><stop offset="0%" stop-color="hsl(${h1},70%,15%)"/><stop offset="100%" stop-color="hsl(${h2},80%,5%)"/></radialGradient>
  </defs>
  <rect width="1024" height="1024" fill="url(#bg)"/>
  <text x="512" y="530" text-anchor="middle" font-family="'Segoe UI',Arial,sans-serif" font-weight="800" font-size="42" fill="white">${words.toUpperCase()}</text>
  </svg>`;
}

async function geminiGenerateImage(prompt, imageB64 = null, mime = 'image/jpeg') {
  const lowerPrompt = prompt.toLowerCase();
  const isRealIntent = lowerPrompt.includes('real') || lowerPrompt.includes('nyata');
  if (isRealIntent) {
    const res = await pollinationsFallback(prompt, 'flux') || await pollinationsFallback(prompt, 'turbo');
    if (res) return res;
  }
  if (API_KEY && !imageB64) {
    try {
      for (const IMAGE_MODEL of ['gemini-2.0-flash-preview-image-generation', 'gemini-2.0-flash-exp']) {
        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:generateContent?key=${API_KEY}`;
          const body = { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'] } };
          const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
          const data = await res.json();
          if (!data?.error) {
            const parts = data?.candidates?.[0]?.content?.parts || [];
            const img = parts.find(p => p.inline_data?.data);
            if (img) return { b64: img.inline_data.data, mime: img.inline_data.mime_type || 'image/png', source: 'gemini' };
          }
        } catch (e) {}
      }
    } catch (e) {}
  }
  const realismRes = await pollinationsFallback(prompt);
  if (realismRes) return realismRes;
  const fallbackSvg = generateBeautifulSVGTemplate(prompt);
  return { b64: Buffer.from(fallbackSvg).toString('base64'), mime: 'image/svg+xml', source: 'svg-template' };
}

function generateAnimatedSVG(prompt) {
  const words = prompt.split(' ').slice(0, 4).join(' ');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <rect width="1280" height="720" fill="#0a0a1a"/>
  <text x="640" y="370" text-anchor="middle" font-family="'Segoe UI', Arial, sans-serif" font-weight="700" font-size="38" fill="white">${words}</text>
  </svg>`;
}

app.post('/api/chat', upload.single('image'), async (req, res) => {
  let conversation;
  try { conversation = JSON.parse(req.body.conversation); } catch (e) { return res.status(400).json({ error: 'invalid conversation JSON' }); }
  if (!conversation || !Array.isArray(conversation)) return res.status(400).json({ error: 'conversation array required' });
  try {
    const contents = conversation.map(m => {
      const parts = [];
      if (m.text) parts.push({ text: m.text });
      if (m.imageB64 && m.mime) parts.push({ inline_data: { mime_type: m.mime, data: m.imageB64 } });
      return { role: m.role === 'bot' ? 'model' : 'user', parts };
    });
    if (req.file) {
      const b64 = req.file.buffer.toString('base64');
      contents[contents.length - 1].parts.push({ inline_data: { mime_type: req.file.mimetype, data: b64 } });
    }
    let data; let success = false;
    for (const m of [MODEL, 'gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash']) {
      if (!m) continue;
      for (const version of ['v1beta', 'v1']) {
        try {
          const today = new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
          const systemPrompt = `Kamu adalah YAFAO AI Studio — asisten AI cerdas, ramah, dan selalu memberikan informasi yang akurat dan terkini.

TANGGAL & WAKTU SEKARANG: ${today} (Waktu Indonesia Barat).

FAKTA PENTING YANG HARUS KAMU KETAHUI (prioritaskan ini di atas data latihanmu jika bertentangan):
- Presiden Republik Indonesia saat ini (2024-sekarang): PRABOWO SUBIANTO (dilantik 20 Oktober 2024, presiden ke-8 RI)
- Wakil Presiden RI saat ini: GIBRAN RAKABUMING RAKA
- Prabowo Subianto BUKAN lagi Menteri Pertahanan, beliau adalah PRESIDEN RI
- Tahun sekarang adalah 2026

GAYA MENJAWAB:
- Jawab dalam bahasa yang sama dengan pertanyaan pengguna (Indonesia/English)
- Berikan jawaban yang jelas, akurat, dan informatif
- Jika ada pertanyaan tentang fakta terkini, gunakan informasi di atas sebagai referensi utama
- Jangan ragu untuk mengoreksi informasi yang sudah usang dari data latihanmu`;

          const payload = {
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: contents
          };
          const resp = await fetch(`https://generativelanguage.googleapis.com/${version}/models/${m}:generateContent?key=${API_KEY}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
          });
          data = await resp.json();
          if (!data.error && data?.candidates?.[0]?.content?.parts?.[0]?.text) {
            success = true; global.WORKING_MODEL = m; break;
          }
        } catch (e) {}
      }
      if (success) break;
    }
    if (!success) throw new Error((data && data.error && data.error.message) ? data.error.message : 'All Chat models failed.');
    res.json({ result: data.candidates[0].content.parts[0].text, conversation });
  } catch (e) {
    res.status(500).json({ error: 'Chat system unavailable.', details: e.message });
  }
});

app.post('/api/generate-image', async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'prompt required' });
  try {
    const { b64, mime, source } = await geminiGenerateImage(prompt);
    res.json({ success: true, imageUrl: `data:${mime};base64,${b64}`, b64, mime, source, prompt });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/image-to-image', upload.single('image'), async (req, res) => {
  const { prompt } = req.body; const file = req.file;
  if (!prompt || !file) return res.status(400).json({ error: 'prompt & image required' });
  try {
    const result = await geminiGenerateImage(prompt, file.buffer.toString('base64'), file.mimetype);
    res.json({ success: true, imageUrl: `data:${result.mime};base64,${result.b64}`, b64: result.b64, mime: result.mime, prompt });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/generate-video', async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'prompt required' });
  const b64 = Buffer.from(generateAnimatedSVG(prompt)).toString('base64');
  res.json({ jobId: `vid_${Date.now()}`, status: 'done', progress: 100, videoUrl: `data:image/svg+xml;base64,${b64}`, isSimulated: true });
});

app.post('/api/image-to-video', upload.single('image'), async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'prompt required' });
  const b64 = Buffer.from(generateAnimatedSVG(prompt)).toString('base64');
  res.json({ jobId: `vid_${Date.now()}`, status: 'done', progress: 100, videoUrl: `data:image/svg+xml;base64,${b64}`, isSimulated: true });
});

app.get('/api/video-status/:jobId', (req, res) => res.json({ status: 'done', progress: 100 }));
app.get('/api/model-status', (_, res) => res.json({ model: global.WORKING_MODEL || MODEL, status: 'online' }));
app.get('/api/media-gallery', (_, res) => res.json([]));
app.delete('/api/chat/history', (_, res) => res.json({ message: 'History dihapus' }));
app.delete('/api/media/:filename', (req, res) => res.json({ ok: true }));

export default app;
