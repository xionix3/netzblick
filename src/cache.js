// Kleiner Offline-Cache für Messreihen (localStorage, LRU, kompakt gespeichert)
const PREFIX = 'nb.cache.';
const INDEX_KEY = 'nb.cache.index';
const MAX_ENTRIES = 80;

function readIndex() {
  try { return JSON.parse(localStorage.getItem(INDEX_KEY)) || []; } catch { return []; }
}
function writeIndex(idx) {
  try { localStorage.setItem(INDEX_KEY, JSON.stringify(idx)); } catch { /* voll */ }
}

const memory = new Map();

/** points → kompaktes Format [[ms, value, status], …] */
const pack = (pts) => pts.map((p) => [p.t.getTime(), p.v, p.s === 'W' ? 0 : p.s]);
const unpack = (arr) => arr.map(([t, v, s]) => ({ t: new Date(t), v, s: s === 0 ? 'W' : s }));

export function cacheGet(key, maxAgeMs) {
  const now = Date.now();
  let e = memory.get(key);
  if (!e) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      if (raw) {
        const o = JSON.parse(raw);
        e = { at: o.at, value: o.kind === 'pts' ? unpack(o.value) : o.value };
        memory.set(key, e);
      }
    } catch { /* ignorieren */ }
  }
  if (!e) return null;
  return { value: e.value, fresh: now - e.at <= maxAgeMs, at: e.at };
}

export function cachePut(key, value) {
  const at = Date.now();
  memory.set(key, { at, value });
  const isPts = Array.isArray(value) && (value.length === 0 || value[0].t instanceof Date);
  const payload = JSON.stringify({ at, kind: isPts ? 'pts' : 'json', value: isPts ? pack(value) : value });
  let idx = readIndex().filter((k) => k !== key);
  idx.push(key);
  while (idx.length > MAX_ENTRIES) {
    const old = idx.shift();
    try { localStorage.removeItem(PREFIX + old); } catch { /* */ }
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      localStorage.setItem(PREFIX + key, payload);
      break;
    } catch {
      // Speicher voll → ältere Einträge räumen
      const old = idx.shift();
      if (!old) break;
      try { localStorage.removeItem(PREFIX + old); } catch { /* */ }
    }
  }
  writeIndex(idx);
}

export function cacheClear() {
  memory.clear();
  for (const k of readIndex()) {
    try { localStorage.removeItem(PREFIX + k); } catch { /* */ }
  }
  writeIndex([]);
}
