// Firebase wrapper — real-time state sync for Promptr

import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getDatabase, ref, onValue, set, update, get }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';

const CONFIG_KEY = 'promptr_firebase_config';

export function getStoredConfig() {
  try { return JSON.parse(localStorage.getItem(CONFIG_KEY)); }
  catch { return null; }
}

export function saveConfig(cfg) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
}

export function clearConfig() {
  localStorage.removeItem(CONFIG_KEY);
}

let _db = null;

export function initDB() {
  const cfg = getStoredConfig();
  if (!cfg) return null;
  if (!getApps().length) initializeApp(cfg);
  _db = getDatabase();
  return _db;
}

export const DEFAULT_STATE = {
  playing: false,
  mode: 'auto',          // 'auto' | 'manual' | 'slide'
  speed: 35,             // 1-100
  position: 0,           // scroll percentage 0-100
  slide: 0,              // current section index (slide mode)
  manualVelocity: 0,     // -1 = scroll up, 0 = stop, 1 = scroll down (D-pad)
  seekTimestamp: 0,      // changes only on explicit position seeks (slider/buttons), never D-pad
  updatedBy: 'remote',
  style: {
    fontSize: 36,
    fontFamily: 'sans',
    textColor: '#ffffff',
    bgColor: '#000000',
    lineHeight: 1.8,
    highlight: true,
    mirror: false,
  },
};

export function roomRef(roomCode) {
  return ref(_db, `rooms/${roomCode.toUpperCase()}`);
}

export function stateRef(roomCode) {
  return ref(_db, `rooms/${roomCode.toUpperCase()}/state`);
}

export function scriptRef(roomCode) {
  return ref(_db, `rooms/${roomCode.toUpperCase()}/script`);
}

export async function initRoom(roomCode, script) {
  const room = roomRef(roomCode);
  await set(room, {
    state: DEFAULT_STATE,
    script: script || '',
    created: Date.now(),
  });
}

export async function getScript(roomCode) {
  const snap = await get(scriptRef(roomCode));
  return snap.exists() ? snap.val() : null;
}

export function watchState(roomCode, cb) {
  return onValue(stateRef(roomCode), snap => {
    cb(snap.exists() ? snap.val() : null);
  });
}

export async function pushState(roomCode, patch) {
  const updates = {};
  for (const [k, v] of Object.entries(patch)) {
    if (k === 'style') {
      for (const [sk, sv] of Object.entries(v)) {
        updates[`rooms/${roomCode.toUpperCase()}/state/style/${sk}`] = sv;
      }
    } else {
      updates[`rooms/${roomCode.toUpperCase()}/state/${k}`] = v;
    }
  }
  await update(ref(_db), updates);
}

export function getRoomCode() {
  return new URLSearchParams(location.search).get('room') || '';
}
