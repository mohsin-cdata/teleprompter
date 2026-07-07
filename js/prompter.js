import { initDB, getStoredConfig, getRoomCode, getScript, watchState, pushState, DEFAULT_STATE }
  from './db.js';

// ── Guard: need room code and config ────────────────────────────
const ROOM = getRoomCode();
if (!ROOM || !getStoredConfig()) {
  location.href = 'index.html';
  throw new Error('no room');
}
initDB();

// ── DOM refs ─────────────────────────────────────────────────────
const scriptEl   = document.getElementById('script-content');
const barEl      = document.getElementById('prompter-bar');
const statusDot  = document.getElementById('status-dot');
const statusLbl  = document.getElementById('status-label');
const barRoom    = document.getElementById('bar-room');
const overlayEl  = document.getElementById('prompter-overlay');
const overlayRoom = document.getElementById('overlay-room');
const hlBar      = document.getElementById('highlight-bar');
const progress   = document.getElementById('scroll-progress');
const fsBtn      = document.getElementById('fullscreen-btn');
const homeBtn    = document.getElementById('home-btn');

barRoom.textContent = ROOM;
overlayRoom.textContent = ROOM;

// ── Scroll engine ─────────────────────────────────────────────────
let raf = null;
let lastTs = null;
let isPlaying = false;
let currentSpeed = DEFAULT_STATE.speed;
let currentMode  = DEFAULT_STATE.mode;
let currentSlide = 0;
let sections = [];
let totalSections = 0;
let remotePositionPending = null;
let lastPositionReport = 0;

// D-pad manual velocity scroll
let manualVel = 0;
let manualRaf = null;
let manualLastTs = null;

function pxPerMs(speed) {
  // speed 1-100 → 4-220 px/sec
  return (4 + (speed / 100) * 216) / 1000;
}

function scrollStep(ts) {
  if (lastTs === null) lastTs = ts;
  const dt = Math.min(ts - lastTs, 100); // cap delta to avoid jumps after tab switch
  lastTs = ts;

  if (remotePositionPending !== null) {
    seekToPercent(remotePositionPending);
    remotePositionPending = null;
  }

  window.scrollBy(0, pxPerMs(currentSpeed) * dt);
  updateProgress();

  // Report position back every 2s so remote slider stays in sync
  if (ts - lastPositionReport > 2000) {
    lastPositionReport = ts;
    reportPosition();
  }

  const atBottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4;
  if (isPlaying && !atBottom) {
    raf = requestAnimationFrame(scrollStep);
  } else if (atBottom) {
    isPlaying = false;
    pushState(ROOM, { playing: false, updatedBy: 'prompter' });
  }
}

function startScroll() {
  if (raf) cancelAnimationFrame(raf);
  lastTs = null;
  raf = requestAnimationFrame(scrollStep);
}

function stopScroll() {
  if (raf) { cancelAnimationFrame(raf); raf = null; }
  lastTs = null;
}

function seekToPercent(pct) {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  window.scrollTo(0, max * pct / 100);
}

// ── Manual velocity scroll (D-pad hold) ──────────────────────────
function manualStep(ts) {
  if (manualLastTs === null) manualLastTs = ts;
  const dt = Math.min(ts - manualLastTs, 100);
  manualLastTs = ts;

  window.scrollBy(0, pxPerMs(currentSpeed) * dt * manualVel);
  updateProgress();

  if (manualVel !== 0) {
    manualRaf = requestAnimationFrame(manualStep);
  } else {
    manualRaf = null;
    manualLastTs = null;
    reportPosition();
  }
}

function applyManualVelocity(vel) {
  manualVel = vel;
  if (vel !== 0 && !manualRaf) {
    manualLastTs = null;
    manualRaf = requestAnimationFrame(manualStep);
  }
}

function updateProgress() {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  const pct = max > 0 ? Math.round((window.scrollY / max) * 100) : 0;
  progress.style.width = pct + '%';
}

function reportPosition() {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  const pct = max > 0 ? Math.round((window.scrollY / max) * 100) : 0;
  pushState(ROOM, { position: pct, updatedBy: 'prompter' });
}

// ── Script rendering ─────────────────────────────────────────────
function renderScript(script) {
  sections = script.split(/\n---\n/).map(s => s.trim()).filter(Boolean);
  totalSections = sections.length;

  if (totalSections <= 1) {
    scriptEl.innerHTML = escapeHtml(script);
    return;
  }

  scriptEl.innerHTML = sections.map((sec, i) =>
    `<div class="section-block" data-section="${i}">${escapeHtml(sec)}</div>
     ${i < sections.length - 1 ? '<hr class="section-divider">' : ''}`
  ).join('');
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}

