import { initDB, getStoredConfig, getRoomCode, watchState, pushState, DEFAULT_STATE }
  from './db.js';

// ── Guard ─────────────────────────────────────────────────────────
const ROOM = getRoomCode();
if (!ROOM || !getStoredConfig()) {
  location.href = 'index.html';
  throw new Error('no room');
}
initDB();

// ── State cache ───────────────────────────────────────────────────
let state = JSON.parse(JSON.stringify(DEFAULT_STATE));
let totalSections = 1;
let isSyncing = false; // prevent feedback loop from our own pushes

// ── DOM ───────────────────────────────────────────────────────────
const statusDot   = document.getElementById('status-dot');
const statusText  = document.getElementById('status-text');
const headerRoom  = document.getElementById('header-room');
const playBtn     = document.getElementById('play-btn');
const playIcon    = document.getElementById('play-icon');
const playLabel   = document.getElementById('play-label');

const speedSlider  = document.getElementById('speed-slider');
const speedVal     = document.getElementById('speed-val');
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
  const patch = {};
  patch[`style/${key}`] = val;  // db.js handles nested style path
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
speedSlider.addEventListener('input', () => {
  const v = +speedSlider.value;
  speedVal.textContent = v;
  state.speed = v;
  push({ speed: v });
});

document.getElementById('speed-down').addEventListener('click', () => nudgeSpeed(-5));
document.getElementById('speed-up').addEventListener('click',   () => nudgeSpeed(+5));
document.getElementById('slower-btn').addEventListener('click', () => nudgeSpeed(-1));
document.getElementById('faster-btn').addEventListener('click', () => nudgeSpeed(+1));

function nudgeSpeed(delta) {
  const v = Math.min(100, Math.max(1, state.speed + delta));
  state.speed = v;
  speedSlider.value = v;
  speedVal.textContent = v;
  push({ speed: v });
}

document.getElementById('restart-btn').addEventListener('click', () => {
  push({ position: 0, playing: false });
  state.playing = false;
  state.position = 0;
  updatePlayBtn(false);
  posSlider.value = 0;
  posVal.textContent = '0%';
});

// ── Scroll Mode ───────────────────────────────────────────────────
const HINTS = {
  auto:   '<strong>Auto:</strong> Continuous scroll at set speed. Play/Pause to control.',
  manual: '<strong>Manual:</strong> Drag the position slider to move the script.',
  slide:  '<strong>Slide:</strong> Script divided by <code>---</code> markers. Navigate section by section.',
};

document.querySelectorAll('.seg-btn[data-mode]').forEach(btn => {
  btn.addEventListener('click', () => {
    const mode = btn.dataset.mode;
    document.querySelectorAll('.seg-btn[data-mode]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.mode = mode;
    modeHint.innerHTML = HINTS[mode] || '';
    updateModeUI(mode);
    push({ mode });
  });
});

function updateModeUI(mode) {
  cardSpeed.classList.toggle('hidden', mode === 'slide');
  cardPos.classList.toggle('hidden', mode !== 'manual');
  cardSlides.classList.toggle('hidden', mode !== 'slide');
  // In slide mode, playing still works (scrolls within section)
}

// ── Manual Position ───────────────────────────────────────────────
posSlider.addEventListener('input', () => {
  const v = +posSlider.value;
  posVal.textContent = v + '%';
  state.position = v;
  push({ position: v, playing: false });
});

document.getElementById('pos-back').addEventListener('click', () => nudgePos(-5));
document.getElementById('pos-fwd').addEventListener('click',  () => nudgePos(+5));
document.getElementById('pos-restart').addEventListener('click', () => {
  posSlider.value = 0;
  posVal.textContent = '0%';
  push({ position: 0 });
});
document.getElementById('pos-end').addEventListener('click', () => {
  posSlider.value = 100;
  posVal.textContent = '100%';
  push({ position: 100 });
});

function nudgePos(delta) {
  const v = Math.min(100, Math.max(0, +posSlider.value + delta));
  posSlider.value = v;
  posVal.textContent = v + '%';
  state.position = v;
  push({ position: v });
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
sizeSlider.addEventListener('input', () => {
  const v = +sizeSlider.value;
  sizeVal.textContent = v + 'px';
  pushStyle('fontSize', v);
});

document.getElementById('size-down').addEventListener('click', () => nudgeSize(-2));
document.getElementById('size-up').addEventListener('click',   () => nudgeSize(+2));

function nudgeSize(delta) {
  const v = Math.min(90, Math.max(18, +sizeSlider.value + delta));
  sizeSlider.value = v;
  sizeVal.textContent = v + 'px';
  pushStyle('fontSize', v);
}

// ── Line Height ───────────────────────────────────────────────────
lhSlider.addEventListener('input', () => {
  const v = parseFloat(lhSlider.value).toFixed(1);
  lhVal.textContent = v;
  pushStyle('lineHeight', +v);
});

// ── Font Family ───────────────────────────────────────────────────
document.querySelectorAll('.font-opt').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.font-opt').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    pushStyle('fontFamily', btn.dataset.font);
  });
});

