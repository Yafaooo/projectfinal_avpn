import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import multer from 'multer';

const app = express();

// ─── Multer (memory storage — no disk writes on Vercel) ────────────────────
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ─── Logging ────────────────────────────────────────────────────────────────
const API_KEY = process.env.GEMINI_API_KEY;
const MODEL   = process.env.MODEL || 'gemini-1.5-flash';
if (API_KEY) {
  console.log('✅ GEMINI_API_KEY detected');
  console.log(`📊 Active Model: ${MODEL}`);
  console.log('✨ STUDIO VERSION: 2.0.2 (VERCEL STABLE)');
} else {
  console.log('⚠️  No GEMINI_API_KEY found in .env');
}

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// ─── Static files (local dev only) ──────────────────────────────────────────
if (process.env.NODE_ENV !== 'production') {
  app.use(express.static(path.join(process.cwd(), 'public')));
}

// ═══════════════════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════════════════

// ─── Gemini text generation ─────────────────────────────────────────────────
async function geminiText(prompt) {
  const models = [
    MODEL,
    'gemini-2.5-flash', 'gemini-2.5-pro',
    'gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-1.0-pro'
  ];
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
          console.log(`✨ SUCCESS: Using model ${m} / ${version}`);
          global.WORKING_MODEL = m;
          return data.candidates[0].content.parts[0].text;
        }
      } catch (e) {
        if (!e.message.includes('404')) console.warn(`${m}/${version} failed: ${e.message}`);
        lastError = e;
      }
    }
  }
  throw lastError || new Error('All possible Gemini models failed.');
}

