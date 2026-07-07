import { initDB, getStoredConfig, getRoomCode, watchState, pushState, DEFAULT_STATE }
  from './db.js';

// ── Guard ─────────────────────────────────────────────────────────
const ROOM = getRoomCode();
if (!ROOM || !getStoredConfig()) {
  location.href = 'index.html';
  throw new Error('no room');
}
initDB();

// ── Theme ─────────────────────────────────────────────────────────
const THEME_KEY = 'promptr_theme';

function applyTheme(theme) {
  document.body.classList.toggle('light', theme === 'light');
  const btn = document.getElementById('theme-toggle');
  btn.textContent = theme === 'light' ? '☽' : '☀'; // moon : sun
  btn.title = theme === 'light' ? 'Switch to dark' : 'Switch to light';
}

const savedTheme = localStorage.getItem(THEME_KEY) || 'dark';
applyTheme(savedTheme);

document.getElementById('theme-toggle').addEventListener('click', () => {
  const next = document.body.classList.contains('light') ? 'dark' : 'light';
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
});

// ── State cache ───────────────────────────────────────────────────
let state = JSON.parse(JSON.stringify(DEFAULT_STATE));
let totalSections = 1;
let isSyncing = false;

// ── DOM ───────────────────────────────────────────────────────────
const statusDot   = document.getElementById('status-dot');
const statusText  = document.getElementById('status-text');
const headerRoom  = document.getElementById('header-room');
const playBtn     = document.getElementById('play-btn');
const playIcon    = document.getElementById('play-icon');
const playLabel   = document.getElementById('play-label');

const speedSlider  = document.getElementById('speed-slider');
const speedVal     = document.getElementById('speed-val');
const speedLbl     = document.getElementById('speed-label');
const sizeSlider   = document.getElementById('size-slider');
const sizeVal      = document.getElementById('size-val');
const lhSlider     = document.getElementById('lh-slider');
const lhVal        = document.getElementById('lh-val');
const posSlider    = document.getElementById('position-slider');
const posVal       = document.getElementById('position-val');
const slideNum     = document.getElementById('slide-num');
const slideTotal   = document.getElementById('slide-total');
const modeHint     = document.getElementById('mode-hint');

const cardSpeed    = document.getElementById('card-speed');
const cardDpad     = document.getElementById('card-dpad');
const cardPos      = document.getElementById('card-position');
const cardSlides   = document.getElementById('card-slides');

headerRoom.textContent = ROOM;

// ── Toast ─────────────────────────────────────────────────────────
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2000);
}

// ── Push helpers ──────────────────────────────────────────────────
async function push(patch) {
  isSyncing = true;
  await pushState(ROOM, { ...patch, updatedBy: 'remote' });
  isSyncing = false;
}

async function pushStyle(key, val) {
  isSyncing = true;
  await pushState(ROOM, { style: { [key]: val }, updatedBy: 'remote' });
  isSyncing = false;
}

// ── Play / Pause ──────────────────────────────────────────────────
playBtn.addEventListener('click', () => {
  const next = !state.playing;
  state.playing = next;
  updatePlayBtn(next);
  push({ playing: next });
});

function updatePlayBtn(playing) {
  playBtn.className = 'play-btn ' + (playing ? 'playing' : 'paused');
  playIcon.textContent = playing ? '⏸' : '▶';
  playLabel.textContent = playing ? 'Pause' : 'Play';
}

// ── Speed ─────────────────────────────────────────────────────────
const SPEED_LABELS = [
  [1,  15,  'Very Slow'],
  [16, 30,  'Slow'],
  [31, 50,  'Medium'],
  [51, 70,  'Fast'],
  [71, 85,  'Very Fast'],
  [86, 100, 'Max'],
];

function speedLabel(v) {
  for (const [lo, hi, label] of SPEED_LABELS) {
    if (v >= lo && v <= hi) return label;
  }
  return '';
}