// ── Colors ────────────────────────────────────────────────────────
document.getElementById('text-color').addEventListener('input', e => {
  pushStyle('textColor', e.target.value);
});

document.getElementById('bg-color').addEventListener('input', e => {
  pushStyle('bgColor', e.target.value);
});

document.querySelectorAll('.preset-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tc = btn.dataset.text;
    const bc = btn.dataset.bg;
    document.getElementById('text-color').value = tc;
    document.getElementById('bg-color').value   = bc;
    pushState(ROOM, { style: { textColor: tc, bgColor: bc }, updatedBy: 'remote' });
    toast('Color preset applied');
  });
});

// ── Display Toggles ───────────────────────────────────────────────
document.getElementById('highlight-toggle').addEventListener('change', e => {
  pushStyle('highlight', e.target.checked);
});

document.getElementById('mirror-toggle').addEventListener('change', e => {
  pushStyle('mirror', e.target.checked);
});

// ── Collapsible Cards ─────────────────────────────────────────────
document.querySelectorAll('.card-header[data-toggle]').forEach(header => {
  header.addEventListener('click', () => {
    header.closest('.card').classList.toggle('collapsed');
  });
});

// ── Apply incoming state (from Firebase, to sync UI) ─────────────
function applyStateToUI(s) {
  if (!s) return;
  state = { ...state, ...s, style: { ...state.style, ...(s.style || {}) } };

  // Playback
  updatePlayBtn(s.playing);

  // Mode
  if (s.mode) {
    document.querySelectorAll('.seg-btn[data-mode]').forEach(b => {
      b.classList.toggle('active', b.dataset.mode === s.mode);
    });
    modeHint.innerHTML = HINTS[s.mode] || '';
    updateModeUI(s.mode);
  }

  // Speed
  if (s.speed !== undefined) {
    speedSlider.value = s.speed;
    speedVal.textContent = s.speed;
  }

  // Position (only update slider when prompter reports it)
  if (s.updatedBy === 'prompter' && s.position !== undefined) {
    posSlider.value = s.position;
    posVal.textContent = s.position + '%';
  }

  // Slides
  if (s.slide !== undefined) updateSlideCounter(s.slide);

  // Style
  const st = s.style || {};
  if (st.fontSize !== undefined) {
    sizeSlider.value = st.fontSize;
    sizeVal.textContent = st.fontSize + 'px';
  }
  if (st.lineHeight !== undefined) {
    lhSlider.value = st.lineHeight;
    lhVal.textContent = parseFloat(st.lineHeight).toFixed(1);
  }
  if (st.fontFamily) {
    document.querySelectorAll('.font-opt').forEach(b => {
      b.classList.toggle('active', b.dataset.font === st.fontFamily);
    });
  }
  if (st.textColor) document.getElementById('text-color').value = st.textColor;
  if (st.bgColor)   document.getElementById('bg-color').value   = st.bgColor;
  if (st.highlight !== undefined)
    document.getElementById('highlight-toggle').checked = st.highlight;
  if (st.mirror !== undefined)
    document.getElementById('mirror-toggle').checked = st.mirror;
}

// ── Watch script to count sections ───────────────────────────────
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

watchState(ROOM, incoming => {
  if (!incoming) { setStatus(false); return; }
  setStatus(true);
  if (!isSyncing) applyStateToUI(incoming);
});
