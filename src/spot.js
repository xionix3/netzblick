// Börsenpreise EPEX Spot Day-Ahead für Österreich, für dynamische Stromtarife.
// Quelle: Energy-Charts (Fraunhofer ISE), Daten: Bundesnetzagentur | SMARD.de, Lizenz CC BY 4.0.
// Seit 1.10.2025 in Viertelstunden, davor in Stunden. Die Preise für morgen gibt es ab etwa 13 Uhr.
//
//   GET https://api.energy-charts.info/price?bzn=AT&start=JJJJ-MM-TT&end=JJJJ-MM-TT
//   → {unix_seconds: [...], price: [EUR/MWh ...], unit: 'EUR / MWh', license_info}
//   start und end sind lokale Kalendertage (beide inklusive).
//
// Die API bremst viele Abfragen kurz hintereinander (HTTP 429). Darum lädt Netzblick fehlende Monate
// in einer einzigen Abfrage und hält jeden Monat im Gerät vor.

export const SPOT_URL = 'https://api.energy-charts.info/price';
export const SPOT_SOURCE = {
  label: 'Energy-Charts (Fraunhofer ISE), Daten: Bundesnetzagentur | SMARD.de, CC BY 4.0',
  url: 'https://www.energy-charts.info/charts/price_spot_market/chart.htm?l=de&c=AT',
};
/** Ab hier gibt es die Preiszone Österreich (Trennung von Deutschland) */
export const SPOT_SINCE = new Date(2018, 9, 1);

/**
 * Preiszonen zum Vergleich: Österreich und die Nachbarn, deren Preise Energy-Charts frei (CC BY 4.0) weitergibt.
 * Die Slowakei fehlt: Für sie gibt es dort nur Daten zur privaten Nutzung.
 */
export const ZONES = [
  { id: 'AT', name: 'Österreich', short: 'AT' },
  { id: 'DE-LU', name: 'Deutschland', short: 'DE' },
  { id: 'CH', name: 'Schweiz', short: 'CH' },
  { id: 'CZ', name: 'Tschechien', short: 'CZ' },
  { id: 'HU', name: 'Ungarn', short: 'HU' },
  { id: 'SI', name: 'Slowenien', short: 'SI' },
  { id: 'IT-North', name: 'Italien Nord', short: 'IT' },
];

const PREFIX = 'nb.spot.';
const MAX_MONTHS = 40;
const DAY = 86400000;
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const monthKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const monthStart = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
const nextMonth = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 1);
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export class SpotError extends Error {
  constructor(msg, { busy = false, retryAfter = null } = {}) {
    super(msg);
    this.busy = busy;
    this.retryAfter = retryAfter; // Sekunden, laut Antwort des Dienstes
  }
}

/**
 * Preis einer Kilowattstunde Energie im dynamischen Tarif, brutto in Cent.
 * spot: Börsenpreis in Cent/kWh netto; sup: {ct: Aufschlag Cent/kWh brutto, pct: Aufschlag % auf den Betrag des Börsenpreises}
 * Der Prozentaufschlag wirkt wie bei den Anbietern auf den Absolutbetrag, ist also auch bei negativen Preisen ein Aufschlag.
 */
export function dynamicPrice(spot, sup, vat = 0.2) {
  return (spot + Math.abs(spot) * ((sup.pct || 0) / 100)) * (1 + vat) + (sup.ct || 0);
}

/** Antwort von Energy-Charts → Monate {key: {start (ms), step (ms), p: [ct netto | null]}} */
export function parseSpot(data) {
  const t = (data && data.unix_seconds) || [];
  const v = (data && data.price) || [];
  const out = {};
  for (let i = 0; i < t.length; i++) {
    const ms = t[i] * 1000;
    const d = new Date(ms);
    const k = monthKey(d);
    let m = out[k];
    if (!m) {
      const next = i + 1 < t.length ? t[i + 1] * 1000 - ms : 900000;
      m = out[k] = { start: ms, step: next === 3600000 ? 3600000 : 900000, p: [] };
    }
    const idx = Math.round((ms - m.start) / m.step);
    m.p[idx] = v[i] == null ? null : Math.round(v[i] * 100) / 1000; // EUR/MWh → ct/kWh (3 Stellen)
  }
  for (const m of Object.values(out)) for (let i = 0; i < m.p.length; i++) if (m.p[i] === undefined) m.p[i] = null;
  return out;
}

