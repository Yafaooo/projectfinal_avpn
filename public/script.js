/* 
  ╔═══════════════════════════════════════════════════════════════╗
  ║  YAFAO AI STUDIO PRO — HOLOGRAPHIC LOGIC CONTROLLER v3.0    ║
  ╚═══════════════════════════════════════════════════════════════╝
*/

const BASE = window.location.origin;
let chatHistory = [];
let currentMode = 'chat';
let currentFile = null;
let hasStartedChat = false;

document.addEventListener('DOMContentLoaded', () => {
    // ─── SPLASH SCREEN ───
    generateSplashParticles();
    setTimeout(() => {
        const splash = document.getElementById('splash-screen');
        if (splash) {
            splash.classList.add('hide');
            setTimeout(() => splash.remove(), 1200);
        }
    }, 3200);

    initUI();
    initChatLogic();
    checkApiStatus();
});

// ═══════════════════════════════════════════════════════════════
//  SPLASH PARTICLES
// ═══════════════════════════════════════════════════════════════
function generateSplashParticles() {
    const container = document.getElementById('splash-particles');
    if (!container) return;
    for (let i = 0; i < 50; i++) {
        const p = document.createElement('div');
        const x = Math.random() * 100;
        const y = Math.random() * 100;
        const size = Math.random() * 2 + 0.5;
        const dur = (Math.random() * 5 + 3).toFixed(1);
        const delay = (Math.random() * 3).toFixed(1);
        p.style.cssText = `
            position:absolute; left:${x}%; top:${y}%;
            width:${size}px; height:${size}px;
            background: ${Math.random() > 0.5 ? '#00f0ff' : '#a855f7'};
            border-radius:50%; opacity:0;
            animation: particleFade ${dur}s ${delay}s infinite;
        `;
        container.appendChild(p);
    }
    // Inject particle keyframe
    const style = document.createElement('style');
    style.textContent = `@keyframes particleFade { 0%,100%{opacity:0;transform:scale(0.5)} 50%{opacity:0.6;transform:scale(1.2)} }`;
    document.head.appendChild(style);
}

// ═══════════════════════════════════════════════════════════════
//  UTILS
// ═══════════════════════════════════════════════════════════════
const toast = (msg, type = 'info') => {
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerHTML = `<i class="fas ${type === 'error' ? 'fa-triangle-exclamation' : 'fa-check-circle'}"></i> <span>${msg}</span>`;
    document.getElementById('toast-container').appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateX(20px)'; setTimeout(() => t.remove(), 300); }, 4000);
};

async function checkApiStatus() {
    const statusEl = document.getElementById('api-status');
    const label = statusEl.querySelector('.status-label');
    const dot = statusEl.querySelector('.status-dot');
    try {
        const r = await fetch(`${BASE}/api/model-status`);
        const data = await r.json();
        if (r.ok) {
            label.textContent = 'SYSTEM: SECURE / AI: ONLINE';
            dot.style.background = '#34d399';
            dot.style.boxShadow = '0 0 8px #34d399';
        }
    } catch {
        label.textContent = 'SYSTEM: OFFLINE';
        dot.style.background = '#ef4444';
        dot.style.boxShadow = '0 0 8px #ef4444';
    }
}

// ═══════════════════════════════════════════════════════════════
//  UI INTERACTIONS
// ═══════════════════════════════════════════════════════════════
function initUI() {
    const btnPlus = document.getElementById('btn-open-menu');
    const menu = document.getElementById('action-menu');
    const input = document.getElementById('chat-input');

    // Toggle Menu
    btnPlus.addEventListener('click', (e) => {
        e.stopPropagation();
        menu.classList.toggle('show');
        btnPlus.classList.toggle('active');
    });

    document.addEventListener('click', (e) => {
        if (!menu.contains(e.target) && !btnPlus.contains(e.target)) {
            menu.classList.remove('show');
            btnPlus.classList.remove('active');
        }
    });

    input.addEventListener('input', checkSendState);

    // Auto-resize
    input.addEventListener('input', function () {
        this.style.height = 'auto';
        this.style.height = this.scrollHeight + 'px';
        if (this.value === '') this.style.height = 'auto';
    });

    // Mode Selector
    document.querySelectorAll('.menu-item[data-mode]').forEach(item => {
        item.addEventListener('click', () => {
            setMode(item.getAttribute('data-mode'), item.querySelector('.menu-label')?.childNodes[0]?.textContent?.trim() || 'Mode');
            menu.classList.remove('show');
            btnPlus.classList.remove('active');
        });
    });

    // Reset Mode
    document.getElementById('btn-reset-mode').addEventListener('click', () => {
        setMode('chat', 'Chat AI');
    });
}

function checkSendState() {
    const input = document.getElementById('chat-input');
    const sendBtn = document.getElementById('btn-send-chat');
    if (input.value.trim() !== '' || currentFile) {
        sendBtn.classList.add('active');
    } else {
        sendBtn.classList.remove('active');
    }
}