function goToSlide(idx) {
  const blocks = document.querySelectorAll('.section-block');
  if (!blocks.length) return;
  blocks.forEach((b, i) => b.classList.toggle('active', i === idx));
  const target = blocks[idx];
  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

// ── Apply state from Firebase ────────────────────────────────────
function applyState(state) {
  if (!state) return;

  const wasPlaying = isPlaying;
  isPlaying = state.playing;
  currentSpeed = state.speed || 35;
  currentMode  = state.mode  || 'auto';
  currentSlide = state.slide || 0;

  // D-pad velocity (manual mode)
  if (state.manualVelocity !== undefined && currentMode === 'manual') {
    applyManualVelocity(state.manualVelocity);
  }

  // Seek only when remote explicitly changes position
  if (state.updatedBy === 'remote' && state.position !== undefined) {
    if (currentMode === 'manual') {
      remotePositionPending = state.position;
    }
  }

  // Slide mode
  document.body.className = `is-prompter${currentMode === 'slide' ? ' mode-slide' : ''}`;
  if (currentMode === 'slide') {
    goToSlide(currentSlide);
  }

  // Playback
  if (isPlaying && currentMode === 'auto') {
    if (!wasPlaying) startScroll();
  } else {
    stopScroll();
    if (state.updatedBy === 'remote' && currentMode === 'manual' && state.position !== undefined) {
      remotePositionPending = state.position;
      // Force one frame to apply seek
      requestAnimationFrame(() => {
        if (remotePositionPending !== null) {
          seekToPercent(remotePositionPending);
          remotePositionPending = null;
          updateProgress();
        }
      });
    }
  }

  applyStyle(state.style || DEFAULT_STATE.style);
  updateProgress();
}

function applyStyle(s) {
  const fontMap = {
    sans:  "'Arial', 'Helvetica Neue', sans-serif",
    serif: "'Georgia', 'Times New Roman', serif",
    mono:  "'Courier New', monospace",
    bold:  "'Arial Black', 'Impact', sans-serif",
  };
  scriptEl.style.fontSize    = (s.fontSize || 36) + 'px';
  scriptEl.style.fontFamily  = fontMap[s.fontFamily] || fontMap.sans;
  scriptEl.style.color       = s.textColor || '#ffffff';
  scriptEl.style.background  = s.bgColor   || '#000000';
  scriptEl.style.lineHeight  = s.lineHeight || 1.8;
  document.body.style.background = s.bgColor || '#000000';

  hlBar.classList.toggle('off', !s.highlight);
  scriptEl.classList.toggle('mirrored', !!s.mirror);

  // Adjust highlight bar height to match line height
  const hlInner = hlBar.querySelector('.highlight-bar-inner');
  if (hlInner) hlInner.style.height = (s.lineHeight || 1.8) + 'em';
}

// ── Connection status + overlay ───────────────────────────────────
let connected = false;

function setConnected(ok) {
  connected = ok;
  statusDot.className = 'status-dot ' + (ok ? 'connected' : 'disconnected');
  statusLbl.textContent = ok ? 'Live' : 'Reconnecting…';
  overlayEl.style.display = ok ? 'none' : 'flex';
}

// ── Top bar auto-hide ────────────────────────────────────────────
let barTimer = null;

function showBar() {
  barEl.classList.remove('faded');
  clearTimeout(barTimer);
  barTimer = setTimeout(() => barEl.classList.add('faded'), 4000);
}

document.addEventListener('touchstart', showBar);
document.addEventListener('mousemove', showBar);
showBar();

// ── Fullscreen ────────────────────────────────────────────────────
fsBtn.addEventListener('click', () => {
  const el = document.documentElement;
  if (!document.fullscreenElement) {
    (el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen).call(el);
  } else {
    (document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen).call(document);
  }
});

homeBtn.addEventListener('click', () => { location.href = 'index.html'; });

// ── Wake Lock ─────────────────────────────────────────────────────
let wakeLock = null;
let noSleepVideo = null;

async function requestWakeLock() {
  // Try native Wake Lock API first (iOS 16.4+, Android Chrome 84+)
  if ('wakeLock' in navigator) {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      return;
    } catch {}
  }
  // Fallback: silent looping video trick (NoSleep technique)
  noSleepVideo = document.createElement('video');
  noSleepVideo.setAttribute('playsinline', '');
  noSleepVideo.setAttribute('muted', '');
  noSleepVideo.setAttribute('loop', '');
  noSleepVideo.style.cssText = 'position:fixed;top:-1px;left:-1px;width:1px;height:1px;opacity:0;pointer-events:none;';
  // Minimal valid MP4 — 1x1 black pixel, 1 frame at 1fps
  noSleepVideo.src = 'data:video/mp4;base64,AAAAIGZ0eXBtcDQyAAAAAG1wNDJtcDQxaXNvbWF2YzEAAATkbW9vdgAAAGxtdmhkAAAAANLEVADSxFQAAA+gAAAAAAABAAAAAAAAAAAAAAAAAAAAQQAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAA0AAAAAAAAAAAAAAAAAAAAAAAACQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAAAbWluZgAAAABzbWhkAAAAAAAAAAAAAAAAAA==';
  document.body.appendChild(noSleepVideo);
  noSleepVideo.play().catch(() => {});
}

document.addEventListener('visibilitychange', async () => {
  if (wakeLock !== null && document.visibilityState === 'visible') {
    try { wakeLock = await navigator.wakeLock.request('screen'); } catch {}
  }
});

// ── Boot ──────────────────────────────────────────────────────────
async function boot() {
  const script = await getScript(ROOM);
  if (!script) {
    overlayEl.querySelector('p').textContent = 'Room not found. Go back to Setup.';
    return;
  }
  renderScript(script);
  requestWakeLock();
  setConnected(true);

  watchState(ROOM, state => {
    if (!connected) setConnected(true);
    applyState(state);
  });
}

boot();

// Update progress on manual scroll
window.addEventListener('scroll', updateProgress, { passive: true });
