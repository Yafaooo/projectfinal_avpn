import 'dotenv/config';

async function listModels() {
  const API_KEY = process.env.GEMINI_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`;
  
  try {
    const res = await fetch(url);
    const data = await res.json();
    console.log('--- AVAILABLE MODELS ---');
    if (data.models) {
      data.models.forEach(m => {
        console.log(`${m.name.replace('models/', '')} [${m.supportedGenerationMethods.join(', ')}]`);
      });
    } else {
      console.log('No models found or error:', data);
    }
  } catch (e) {
    console.error('Fetch error:', e.message);
  }
}

listModels();