function setMode(mode, label) {
    currentMode = mode;
    const indicator = document.getElementById('mode-indicator');
    const text = document.getElementById('mode-text');
    const input = document.getElementById('chat-input');

    if (mode === 'chat') {
        indicator.style.display = 'none';
        input.placeholder = 'Ketik perintah atau jatuhkan file di sini...';
    } else {
        indicator.style.display = 'flex';
        text.innerText = label.toUpperCase();
        input.placeholder = `Deskripsikan apa yang ingin Anda ${label.toLowerCase()}...`;
    }
    input.focus();
}

// ═══════════════════════════════════════════════════════════════
//  CHAT & GENERATION LOGIC
// ═══════════════════════════════════════════════════════════════
function initChatLogic() {
    const uploadInput = document.getElementById('chat-upload');
    const previewContainer = document.getElementById('chat-img-preview');
    const previewImg = document.getElementById('chat-img-thumb');
    const removeImgBtn = document.getElementById('btn-remove-chat-img');
    const input = document.getElementById('chat-input');
    const sendBtn = document.getElementById('btn-send-chat');

    uploadInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
            currentFile = e.target.files[0];
            previewImg.src = URL.createObjectURL(currentFile);
            previewContainer.style.display = 'flex';
            checkSendState();
            document.getElementById('action-menu').classList.remove('show');
        }
    });

    removeImgBtn.addEventListener('click', () => {
        currentFile = null;
        uploadInput.value = '';
        previewContainer.style.display = 'none';
        checkSendState();
    });

    const handleSend = async () => {
        const text = input.value.trim();
        if (!text && !currentFile) return;

        if (!hasStartedChat) {
            hasStartedChat = true;
            // Animate hero out first, then switch state
            const hero = document.getElementById('hero-section');
            if (hero) {
                hero.classList.add('fade-out');
                setTimeout(() => {
                    document.body.classList.add('state-chat');
                }, 420);
            } else {
                document.body.classList.add('state-chat');
            }
        }

        let imgUrl = currentFile ? URL.createObjectURL(currentFile) : null;
        addChatMessage('user', text, imgUrl);

        input.value = '';
        input.style.height = 'auto';
        const fileToSend = currentFile;
        const modeToSend = currentMode;
        const textToSend = text;

        currentFile = null;
        uploadInput.value = '';
        previewContainer.style.display = 'none';
        checkSendState();

        const loadingId = addChatLoading();

        try {
            if (modeToSend === 'chat') {
                await processChat(textToSend, fileToSend, loadingId);
            } else if (modeToSend === 'image' || modeToSend === 'edit') {
                await processImageGen(textToSend, fileToSend, loadingId);
            } else if (modeToSend === 'video') {
                await processVideoGen(textToSend, fileToSend, loadingId);
            }
        } catch (e) {
            removeChatLoading(loadingId);
            addChatMessage('bot', `**Error:** ${e.message}`);
        }
    };

    sendBtn.addEventListener('click', handleSend);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    });

    document.getElementById('btn-clear-chat').addEventListener('click', async () => {
        if (!confirm('Hapus semua riwayat obrolan?')) return;
        await fetch(`${BASE}/api/chat/history`, { method: 'DELETE' });
        document.getElementById('chat-messages').innerHTML = '';
        chatHistory = [];
        hasStartedChat = false;
        document.body.classList.remove('state-chat');
        // Restore hero section with fade-in
        const hero = document.getElementById('hero-section');
        if (hero) {
            hero.classList.remove('fade-out');
        }
        document.getElementById('action-menu').classList.remove('show');
        toast('Riwayat obrolan dibersihkan');
    });
}

// ═══════════════════════════════════════════════════════════════
//  API PROCESSORS
// ═══════════════════════════════════════════════════════════════
async function processChat(text, file, loadingId) {
    const formData = new FormData();
    formData.append('conversation', JSON.stringify([...chatHistory, { role: 'user', text }]));
    if (file) formData.append('image', file);

    const resp = await fetch(`${BASE}/api/chat`, { method: 'POST', body: formData });
    const data = await resp.json();
    if (data.error) throw new Error(data.error);

    if (data.conversation) {
        chatHistory = data.conversation;
    } else {
        chatHistory.push({ role: 'user', text });
    }

    removeChatLoading(loadingId);
    addChatMessage('bot', data.result);
    chatHistory.push({ role: 'bot', text: data.result });
}

async function processImageGen(text, file, loadingId) {
    let endpoint = '/api/generate-image';
    const bodyPayload = { prompt: text, style: 'photorealistic' };
    let reqConfig = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(bodyPayload) };

    if (file) {
        endpoint = '/api/image-to-image';
        const fd = new FormData();
        fd.append('prompt', text);
        fd.append('image', file);
        reqConfig = { method: 'POST', body: fd };
    }

    const resp = await fetch(BASE + endpoint, reqConfig);
    const data = await resp.json();
    if (data.error) throw new Error(data.error);

    removeChatLoading(loadingId);
    addChatMessage('bot', 'Berikut adalah hasil gambarnya:', data.imageUrl, false);
}

