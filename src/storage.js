// Persistence layer for all Longitude modules.
//
// Each module stores one JSON blob under a key (same shape the original
// Claude-artifact tools used with window.storage). Source of truth is a
// Firestore doc at modules/{key}; localStorage keeps a timestamped mirror so
// the app works offline and survives a write that never flushed (tab closed
// inside the debounce window) — on load, whichever copy is newer wins, and a
// newer local copy is pushed back up to Firestore.

import { db } from './firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const COLLECTION = 'modules';
const DEBOUNCE_MS = 800;
const timers = {};
const pending = {};

function localRead(key) {
  try {
    const raw = localStorage.getItem(`longitude_${key}`);
    return raw ? JSON.parse(raw) : null; // { json, updatedAt }
  } catch {
    return null;
  }
}

function localWrite(key, json, updatedAt) {
  try {
    localStorage.setItem(`longitude_${key}`, JSON.stringify({ json, updatedAt }));
  } catch {
    // storage full / private mode — Firestore still has the data
  }
}

async function firestoreWrite(key, json, updatedAt) {
  if (!db) return;
  try {
    await setDoc(doc(db, COLLECTION, key), { json, updatedAt });
  } catch (e) {
    console.error(`Longitude: failed to save ${key} to Firestore`, e);
  }
}

export async function loadKey(key, fallback) {
  const local = localRead(key);
  let remote = null;
  if (db) {
    try {
      const snap = await getDoc(doc(db, COLLECTION, key));
      if (snap.exists()) remote = snap.data(); // { json, updatedAt }
    } catch (e) {
      console.error(`Longitude: failed to load ${key} from Firestore`, e);
    }
  }

  let winner = null;
  if (local && remote) {
    winner = (local.updatedAt || 0) > (remote.updatedAt || 0) ? local : remote;
  } else {
    winner = remote || local;
  }

  if (!winner) return fallback;

  // A newer local copy means a Firestore write got lost — push it back up.
  if (winner === local && remote !== winner) {
    firestoreWrite(key, local.json, local.updatedAt || Date.now());
  }

  try {
    const data = JSON.parse(winner.json);
    // Merge over the fallback so newly-added fields get their defaults.
    if (fallback && typeof fallback === 'object' && !Array.isArray(fallback)) {
      return { ...fallback, ...data };
    }
    return data;
  } catch {
    return fallback;
  }
}

export function saveKey(key, data) {
  const updatedAt = Date.now();
  const json = JSON.stringify(data);
  localWrite(key, json, updatedAt);
  pending[key] = { json, updatedAt };
  clearTimeout(timers[key]);
  timers[key] = setTimeout(() => {
    const p = pending[key];
    delete pending[key];
    if (p) firestoreWrite(key, p.json, p.updatedAt);
  }, DEBOUNCE_MS);
}

// Flush any debounced writes when the tab is going away. The write may not
// complete, but localStorage already has the data and load() reconciles.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    for (const key of Object.keys(pending)) {
      clearTimeout(timers[key]);
      const p = pending[key];
      delete pending[key];
      if (p) firestoreWrite(key, p.json, p.updatedAt);
    }
  });
}
