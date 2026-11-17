// Gemeinsame Testumgebung: muss als erstes importiert werden.
// Feste Zeitzone, damit Sommer-/Winterzeit-Tests überall gleich laufen (auch unter Windows).
process.env.TZ = 'Europe/Vienna';

/** Einfacher localStorage-Ersatz mit optionaler Größenbegrenzung (für Quota-Tests) */
export class MemoryStorage {
  constructor(limitChars = Infinity) {
    this.map = new Map();
    this.limit = limitChars;
  }
  get length() { return this.map.size; }
  key(i) { return [...this.map.keys()][i] ?? null; }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) {
    const s = String(v);
    let size = s.length;
    for (const [key, val] of this.map) if (key !== k) size += val.length;
    if (size > this.limit) {
      const e = new Error('QuotaExceededError');
      e.name = 'QuotaExceededError';
      throw e;
    }
    this.map.set(k, s);
  }
  removeItem(k) { this.map.delete(k); }
  clear() { this.map.clear(); }
}

globalThis.localStorage = new MemoryStorage();

/** Viertelstundenwerte erzeugen: fn(Date) → kWh oder null */
export function quarters(from, to, fn, status = () => 'W') {
  const out = [];
  for (let t = from.getTime(); t < to.getTime(); t += 900000) {
    const d = new Date(t);
    out.push({ t: d, v: fn(d), s: status(d) });
  }
  return out;
}

/** Fake-HTTP für den API-Client: Routen nach Pfad, merkt sich alle Aufrufe */
export function fakeHttp(routes) {
  const calls = [];
  const http = async (req) => {
    calls.push(req);
    const path = req.url.replace(/^https:\/\/[^/]+\/enVIEW\/enVIEW\.Portal\.Api\//, '').split('?')[0];
    for (const [pattern, handler] of routes) {
      if (typeof pattern === 'string' ? path === pattern : pattern.test(path)) return handler(req, calls);
    }
    return { status: 404, data: '' };
  };
  http.calls = calls;
  return http;
}
