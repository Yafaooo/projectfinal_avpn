import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// log mode based on key
if (process.env.GEMINI_API_KEY) {
  console.log('✅ GEMINI_API_KEY detected');
  console.log(`📊 Model: ${process.env.MODEL || 'gemini-2.5-flash'}`);
  console.log('🤖 Chatbot ready to use Gemini AI API');
} else {
  console.log('⚠️ No GEMINI_API_KEY in .env file');
}




app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, 'public')));


// File untuk menyimpan chat history
const CHAT_HISTORY_FILE = path.join(__dirname, 'chat_history.json');

// Fungsi untuk load chat history
function loadChatHistory() {
  try {
    if (fs.existsSync(CHAT_HISTORY_FILE)) {
      const data = fs.readFileSync(CHAT_HISTORY_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading chat history:', error);
  }
  return {};
}

// Fungsi untuk save chat history
function saveChatHistory(history) {
  try {
    fs.writeFileSync(CHAT_HISTORY_FILE, JSON.stringify(history, null, 2));
  } catch (error) {
    console.error('Error saving chat history:', error);
  }
}

// AI Response Engine, menggunakan Gemini API jika tersedia
async function generateAIResponse(userMessage, conversationId) {
  // kalau ada kunci, panggil ke Google Gemini
  if (process.env.GEMINI_API_KEY) {
    try {
      const model = process.env.MODEL || 'gemini-2.5-flash';
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
      
      const resp = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: userMessage,
            }],
          }],
        }),
      });
      
      const data = await resp.json();
      
      // extract text dari response
      if (data?.candidates?.[0]?.content?.parts?.[0]?.text) {
        return data.candidates[0].content.parts[0].text;
      }
      
    
      if (data?.error) {
        console.error('Gemini API error:', data.error.message);
      } else {
        console.error('Gemini response had unexpected shape:', JSON.stringify(data));
      }
    } catch (e) {
      console.error('Gemini API error:', e.message);
    }
  }

  const message = userMessage.toLowerCase().trim();
  return 'Maaf, saya tidak bisa terhubung ke Gemini API. Pastikan GEMINI_API_KEY dan MODEL sudah benar di .env';
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`🚀 Server ready on http://localhost:${PORT}`));

// Endpoint untuk chat
app.post('/api/chat', async (req, res) => {
  const { conversation } = req.body;

  console.log('Request diterima:', { conversation });

  try {
    if (!conversation) {
      return res.status(400).json({ error: 'conversation field diperlukan' });
    }

    if (!Array.isArray(conversation)) {
      return res.status(400).json({ error: 'Conversation harus berupa array!' });
    }

    const userMessage = conversation[0]?.text || '';
    const conversationId = 'default'; // Bisa diubah untuk multiple conversations

    console.log('User message:', userMessage);

    // Generate AI response
    const aiResponse = await generateAIResponse(userMessage, conversationId);

    // Save to chat history
    const history = loadChatHistory();
    if (!history[conversationId]) {
      history[conversationId] = [];
    }

    history[conversationId].push({
      role: 'user',
      text: userMessage,
      timestamp: new Date().toISOString()
    });

    history[conversationId].push({
      role: 'assistant',
      text: aiResponse,
      timestamp: new Date().toISOString()
    });

    saveChatHistory(history);

    console.log('Respons AI:', aiResponse);

    res.status(200).json({ result: aiResponse });
  } catch (error) {
    console.error('❌ Chat error detail:', error.message);

    res.status(500).json({
      error: error.message || 'Terjadi kesalahan pada server'
    });
  }
});

// Endpoint untuk load chat history
app.get('/api/chat/history', (req, res) => {
  try {
    const history = loadChatHistory();
    res.status(200).json(history);
  } catch (error) {
    console.error('Error loading history:', error);
    res.status(500).json({ error: 'Gagal memuat history chat' });
  }
});

// Endpoint untuk clear chat history
app.delete('/api/chat/history', (req, res) => {
  try {
    if (fs.existsSync(CHAT_HISTORY_FILE)) {
      fs.unlinkSync(CHAT_HISTORY_FILE);
    }
    res.status(200).json({ message: 'Chat history berhasil dihapus' });
  } catch (error) {
    console.error('Error clearing history:', error);
    res.status(500).json({ error: 'Gagal menghapus history chat' });
  }
});