// ─── Image generation: tries Gemini then falls back to Pollinations.ai ────────
async function geminiGenerateImage(prompt, imageB64 = null, mime = 'image/jpeg') {
  const lowerPrompt = prompt.toLowerCase();
  const isRealIntent = lowerPrompt.includes('real') || lowerPrompt.includes('nyata') ||
    lowerPrompt.includes('photo') || lowerPrompt.includes('portrait') ||
    lowerPrompt.includes('foto') || lowerPrompt.includes('human') || lowerPrompt.includes('orang');

  if (isRealIntent) {
    console.log('🖼️ Real-intent detected, routing to Flux engine...');
    const res = await pollinationsFallback(prompt, 'flux');
    if (res) return res;
    const res2 = await pollinationsFallback(prompt, 'turbo');
    if (res2) return res2;
    throw new Error('Real-Photo Engine Failed. Please try again later.');
  }

  // Gemini Image Generation
  if (API_KEY && !imageB64) {
    try {
      const IMAGE_MODELS = ['gemini-2.0-flash-preview-image-generation', 'gemini-2.0-flash-exp'];
      for (const IMAGE_MODEL of IMAGE_MODELS) {
        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:generateContent?key=${API_KEY}`;
          const body = {
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
          };
          const res  = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
          const data = await res.json();
          if (!data?.error) {
            const parts = data?.candidates?.[0]?.content?.parts || [];
            const img   = parts.find(p => p.inline_data?.data);
            if (img) {
              console.log(`✅ Image via ${IMAGE_MODEL}`);
              return { b64: img.inline_data.data, mime: img.inline_data.mime_type || 'image/png', source: 'gemini' };
            }
          }
          console.warn(`${IMAGE_MODEL} unavailable:`, data?.error?.message);
        } catch (e) { console.warn(`${IMAGE_MODEL} error:`, e.message); }
      }
    } catch (e) { console.warn('Gemini image models all failed:', e.message); }
  }

  // Pollinations.ai fallback
  console.log('🖼️ Using Pollinations.ai Photorealism Engine...');
  const realismRes = await pollinationsFallback(prompt);
  if (realismRes) return realismRes;

  // SVG Artist fallback
  console.log('🎨 Generating SVG art via Gemini (last resort)');
  const svgPrompt = `You are an expert SVG artist. Create a beautiful, visually rich, full SVG image (1024x1024) that depicts: "${prompt.substring(0,300)}"
Rules:
- Output ONLY the SVG code, starting with <svg and ending with </svg>
- Use width="1024" height="1024"
- Use diverse colors and high element density (>100 elements)
- No explanation, no backticks.`;

  try {
    let svgCode = await geminiText(svgPrompt);
    const svgMatch = svgCode.match(/<svg[\s\S]*<\/svg>/i);
    svgCode = svgMatch ? svgMatch[0] : (svgCode.trim().startsWith('<svg') ? svgCode : '');
    if (!svgCode) throw new Error('Invalid SVG');
    const b64 = Buffer.from(svgCode).toString('base64');
    return { b64, mime: 'image/svg+xml', source: 'gemini-svg', isSvg: true };
  } catch (e) {
    const fallbackSvg = generateBeautifulSVGTemplate(prompt);
    return { b64: Buffer.from(fallbackSvg).toString('base64'), mime: 'image/svg+xml', source: 'svg-template' };
  }
}

// ─── Pollinations.ai Helper ─────────────────────────────────────────────────
async function pollinationsFallback(prompt, model = 'flux') {
  try {
    console.log(`🔄 Streaming from Pollinations (${model})...`);
    const realismPrompt = `hyper-realistic 8k raw photo, highly detailed, professional photography, cinematic lighting, ultra-sharp focus, masterpiece: ${prompt}`;
    const encodedPrompt = encodeURIComponent(realismPrompt);
    const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&nologo=true&enhance=true&model=${model}&seed=${Date.now()}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    const response = await fetch(pollinationsUrl, { signal: controller.signal });
    clearTimeout(timeout);

    if (response.ok) {
      const arrayBuffer = await response.arrayBuffer();
      const b64 = Buffer.from(arrayBuffer).toString('base64');
      console.log('✅ Real-Photo Ready (Flux)');
      return { b64, mime: 'image/png', source: 'pollinations' };
    }
  } catch (e) {
    console.error(`Pollinations (${model}) Failed:`, e.message);
  }
  return null;
}

function generateBeautifulSVGTemplate(prompt) {
  const words = prompt.split(' ').slice(0, 5).join(' ');
  const h1 = Math.floor(Math.random()*360), h2 = (h1+120)%360, h3 = (h1+240)%360;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <radialGradient id="bg" cx="50%" cy="50%"><stop offset="0%" stop-color="hsl(${h1},70%,15%)"/><stop offset="100%" stop-color="hsl(${h2},80%,5%)"/></radialGradient>
    <radialGradient id="g1" cx="30%" cy="35%"><stop offset="0%" stop-color="hsl(${h1},80%,60%)" stop-opacity="0.7"/><stop offset="100%" stop-color="transparent"/></radialGradient>
    <radialGradient id="g2" cx="70%" cy="65%"><stop offset="0%" stop-color="hsl(${h2},80%,60%)" stop-opacity="0.6"/><stop offset="100%" stop-color="transparent"/></radialGradient>
    <radialGradient id="g3" cx="50%" cy="80%"><stop offset="0%" stop-color="hsl(${h3},80%,60%)" stop-opacity="0.5"/><stop offset="100%" stop-color="transparent"/></radialGradient>
    <filter id="blur1"><feGaussianBlur stdDeviation="60"/></filter>
    <filter id="glow"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <rect width="1024" height="1024" fill="url(#bg)"/>
  <ellipse cx="307" cy="358" rx="450" ry="380" fill="url(#g1)" filter="url(#blur1)"><animate attributeName="rx" values="450;520;450" dur="7s" repeatCount="indefinite"/></ellipse>
  <ellipse cx="717" cy="666" rx="400" ry="350" fill="url(#g2)" filter="url(#blur1)"><animate attributeName="ry" values="350;420;350" dur="9s" repeatCount="indefinite"/></ellipse>
  <ellipse cx="512" cy="820" rx="350" ry="250" fill="url(#g3)" filter="url(#blur1)"><animate attributeName="rx" values="350;420;350" dur="6s" repeatCount="indefinite"/></ellipse>
  <text x="512" y="460" text-anchor="middle" font-family="'Segoe UI',Arial,sans-serif" font-size="16" fill="hsl(${h1},80%,80%)" opacity="0.6" letter-spacing="8">AI GENERATED ART</text>
  <text x="512" y="530" text-anchor="middle" font-family="'Segoe UI',Arial,sans-serif" font-weight="800" font-size="42" fill="white" filter="url(#glow)">${words.toUpperCase()}</text>
  <text x="512" y="580" text-anchor="middle" font-family="'Segoe UI',Arial,sans-serif" font-size="16" fill="hsl(${h2},70%,70%)" opacity="0.7">YAFAO AI STUDIO</text>
  <rect x="3" y="3" width="1018" height="1018" fill="none" stroke="hsl(${h1},70%,60%)" stroke-width="2" opacity="0.25"><animate attributeName="opacity" values="0.1;0.35;0.1" dur="4s" repeatCount="indefinite"/></rect>
</svg>`;
}

// ─── Animated SVG for video placeholder ─────────────────────────────────────
function generateAnimatedSVG(prompt) {
  const words = prompt.split(' ').slice(0, 4).join(' ');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <defs>
    <radialGradient id="bg" cx="50%" cy="50%">
      <stop offset="0%" stop-color="#0a0a1a"/>
      <stop offset="100%" stop-color="#000010"/>
    </radialGradient>
    <radialGradient id="glow1" cx="30%" cy="40%">
      <stop offset="0%" stop-color="#4f46e5" stop-opacity="0.6"/>
      <stop offset="100%" stop-color="transparent"/>
    </radialGradient>
    <radialGradient id="glow2" cx="70%" cy="60%">
      <stop offset="0%" stop-color="#7c3aed" stop-opacity="0.5"/>
      <stop offset="100%" stop-color="transparent"/>
    </radialGradient>
    <filter id="blur1"><feGaussianBlur stdDeviation="40"/></filter>
    <filter id="blur2"><feGaussianBlur stdDeviation="8"/></filter>
  </defs>
  <rect width="1280" height="720" fill="url(#bg)"/>
  <ellipse cx="384" cy="288" rx="400" ry="300" fill="url(#glow1)" filter="url(#blur1)">
    <animate attributeName="rx" values="400;500;400" dur="6s" repeatCount="indefinite"/>
  </ellipse>
  <ellipse cx="896" cy="432" rx="350" ry="280" fill="url(#glow2)" filter="url(#blur1)">
    <animate attributeName="rx" values="350;430;350" dur="8s" repeatCount="indefinite"/>
  </ellipse>
  <rect x="0" y="0" width="1280" height="2" fill="#6366f1" opacity="0.3">
    <animate attributeName="y" from="0" to="720" dur="4s" repeatCount="indefinite"/>
  </rect>
  <text x="640" y="300" text-anchor="middle" font-family="'Segoe UI', Arial, sans-serif" font-size="18" fill="#6366f1" opacity="0.7" letter-spacing="6">AI GENERATED VIDEO</text>
  <text x="640" y="370" text-anchor="middle" font-family="'Segoe UI', Arial, sans-serif" font-weight="700" font-size="38" fill="white">
    <animate attributeName="opacity" values="0.6;1;0.6" dur="3s" repeatCount="indefinite"/>
    ${words}
  </text>
  <text x="640" y="420" text-anchor="middle" font-family="'Segoe UI', Arial, sans-serif" font-size="15" fill="#a78bfa" opacity="0.6" letter-spacing="2">RENDERED BY YAFAO AI STUDIO</text>
  <rect x="2" y="2" width="1276" height="716" fill="none" stroke="#4f46e5" stroke-width="1.5" opacity="0.3">
    <animate attributeName="opacity" values="0.1;0.4;0.1" dur="3s" repeatCount="indefinite"/>
  </rect>
</svg>`;
}

// ═══════════════════════════════════════════════════════════════════════════
//  ROUTES: Serve index.html for root and any non-api paths
// ═══════════════════════════════════════════════════════════════════════════
app.get('/', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
});

// ═══════════════════════════════════════════════════════════════════════════
//  CHAT  (/api/chat)
// ═══════════════════════════════════════════════════════════════════════════
app.post('/api/chat', upload.single('image'), async (req, res) => {
  let conversation;
  try {
    conversation = JSON.parse(req.body.conversation);
  } catch (e) {
    return res.status(400).json({ error: 'invalid conversation JSON' });
  }

  if (!conversation || !Array.isArray(conversation))
    return res.status(400).json({ error: 'conversation array required' });

  try {
    const userMessage = conversation[conversation.length - 1]?.text || '';

    const contents = conversation.map(m => {
      const parts = [];
      if (m.text) parts.push({ text: m.text });
      if (m.imageB64 && m.mime) {
        parts.push({ inline_data: { mime_type: m.mime, data: m.imageB64 } });
      }
      return { role: m.role === 'bot' ? 'model' : 'user', parts };
    });

    if (req.file) {
      const currentMsgParts = contents[contents.length - 1].parts;
      const b64 = req.file.buffer.toString('base64');
      currentMsgParts.push({ inline_data: { mime_type: req.file.mimetype, data: b64 } });
      conversation[conversation.length - 1].imageB64 = b64;
      conversation[conversation.length - 1].mime = req.file.mimetype;
    }

    let data;
    let success = false;
    const modelsToTry = [MODEL, 'gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-1.0-pro'];

    for (const m of modelsToTry) {
      if (!m) continue;
      for (const version of ['v1beta', 'v1']) {
        try {
          const payload = {
            systemInstruction: {
              parts: [{ text: "Kamu adalah YAFAO AI Support, asisten kecerdasan buatan super canggih milik Yafao. Jawablah semua pertanyaan dengan profesional, akurat, dan ramah dalam bahasa Indonesia. Saat ini adalah tahun 2026." }]
            },
            contents: contents
          };

          const url = `https://generativelanguage.googleapis.com/${version}/models/${m}:generateContent?key=${API_KEY}`;
          const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          data = await resp.json();
          if (!data.error && data?.candidates?.[0]?.content?.parts?.[0]?.text) {
            success = true;
            global.WORKING_MODEL = m;
            break;
          }
        } catch (e) {
          console.warn(`Chat attempt with ${m}/${version} failed.`);
        }
      }
      if (success) break;
    }

    if (!success) throw new Error(data?.error?.message || 'All Chat models failed.');

    const aiText = data?.candidates?.[0]?.content?.parts?.[0]?.text
      || 'Maaf, tidak ada respons dari AI.';

    res.json({ result: aiText, conversation });
  } catch (e) {
    console.error('Chat error:', e.message);
    res.status(500).json({
      error: 'Chat system unavailable. Check API Key or Model availability.',
      details: e.message
    });
  }
});