function setSpeed(v) {
  v = Math.min(100, Math.max(1, v));
  state.speed = v;
  speedSlider.value = v;
  speedVal.textContent = v;
  speedLbl.textContent = speedLabel(v);
  push({ speed: v });
}

speedSlider.addEventListener('input', () => setSpeed(+speedSlider.value));
document.getElementById('speed-m5').addEventListener('click', () => setSpeed(state.speed - 5));
document.getElementById('speed-m1').addEventListener('click', () => setSpeed(state.speed - 1));
document.getElementById('speed-p1').addEventListener('click', () => setSpeed(state.speed + 1));
document.getElementById('speed-p5').addEventListener('click', () => setSpeed(state.speed + 5));

document.getElementById('restart-btn').addEventListener('click', () => {
  push({ position: 0, playing: false, manualVelocity: 0 });
  state.playing = false;
  state.position = 0;
  updatePlayBtn(false);
  posSlider.value = 0;
  posVal.textContent = '0%';
});

// ── Scroll Mode ───────────────────────────────────────────────────
const HINTS = {
  auto:   '<strong>Auto:</strong> Continuous scroll at set speed. Play/Pause to control.',
  manual: '<strong>Manual:</strong> Use D-Pad (hold to scroll) or drag the position slider.',
  slide:  '<strong>Slide:</strong> Script divided by <code>---</code> markers. Navigate section by section.',
};

