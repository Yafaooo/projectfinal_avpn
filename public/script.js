// Ambil elemen DOM
const chatForm = document.getElementById('chat-form');


const userInput = document.getElementById('user-input');
const chatBox = document.getElementById('chat-box');

// Local Storage keys
const CHAT_HISTORY_KEY = 'chatbot_history';

// Fungsi untuk save chat history ke local storage
function saveChatHistory(messages) {
  try {
    localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(messages));
  } catch (error) {
    console.error('Error saving chat history:', error);
  }
}

// Fungsi untuk load chat history dari local storage
function loadChatHistory() {
  try {
    const history = localStorage.getItem(CHAT_HISTORY_KEY);
    return history ? JSON.parse(history) : [];
  } catch (error) {
    console.error('Error loading chat history:', error);
    return [];
  }
}

// Fungsi untuk clear chat history
function clearChatHistory() {
  localStorage.removeItem(CHAT_HISTORY_KEY);
  chatBox.innerHTML = '';
}

// Fungsi untuk append message ke chat box dengan delete button
function appendMessage(role, text, timestamp = null) {
  const messageEl = document.createElement('div');
  messageEl.className = `message ${role}-message`;
  
  // Create message content with delete button
  const contentEl = document.createElement('div');
  contentEl.style.cssText = 'display: flex; justify-content: space-between; align-items: flex-start; gap: 10px;';
  
  const textEl = document.createElement('span');
  textEl.textContent = text;
  textEl.style.cssText = 'flex: 1;';
  
  const deleteBtn = document.createElement('button');
  deleteBtn.textContent = '✕';
  deleteBtn.style.cssText = `
    background: #ff6b6b;
    color: white;
    border: none;
    border-radius: 4px;
    padding: 2px 6px;
    cursor: pointer;
    font-size: 12px;
    flex-shrink: 0;
  `;
  
  deleteBtn.addEventListener('click', () => {
    const history = loadChatHistory();
    const foundIndex = history.findIndex(msg => msg.text === text && msg.role === role);
    if (foundIndex !== -1) {
      history.splice(foundIndex, 1);
      saveChatHistory(history);
      messageEl.remove();
    }
  });
  
  contentEl.appendChild(textEl);
  contentEl.appendChild(deleteBtn);
  messageEl.appendChild(contentEl);
  
  // Add timestamp if available
  if (timestamp) {
    const timeEl = document.createElement('small');
    timeEl.style.cssText = 'color: #999; display: block; margin-top: 4px; font-size: 11px;';
    timeEl.textContent = new Date(timestamp).toLocaleTimeString('id-ID');
    messageEl.appendChild(timeEl);
  }
  
  chatBox.appendChild(messageEl);
  chatBox.scrollTop = chatBox.scrollHeight;
  return messageEl;
}

// Load chat history saat halaman dimuat
document.addEventListener('DOMContentLoaded', () => {
  const history = loadChatHistory();
  history.forEach(msg => {
    appendMessage(msg.role, msg.text, msg.timestamp);
  });
});

// Tangani pengiriman form
chatForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const userMessage = userInput.value.trim();

  // Validasi input
  if (!userMessage) return;

  // Append user message
  const userMsgEl = appendMessage('user', userMessage, new Date().toISOString());

  // Clear input dan fokus
  userInput.value = '';
  userInput.focus();

  // Show thinking indicator
  const thinkingEl = appendMessage('bot', 'Sedang berpikir...');

  try {
    // Kirim ke backend
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        conversation: [
          { role: 'user', text: userMessage }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`Kesalahan server: ${response.status}`);
    }

    const data = await response.json();

    if (!data.result) {
      throw new Error('Respons tidak valid dari server');
    }

    // Update thinking message dengan respons AI
    thinkingEl.textContent = data.result;
    thinkingEl.classList.remove('thinking');

    // Save ke local storage
    const history = loadChatHistory();
    const now = new Date().toISOString();
    history.push({ role: 'user', text: userMessage, timestamp: now });
    history.push({ role: 'bot', text: data.result, timestamp: now });
    saveChatHistory(history);

  } catch (error) {
    console.error('Kesalahan chat:', error);

    thinkingEl.textContent = 'Gagal mendapatkan respons dari server.';
    thinkingEl.classList.remove('thinking');
  }
});

// Control panel dengan 3 buttons: History, Delete All, Clear
const controlPanel = document.createElement('div');
controlPanel.style.cssText = `
  position: fixed;
  top: 10px;
  right: 10px;
  display: flex;
  gap: 8px;
  z-index: 1000;
`;

// History Button
const historyButton = document.createElement('button');
historyButton.textContent = '📋 History';
historyButton.style.cssText = `
  padding: 8px 12px;
  background: #4a90e2;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
`;
historyButton.addEventListener('click', () => {
  const history = loadChatHistory();
  if (history.length === 0) {
    alert('Tidak ada history chat');
    return;
  }
  const historyText = history.map((msg, i) => `${i + 1}. [${msg.role.toUpperCase()}] ${msg.text}`).join('\n\n');
  alert('Chat History:\n\n' + historyText);
});

// Delete All Button
const deleteAllButton = document.createElement('button');
deleteAllButton.textContent = '🗑️ Delete All';
deleteAllButton.style.cssText = `
  padding: 8px 12px;
  background: #ff6b6b;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
`;
deleteAllButton.addEventListener('click', () => {
  if (confirm('Apakah Anda yakin ingin menghapus semua chat?')) {
    clearChatHistory();
  }
});

// Clear (sama dengan Delete All, untuk alternatif)
const clearButton = document.createElement('button');
clearButton.textContent = '✖️ Clear';
clearButton.style.cssText = `
  padding: 8px 12px;
  background: #f39c12;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
`;
clearButton.addEventListener('click', () => {
  if (confirm('Apakah Anda yakin ingin mengosongkan chat?')) {
    clearChatHistory();
  }
});

controlPanel.appendChild(historyButton);
controlPanel.appendChild(deleteAllButton);
controlPanel.appendChild(clearButton);
document.body.appendChild(controlPanel);