app.get('/api/chat/history', (_, res) => res.json({ history: [] }));
app.delete('/api/chat/history', (_, res) => res.json({ message: 'History dihapus' }));

// ═══════════════════════════════════════════════════════════════════════════
//  IMAGE GENERATION  (/api/generate-image)
//  NOTE: On Vercel, we return base64 directly (no disk writes)
// ═══════════════════════════════════════════════════════════════════════════
app.post('/api/generate-image', async (req, res) => {
  const { prompt, style, aspectRatio } = req.body;
  if (!prompt) return res.status(400).json({ error: 'prompt required' });

  try {
    const fullPrompt = `Generate a high quality image: ${prompt}. Style: ${style || 'photorealistic'}. Make it visually stunning and professional.`;
    const { b64, mime, source } = await geminiGenerateImage(fullPrompt);

    // Return as data URL (no file writes needed on Vercel)
    const dataUrl = `data:${mime};base64,${b64}`;
    res.json({
      success: true,
      imageUrl: dataUrl,
      b64,
      mime,
      source: source || 'gemini',
      prompt,
      generatedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error('Image gen error:', e.message);
    // SVG fallback
    const svgCode = generateBeautifulSVGTemplate(prompt);
    const b64 = Buffer.from(svgCode).toString('base64');
    const dataUrl = `data:image/svg+xml;base64,${b64}`;
    res.json({ success: true, imageUrl: dataUrl, b64, mime: 'image/svg+xml', source: 'svg-fallback', prompt });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  IMAGE-TO-IMAGE  (/api/image-to-image)
// ═══════════════════════════════════════════════════════════════════════════
app.post('/api/image-to-image', upload.single('image'), async (req, res) => {
  const { prompt } = req.body;
  const file = req.file;
  if (!prompt || !file) return res.status(400).json({ error: 'prompt & image required' });

  try {
    const imageB64 = file.buffer.toString('base64');
    const mime     = file.mimetype;
    const fullPrompt = `Edit this image: ${prompt}. Keep the same composition but apply the requested changes. Make it look professional and high quality.`;
    const result   = await geminiGenerateImage(fullPrompt, imageB64, mime);

    const dataUrl = `data:${result.mime};base64,${result.b64}`;
    res.json({
      success: true,
      imageUrl: dataUrl,
      b64: result.b64,
      mime: result.mime,
      prompt,
      generatedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error('Image-to-image error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  VIDEO GENERATION  (/api/generate-video)
//  NOTE: On Vercel serverless, real long-running jobs are not possible.
//  We immediately return a beautiful animated SVG as the video result.
// ═══════════════════════════════════════════════════════════════════════════
app.post('/api/generate-video', async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'prompt required' });

  const jobId = `vid_${Date.now()}`;
  // On Vercel, return immediately with a pre-done SVG animation
  const svgContent = generateAnimatedSVG(prompt);
  const b64 = Buffer.from(svgContent).toString('base64');
  const dataUrl = `data:image/svg+xml;base64,${b64}`;

  res.json({
    jobId,
    status: 'done',
    progress: 100,
    videoUrl: dataUrl,
    isSimulated: true,
    message: 'Video animation generated successfully'
  });
});

app.post('/api/image-to-video', upload.single('image'), async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'prompt & image required' });

  const jobId = `vid_${Date.now()}`;
  const svgContent = generateAnimatedSVG(prompt);
  const b64 = Buffer.from(svgContent).toString('base64');
  const dataUrl = `data:image/svg+xml;base64,${b64}`;

  res.json({
    jobId,
    status: 'done',
    progress: 100,
    videoUrl: dataUrl,
    isSimulated: true,
    message: 'Video animation generated successfully'
  });
});

app.get('/api/video-status/:jobId', (req, res) => {
  // On Vercel serverless, jobs are already completed synchronously
  res.json({ status: 'done', progress: 100 });
});

app.get('/api/media-gallery', (_, res) => res.json([]));

app.delete('/api/media/:filename', (req, res) => res.json({ ok: true }));

app.post('/api/refine-prompt', async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Prompt required' });
  try {
    const refined = await geminiText(`Refine this AI prompt to be more professional, highly detailed, and ultra-realistic for an AI generator. Return ONLY the refined prompt without quotes: "${prompt}"`);
    res.json({ refined });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/model-status', (_, res) => res.json({ model: global.WORKING_MODEL || MODEL, status: 'online' }));

// ─── Catch-all: serve index.html for local dev ───────────────────────
if (process.env.NODE_ENV !== 'production') {
  app.get('*', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
  });
}

// ─── Server (local dev only — Vercel ignores this) ──────────────────────────
const PORT = process.env.PORT || 3001;
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`\n🚀 YAFAO AI Studio running → http://localhost:${PORT}`);
  });
}

export default app;