document.querySelectorAll('.seg-btn[data-mode]').forEach(btn => {
  btn.addEventListener('click', () => {
    const mode = btn.dataset.mode;
    document.querySelectorAll('.seg-btn[data-mode]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.mode = mode;
    modeHint.innerHTML = HINTS[mode] || '';
    // Stop any active D-pad velocity when switching away from manual
    if (mode !== 'manual') push({ mode, manualVelocity: 0 });
    else push({ mode });
    updateModeUI(mode);
  });
});

function updateModeUI(mode) {
  cardSpeed.classList.toggle('hidden', mode === 'slide');
  cardDpad.classList.toggle('hidden', mode !== 'manual');
  cardPos.classList.toggle('hidden', mode !== 'manual');
  cardSlides.classList.toggle('hidden', mode !== 'slide');
}

// ── D-pad ─────────────────────────────────────────────────────────
const dpadUp    = document.getElementById('dpad-up');
const dpadDown  = document.getElementById('dpad-down');
const dpadLeft  = document.getElementById('dpad-left');
const dpadRight = document.getElementById('dpad-right');

function dpadActivate(btn) {
  [dpadUp, dpadDown, dpadLeft, dpadRight].forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

function startVelocity(vel, btn) {
  dpadActivate(btn);
  push({ manualVelocity: vel });
}

function stopVelocity() {
  dpadActivate(null);
  push({ manualVelocity: 0 });
}

// Up / Down: hold = scroll, release = stop
[dpadUp, dpadDown].forEach(btn => {
  const vel = btn === dpadDown ? 1 : -1;

  btn.addEventListener('pointerdown', e => {
    e.preventDefault();
    btn.setPointerCapture(e.pointerId);
    startVelocity(vel, btn);
  });
  btn.addEventListener('pointerup',     () => stopVelocity());
  btn.addEventListener('pointercancel', () => stopVelocity());
  btn.addEventListener('lostpointercapture', () => stopVelocity());
});

// Left / Right: one-shot jump ±10%
dpadLeft.addEventListener('click', () => {
  nudgePos(-10);
  dpadActivate(dpadLeft);
  setTimeout(() => dpadActivate(null), 180);
});
dpadRight.addEventListener('click', () => {
  nudgePos(+10);
  dpadActivate(dpadRight);
  setTimeout(() => dpadActivate(null), 180);
});

// Safety: release velocity if user lifts finger anywhere on page
document.addEventListener('pointerup',     () => { if (state.manualVelocity !== 0) stopVelocity(); });
document.addEventListener('pointercancel', () => { if (state.manualVelocity !== 0) stopVelocity(); });

// ── Manual Position ───────────────────────────────────────────────
posSlider.addEventListener('input', () => {
  const v = +posSlider.value;
  posVal.textContent = v + '%';
  state.position = v;
  push({ position: v, playing: false, manualVelocity: 0 });
});

document.getElementById('pos-m10').addEventListener('click',  () => nudgePos(-10));
document.getElementById('pos-back').addEventListener('click', () => nudgePos(-1));
document.getElementById('pos-fwd').addEventListener('click',  () => nudgePos(+1));
document.getElementById('pos-p10').addEventListener('click',  () => nudgePos(+10));
document.getElementById('pos-restart').addEventListener('click', () => {
  posSlider.value = 0;
  posVal.textContent = '0%';
  state.position = 0;
  push({ position: 0, manualVelocity: 0 });
});
document.getElementById('pos-end').addEventListener('click', () => {
  posSlider.value = 100;
  posVal.textContent = '100%';
  state.position = 100;
  push({ position: 100, manualVelocity: 0 });
});

function nudgePos(delta) {
  const v = Math.min(100, Math.max(0, state.position + delta));
  state.position = v;
  posSlider.value = v;
  posVal.textContent = v + '%';
  push({ position: v, manualVelocity: 0 });
}

// ── Slides ────────────────────────────────────────────────────────
document.getElementById('prev-slide').addEventListener('click', () => {
  const next = Math.max(0, state.slide - 1);
  state.slide = next;
  updateSlideCounter(next);
  push({ slide: next });
});
document.getElementById('next-slide').addEventListener('click', () => {
  const next = Math.min(totalSections - 1, state.slide + 1);
  state.slide = next;
  updateSlideCounter(next);
  push({ slide: next });
});

function updateSlideCounter(idx) {
  slideNum.textContent = idx + 1;
  slideTotal.textContent = `of ${totalSections}`;
}

// ── Font Size ─────────────────────────────────────────────────────
function setFontSize(v) {
  v = Math.min(90, Math.max(18, v));
  sizeSlider.value = v;
  sizeVal.textContent = v + 'px';
  pushStyle('fontSize', v);
}

sizeSlider.addEventListener('input', () => setFontSize(+sizeSlider.value));
document.getElementById('size-down').addEventListener('click', () => setFontSize(+sizeSlider.value - 1));
document.getElementById('size-up').addEventListener('click',   () => setFontSize(+sizeSlider.value + 1));
document.getElementById('size-m4').addEventListener('click',   () => setFontSize(+sizeSlider.value - 4));
document.getElementById('size-m1').addEventListener('click',   () => setFontSize(+sizeSlider.value - 1));
document.getElementById('size-p1').addEventListener('click',   () => setFontSize(+sizeSlider.value + 1));
document.getElementById('size-p4').addEventListener('click',   () => setFontSize(+sizeSlider.value + 4));

// ── Line Height ───────────────────────────────────────────────────
function setLineHeight(v) {
  v = Math.min(3.0, Math.max(1.0, Math.round(v * 20) / 20)); // round to 0.05
  lhSlider.value = v;
  lhVal.textContent = v.toFixed(2);
  pushStyle('lineHeight', v);
}

lhSlider.addEventListener('input', () => setLineHeight(+lhSlider.value));
document.getElementById('lh-down').addEventListener('click', () => setLineHeight(+lhSlider.value - 0.05));
document.getElementById('lh-up').addEventListener('click',   () => setLineHeight(+lhSlider.value + 0.05));

// ── Font Family ───────────────────────────────────────────────────
document.querySelectorAll('.font-opt').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.font-opt').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    pushStyle('fontFamily', btn.dataset.font);
  });
});