async function processVideoGen(text, file, loadingId) {
    let endpoint = '/api/generate-video';
    let reqConfig = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: text, duration: 5 }) };

    if (file) {
        endpoint = '/api/image-to-video';
        const fd = new FormData();
        fd.append('prompt', text);
        fd.append('image', file);
        reqConfig = { method: 'POST', body: fd };
    }

    const resp = await fetch(BASE + endpoint, reqConfig);
    const data = await resp.json();
    if (data.error) throw new Error(data.error);

    // If already done (Vercel serverless returns immediately)
    if (data.status === 'done' && data.videoUrl) {
        removeChatLoading(loadingId);
        addChatMessage('bot', 'Video berhasil dirender:', data.videoUrl, true);
        return;
    }

    // Otherwise poll for status (local dev)
    const jobId = data.jobId;
    const pollInterval = setInterval(async () => {
        try {
            const r = await fetch(`${BASE}/api/video-status/${jobId}`);
            const job = await r.json();

            const loadEl = document.getElementById(`load-text-${loadingId}`);
            if (loadEl) loadEl.innerText = `Rendering Video... ${job.progress}%`;

            if (job.status === 'done') {
                clearInterval(pollInterval);
                removeChatLoading(loadingId);
                addChatMessage('bot', 'Video berhasil dirender:', job.videoUrl, true);
            }
        } catch (e) {
            clearInterval(pollInterval);
            removeChatLoading(loadingId);
            addChatMessage('bot', `Gagal merender video: ${e.message}`);
        }
    }, 2000);
}

// ═══════════════════════════════════════════════════════════════
//  RENDERING
// ═══════════════════════════════════════════════════════════════
function addChatMessage(role, text, mediaUrl = null, isVideo = false) {
    const box = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = `msg msg-${role}`;

    let html = '';

    if (mediaUrl && role === 'user') {
        html += `<img src="${mediaUrl}" style="max-width:240px; border-radius:8px; margin-bottom:8px; display:block; border:1px solid rgba(0,240,255,0.1);">`;
    }

    if (text) {
        let parsed = text.replace(/\n/g, '<br>');
        parsed = parsed.replace(/`([^`]+)`/g, '<code>$1</code>');
        parsed = parsed.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
        html += `<p>${parsed}</p>`;
    }

    if (mediaUrl && role === 'bot') {
        if (isVideo || mediaUrl.includes('.svg') || mediaUrl.startsWith('/generated/vid_')) {
            html += `<video src="${mediaUrl}" class="msg-media" autoplay loop muted onclick="fullScreen('${mediaUrl}', true)"></video>`;
        } else {
            html += `<img src="${mediaUrl}" class="msg-media" onclick="fullScreen('${mediaUrl}', false)" style="cursor:pointer;">`;
        }
        html += `<div style="display:flex;gap:8px;margin-top:6px;">
                   <button onclick="downloadFile('${mediaUrl}')" style="background:rgba(0,240,255,0.06);border:1px solid rgba(0,240,255,0.1);color:#00f0ff;padding:5px 12px;border-radius:8px;cursor:pointer;font-size:11px;font-family:var(--font-mono);letter-spacing:1px;transition:0.2s;"><i class="fas fa-download"></i> DOWNLOAD</button>
                 </div>`;
    }

    div.innerHTML = html;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
}

function addChatLoading() {
    const id = Date.now();
    const box = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = 'msg msg-bot';
    div.id = `loading-${id}`;
    div.innerHTML = `<div class="loading-dots"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>
                     <span id="load-text-${id}" style="font-size:11px;color:var(--text-dim);margin-left:10px;font-family:var(--font-mono);letter-spacing:1px;">PROCESSING...</span>`;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
    return id;
}

function removeChatLoading(id) {
    const el = document.getElementById(`loading-${id}`);
    if (el) el.remove();
}

// ═══════════════════════════════════════════════════════════════
//  GLOBAL
// ═══════════════════════════════════════════════════════════════
window.downloadFile = (url) => {
    const a = document.createElement('a'); a.href = url;
    a.download = url.split('/').pop(); a.click();
};

window.fullScreen = (url, isVideo) => {
    const lb = document.getElementById('lightbox');
    const content = document.getElementById('lightbox-content');
    lb.style.display = 'grid';
    if (isVideo || url.endsWith('.svg')) {
        content.innerHTML = `<video src="${url}" autoplay loop muted style="width:100%;border-radius:12px;"></video>`;
    } else {
        content.innerHTML = `<img src="${url}" style="width:100%;border-radius:12px;display:block;">`;
    }
};