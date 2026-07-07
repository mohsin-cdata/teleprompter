import { getStoredConfig, saveConfig, clearConfig, initDB, initRoom } from './db.js';

const BASE_URL = location.origin + location.pathname.replace('index.html', '');

// ── Toast helper ────────────────────────────────────────────────
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2500);
}

// ── Room code helpers ────────────────────────────────────────────
function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

let currentCode = genCode();

function setCode(code) {
  currentCode = code.toUpperCase();
  document.getElementById('room-code').textContent = currentCode;
  document.getElementById('remote-link').value =
    `${BASE_URL}remote.html?room=${currentCode}`;
}

// ── Init ─────────────────────────────────────────────────────────
function showMain() {
  document.getElementById('firebase-setup').classList.add('hidden');
  document.getElementById('main-screen').classList.remove('hidden');
  setCode(currentCode);
}

function showSetup() {
  document.getElementById('firebase-setup').classList.remove('hidden');
  document.getElementById('main-screen').classList.add('hidden');
}

if (getStoredConfig()) {
  initDB();
  showMain();
} else {
  showSetup();
}

// ── Firebase setup form ──────────────────────────────────────────
document.getElementById('firebase-form').addEventListener('submit', e => {
  e.preventDefault();
  const cfg = {
    apiKey:      document.getElementById('fb-apiKey').value.trim(),
    authDomain:  document.getElementById('fb-authDomain').value.trim(),
    databaseURL: document.getElementById('fb-databaseURL').value.trim(),
    projectId:   document.getElementById('fb-projectId').value.trim(),
    appId:       document.getElementById('fb-appId').value.trim(),
  };
  if (!cfg.databaseURL.startsWith('https://')) {
    toast('Database URL must start with https://');
    return;
  }
  saveConfig(cfg);
  initDB();
  showMain();
  toast('Firebase connected!');
});

document.getElementById('reconfigure-btn').addEventListener('click', () => {
  if (confirm('Clear Firebase config and reconfigure?')) {
    clearConfig();
    showSetup();
  }
});

// ── Tabs ─────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.add('hidden'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.remove('hidden');
  });
});

// ── New Session ──────────────────────────────────────────────────
document.getElementById('new-code-btn').addEventListener('click', () => {
  setCode(genCode());
});

document.getElementById('open-prompter-btn').addEventListener('click', async () => {
  const script = document.getElementById('script-input').value.trim();
  if (!script) { toast('Paste your script first'); return; }
  await initRoom(currentCode, script);
  window.open(`prompter.html?room=${currentCode}`, '_blank');
});

document.getElementById('open-remote-btn').addEventListener('click', async () => {
  const script = document.getElementById('script-input').value.trim();
  if (!script) { toast('Paste your script first'); return; }
  await initRoom(currentCode, script);
  window.open(`remote.html?room=${currentCode}`, '_blank');
});

document.getElementById('copy-link-btn').addEventListener('click', () => {
  const link = document.getElementById('remote-link');
  navigator.clipboard.writeText(link.value).then(() => toast('Link copied!'));
});

// ── Join Session ─────────────────────────────────────────────────
const joinInput = document.getElementById('join-code-input');
joinInput.addEventListener('input', () => {
  joinInput.value = joinInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
});

document.getElementById('join-prompter-btn').addEventListener('click', () => {
  const code = joinInput.value.trim();
  if (code.length !== 4) { toast('Enter a 4-letter code'); return; }
  window.open(`prompter.html?room=${code}`, '_blank');
});

document.getElementById('join-remote-btn').addEventListener('click', () => {
  const code = joinInput.value.trim();
  if (code.length !== 4) { toast('Enter a 4-letter code'); return; }
  window.open(`remote.html?room=${code}`, '_blank');
});