export class SpotStore {
  /**
   * http: wie platform.http ({method, url}) → {status, data, headers}
   * bzn: Preiszone; Österreich behält den alten Speicherplatz, Nachbarländer halten nur wenige Monate vor.
   */
  constructor(http, { now = () => new Date(), bzn = 'AT', maxMonths } = {}) {
    this.http = http;
    this.now = now;
    this.bzn = bzn;
    this.prefix = bzn === 'AT' ? PREFIX : `${PREFIX}${bzn}.`;
    this.maxMonths = maxMonths || (bzn === 'AT' ? MAX_MONTHS : 3);
    this.months = new Map(); // 'JJJJ-MM' → {start, step, p, at, full}
    this.tried = new Map(); // 'JJJJ-MM' → Zeitpunkt der letzten Abfrage
    this.pending = null;
  }

  /** Letzter Tag mit Preisen: morgen (ab etwa 13 Uhr veröffentlicht) */
  lastDay() {
    const n = this.now();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1);
  }

  /** Ist der Monat vollständig und alt genug, dass er sich nicht mehr ändert? */
  stable(start) {
    return nextMonth(start).getTime() + 2 * DAY < this.now().getTime();
  }

  read(key) {
    if (this.months.has(key)) return this.months.get(key);
    try {
      const raw = localStorage.getItem(this.prefix + key);
      if (raw) {
        const m = JSON.parse(raw);
        this.months.set(key, m);
        return m;
      }
    } catch { /* ignorieren */ }
    return null;
  }

  write(key, m) {
    this.months.set(key, m);
    try {
      let idx = JSON.parse(localStorage.getItem(this.prefix + 'index') || '[]').filter((k) => k !== key);
      idx.push(key);
      while (idx.length > this.maxMonths) {
        const old = idx.shift();
        localStorage.removeItem(this.prefix + old);
        this.months.delete(old);
      }
      localStorage.setItem(this.prefix + key, JSON.stringify(m));
      localStorage.setItem(this.prefix + 'index', JSON.stringify(idx));
    } catch { /* Speicher voll: nur im Speicher behalten */ }
  }

  /** Ist ein Monat vorhanden und aktuell genug? */
  fresh(start) {
    const m = this.read(monthKey(start));
    if (!m) return false;
    if (m.full) return true; // vollständiger, abgeschlossener Monat
    if (this.stable(start)) return false; // während des Monats gespeichert: einmal vollständig nachladen
    // laufender Monat: bis morgen vorhanden? Sonst nach einer Stunde erneut versuchen
    const lastNeeded = Math.min(nextMonth(start).getTime(), this.lastDay().getTime() + DAY) - m.step;
    const lastHave = m.start + (m.p.length - 1) * m.step;
    return lastHave >= lastNeeded || Date.now() - (m.at || 0) < 3600000;
  }

  /** Lädt die Preise für [from, to), soweit es sie gibt (ab Oktober 2018 bis morgen). */
  async ensure(from, to) {
    const first = from < SPOT_SINCE ? SPOT_SINCE : from;
    const lastDay = this.lastDay();
    const end = to > new Date(lastDay.getTime() + DAY) ? new Date(lastDay.getTime() + DAY) : to;
    if (first >= end) return;
    if (this.pending) await this.pending.catch(() => {});
    const missing = [];
    for (let m = monthStart(first); m < end; m = nextMonth(m)) {
      const k = monthKey(m);
      // nicht ständig neu fragen, wenn es (noch) keine Preise gibt oder der Dienst bremst
      if (!this.fresh(m) && !(this.tried.get(k) > Date.now() - 15 * 60000)) missing.push(m);
    }
    if (!missing.length) return;
    const a = missing[0];
    const b = new Date(Math.min(nextMonth(missing[missing.length - 1]).getTime() - DAY, lastDay.getTime()));
    for (const m of missing) this.tried.set(monthKey(m), Date.now());
    this.pending = (async () => {
      const url = `${SPOT_URL}?bzn=${encodeURIComponent(this.bzn)}&start=${ymd(a)}&end=${ymd(startOfDay(b))}`;
      const r = await this.http({ method: 'GET', url });
      if (r.status === 429) {
        const ra = Number((r.headers && r.headers['retry-after']) || NaN);
        const retryAfter = Number.isFinite(ra) && ra >= 0 ? ra : null;
        // nach der Wartezeit des Dienstes wieder fragen dürfen, nicht erst nach 15 Minuten
        const again = Date.now() - 15 * 60000 + Math.max(1, retryAfter ?? 60) * 1000;
        for (const m of missing) this.tried.set(monthKey(m), again);
        throw new SpotError('Der Dienst für Börsenpreise ist gerade ausgelastet. Bitte später erneut versuchen.', { busy: true, retryAfter });
      }
      if (r.status !== 200 || !r.data || !Array.isArray(r.data.unix_seconds)) throw new SpotError(`Börsenpreise nicht verfügbar (HTTP ${r.status}).`);
      const months = parseSpot(r.data);
      const at = Date.now();
      for (const m of missing) {
        const k = monthKey(m);
        if (months[k]) this.write(k, { ...months[k], at, full: this.stable(m) });
      }
    })();
    try { await this.pending; } finally { this.pending = null; }
  }

  /** Börsenpreis in Cent/kWh netto: Viertelstunde (15), Stundenmittel (60) oder Tagesmittel ('day') */
  at(t, interval = 15) {
    if (interval === 'day') return this.dayAvg(t);
    const m = this.read(monthKey(t));
    if (!m) return null;
    const i = Math.floor((t.getTime() - m.start) / m.step);
    if (i < 0 || i >= m.p.length) return null;
    if (interval === 60 && m.step === 900000) {
      const h0 = new Date(t.getFullYear(), t.getMonth(), t.getDate(), t.getHours()).getTime();
      const j = Math.floor((h0 - m.start) / m.step);
      const vals = m.p.slice(Math.max(0, j), j + 4).filter((x) => x != null);
      return vals.length ? vals.reduce((x, y) => x + y, 0) / vals.length : null;
    }
    return m.p[i];
  }

  /** Mittel eines Kalendertags (ungewichtet) */
  dayAvg(t) {
    const d0 = startOfDay(t).getTime();
    const m = this.read(monthKey(t));
    if (!m) return null;
    const i0 = Math.max(0, Math.floor((d0 - m.start) / m.step));
    const i1 = Math.min(m.p.length, Math.floor((d0 + DAY - m.start) / m.step));
    let s = 0, n = 0;
    for (let i = i0; i < i1; i++) if (m.p[i] != null) { s += m.p[i]; n++; }
    return n ? s / n : null;
  }

  /** Alle Werte in [from, to) als [{t, p}] (Cent/kWh netto), z. B. für ein Diagramm */
  series(from, to) {
    const out = [];
    for (let m = monthStart(from); m < to; m = nextMonth(m)) {
      const e = this.read(monthKey(m));
      if (!e) continue;
      e.p.forEach((p, i) => {
        const t = e.start + i * e.step;
        if (t >= from.getTime() && t < to.getTime()) out.push({ t: new Date(t), p, step: e.step });
      });
    }
    return out;
  }

  /** Mittel über [from, to) (ungewichtet), falls geladen */
  avg(from, to) {
    let s = 0, n = 0;
    for (const x of this.series(from, to)) if (x.p != null) { s += x.p; n++; }
    return n ? s / n : null;
  }
}
