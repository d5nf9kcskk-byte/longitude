// Podium storage layer — collection-based, one Firestore document per record.
//
// Unlike the other Longitude modules (which store one JSON blob per module in
// modules/{key}), Podium tracks hundreds of orchestras and thousands of
// contacts with an ever-growing touch history. A single blob would be rewritten
// in full on every edit and eventually blow past Firestore's 1 MB doc limit, so
// Podium uses dedicated collections — `orchestras` and `contacts` — with a
// document per record, the same shape the `aiRequests` collection already uses.
//
// A localStorage mirror per collection keeps the UI instant and offline-capable,
// and lets Home read counts synchronously without a Firestore round trip.
//
// PRIVACY: only `orchestras` may carry public-derivable facts. Every person,
// email, note, and touch lives in `contacts` behind the auth gate — never in
// committed source (see CLAUDE.md).

import { db } from './firebase';
import { collection, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore';

const cacheKey = c => `longitude_podium_${c}`;

export function readCache(coll) {
  try {
    const raw = localStorage.getItem(cacheKey(coll));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeCache(coll, arr) {
  try {
    localStorage.setItem(cacheKey(coll), JSON.stringify(arr));
  } catch {
    // storage full / private mode — Firestore still has the data
  }
}

export function countCache(coll) {
  return readCache(coll).length;
}

// Load the whole collection. Firestore is the source of truth; on failure or
// when Firebase isn't configured, fall back to the local mirror.
export async function loadCollection(coll) {
  if (!db) return readCache(coll);
  try {
    const snap = await getDocs(collection(db, coll));
    const arr = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    writeCache(coll, arr);
    return arr;
  } catch (e) {
    console.error(`Podium: failed to load ${coll} from Firestore`, e);
    return readCache(coll);
  }
}

function newId() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch { /* fall through */ }
  return `id_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
}

// Upsert one record. Updates the local mirror immediately, then writes through
// to Firestore. Returns the persisted record (with id / timestamps filled in).
export async function saveRecord(coll, record) {
  const now = Date.now();
  const id = record.id || newId();
  const data = { ...record, id, updatedAt: now, createdAt: record.createdAt || now };

  const arr = readCache(coll);
  const i = arr.findIndex(x => x.id === id);
  if (i >= 0) arr[i] = data;
  else arr.push(data);
  writeCache(coll, arr);

  if (db) {
    try {
      await setDoc(doc(db, coll, id), data);
    } catch (e) {
      console.error(`Podium: failed to save ${coll}/${id}`, e);
    }
  }
  return data;
}

export async function deleteRecord(coll, id) {
  writeCache(coll, readCache(coll).filter(x => x.id !== id));
  if (db) {
    try {
      await deleteDoc(doc(db, coll, id));
    } catch (e) {
      console.error(`Podium: failed to delete ${coll}/${id}`, e);
    }
  }
}