// ── Colors ────────────────────────────────────────────────────────
document.getElementById('text-color').addEventListener('input', e => pushStyle('textColor', e.target.value));
document.getElementById('bg-color').addEventListener('input',   e => pushStyle('bgColor',   e.target.value));

document.querySelectorAll('.preset-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tc = btn.dataset.text;
    const bc = btn.dataset.bg;
    document.getElementById('text-color').value = tc;
    document.getElementById('bg-color').value   = bc;
    pushState(ROOM, { style: { textColor: tc, bgColor: bc }, updatedBy: 'remote' });
    toast('Preset applied');
  });
});

// ── Display Toggles ───────────────────────────────────────────────
document.getElementById('highlight-toggle').addEventListener('change', e => pushStyle('highlight', e.target.checked));
document.getElementById('mirror-toggle').addEventListener('change',    e => pushStyle('mirror',    e.target.checked));

// ── Collapsible Cards ─────────────────────────────────────────────
document.querySelectorAll('.card-header[data-toggle]').forEach(header => {
  header.addEventListener('click', () => header.closest('.card').classList.toggle('collapsed'));
});

// ── Apply incoming Firebase state to UI ──────────────────────────
function applyStateToUI(s) {
  if (!s) return;
  state = { ...state, ...s, style: { ...state.style, ...(s.style || {}) } };

  updatePlayBtn(s.playing);

  if (s.mode) {
    document.querySelectorAll('.seg-btn[data-mode]').forEach(b => {
      b.classList.toggle('active', b.dataset.mode === s.mode);
    });
    modeHint.innerHTML = HINTS[s.mode] || '';
    updateModeUI(s.mode);
  }

  if (s.speed !== undefined) {
    speedSlider.value = s.speed;
    speedVal.textContent = s.speed;
    speedLbl.textContent = speedLabel(s.speed);
  }

  // Position: only update slider when the prompter is reporting back
  if (s.updatedBy === 'prompter' && s.position !== undefined) {
    state.position = s.position;
    posSlider.value = s.position;
    posVal.textContent = s.position + '%';
  }

  if (s.slide !== undefined) updateSlideCounter(s.slide);

  const st = s.style || {};
  if (st.fontSize !== undefined) {
    sizeSlider.value = st.fontSize;
    sizeVal.textContent = st.fontSize + 'px';
  }
  if (st.lineHeight !== undefined) {
    lhSlider.value = st.lineHeight;
    lhVal.textContent = parseFloat(st.lineHeight).toFixed(2);
  }
  if (st.fontFamily) {
    document.querySelectorAll('.font-opt').forEach(b => {
      b.classList.toggle('active', b.dataset.font === st.fontFamily);
    });
  }
  if (st.textColor) document.getElementById('text-color').value = st.textColor;
  if (st.bgColor)   document.getElementById('bg-color').value   = st.bgColor;
  if (st.highlight !== undefined) document.getElementById('highlight-toggle').checked = st.highlight;
  if (st.mirror    !== undefined) document.getElementById('mirror-toggle').checked    = st.mirror;
}

// ── Section count ─────────────────────────────────────────────────
async function countSections() {
  const { getScript } = await import('./db.js');
  const script = await getScript(ROOM);
  if (script) {
    totalSections = script.split(/\n---\n/).filter(Boolean).length || 1;
    updateSlideCounter(state.slide || 0);
  }
}

// ── Status ────────────────────────────────────────────────────────
function setStatus(ok) {
  statusDot.className = 'status-dot ' + (ok ? 'connected' : 'disconnected');
  statusText.textContent = ok ? 'Live' : 'Connecting…';
}

// ── Boot ──────────────────────────────────────────────────────────
setStatus(false);
countSections();

// Seed speed label from default
speedLbl.textContent = speedLabel(DEFAULT_STATE.speed);

watchState(ROOM, incoming => {
  if (!incoming) { setStatus(false); return; }
  setStatus(true);
  if (!isSyncing) applyStateToUI(incoming);
});
