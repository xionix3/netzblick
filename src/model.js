// Datenmodell: Zählpunkte, Laden der Messreihen, Aggregation und Kennzahlen
import { cacheGet, cachePut } from './cache.js';
import { dow } from './format.js';
import { addDays, addMonths, startOfDay, daysBetween, resolutionFor, chartBucketFor, comparePeriod } from './time.js';

export const QUARTER_MS = 15 * 60 * 1000;
const STATUS_RANK = { W: 0, M: 1, V: 2, E: 3, G: 4, F: 5 };
export const STATUS_LABEL = {
  W: 'Gemessen', M: 'Manueller Wert', V: 'Vorläufiger Wert', E: 'Ersatzwert', G: 'Gestörter Wert', F: 'Fehlender Wert',
};
const worse = (a, b) => ((STATUS_RANK[b] || 0) > (STATUS_RANK[a] || 0) ? b : a);

/* ------------------------------------------------------------------ Zählpunkte */

const flowOf = (id) => (/^1-0:1\.8\./.test(id) ? 'consumption' : /^1-0:2\.8\./.test(id) ? 'feedin' : null);

/** Wandelt die Login-Antwort in eine Liste von Zählpunkten mit ihren Registern um */
export function meterPointsFrom(accounts) {
  const collect = (includeBalance) => {
    const map = new Map();
    for (const acc of accounts) {
      for (const om of acc.operModesAtMeterPts || []) {
        if (!includeBalance && om.category === 'Balance') continue; // Bilanz-Ansicht doppelt die Zählpunkte
        const id = om.meteringPointIdentifier;
        if (!id) continue;
        let mp = map.get(id);
        if (!mp) {
          mp = {
            id,
            accountId: acc.identifier,
            accountName: acc.displayName,
            address: om.address || null,
            name: om.meteringPointName || null,
            flows: {},
          };
          map.set(id, mp);
        }
        for (const v of om.valueIdentifiers || []) {
          const flow = flowOf(v.identifier);
          if (!flow || v.isActiveEnergy === false) continue;
          const f = (mp.flows[flow] ||= { q15: null, daily: [], all: [] });
          if (f.all.some((x) => x.id === v.identifier)) continue;
          const reg = {
            id: v.identifier,
            type: v.type || 'MeterReadingSequence',
            interval: v.measuringIntervalSeconds || 0,
            start: v.startTimestamp ? new Date(v.startTimestamp) : new Date(2000, 0, 1),
            end: v.endTimestamp ? new Date(v.endTimestamp) : new Date(2100, 0, 1),
          };
          f.all.push(reg);
          if (reg.interval > 0 && reg.interval <= 3600) {
            if (!f.q15 || reg.interval < f.q15.interval) f.q15 = reg;
          } else {
            f.daily.push(reg);
          }
        }
      }
    }
    return [...map.values()].filter((mp) => Object.keys(mp.flows).length);
  };
  let list = collect(false);
  if (!list.length) list = collect(true);
  return list;
}

/** Zählpunktnummer kompakt: Länderkennung + Netzbetreiber … letzte 8 Stellen */
export const compactId = (id) => (id && id.length > 16 ? `${id.slice(0, 6)}…${id.slice(-8)}` : id || '');

/** Anzeigename: eigener Name, sonst die Zählpunktnummer (wie im Smart-Meter-Portal) */
export function meterLabel(mp, names = {}, { compact = false } = {}) {
  if (names && names[mp.id]) return names[mp.id];
  return compact ? compactId(mp.id) : mp.id;
}

export const shortId = (mp) => '…' + mp.id.slice(-6);

/** frühestes Datum, ab dem Daten vorliegen */
export function firstDataDate(mps, flow) {
  let first = null;
  for (const mp of mps) {
    const f = mp.flows[flow];
    if (!f) continue;
    for (const r of f.all) if (!first || r.start < first) first = r.start;
  }
  return first;
}

/* ------------------------------------------------------------------ Laden */

const stableAfter = 3 * 86400000; // Zeiträume, die >3 Tage zurückliegen, ändern sich praktisch nicht mehr

export class DataStore {
  constructor(api, { offline = false } = {}) {
    this.api = api;
    this.offline = offline;
    this.pending = new Map();
  }

  async fetchSeries(mp, reg, from, to, timeParameter, { force = false } = {}) {
    const key = `${mp.id}|${reg.id}|${timeParameter}|${from.getTime()}|${to.getTime()}`;
    const stable = Date.now() - to.getTime() > stableAfter;
    const maxAge = stable ? 30 * 86400000 : 20 * 60000;
    const hit = cacheGet(key, maxAge);
    if (hit && (hit.fresh || this.offline) && !force) return hit.value;
    if (this.pending.has(key)) return this.pending.get(key);
    const p = this.api
      .series({ accountId: mp.accountId, meterPointId: mp.id, valueId: reg.id, type: reg.type, from, to, timeParameter })
      .then((pts) => {
        cachePut(key, pts);
        return pts;
      })
      .catch((e) => {
        if (hit) { // veraltete Daten sind besser als keine
          this.lastStale = true;
          return hit.value;
        }
        throw e;
      })
      .finally(() => this.pending.delete(key));
    this.pending.set(key, p);
    return p;
  }

  /**
   * Lädt Verbrauch/Einspeisung eines Zählpunkts.
   * res: 'original' (15 min) | 'daily' | 'monthly' | 'yearly'
   * Liefert {points, fine (15-min?), source}
   */
  async load(mp, flow, from, to, res, { preferFine = false, force = false } = {}) {
    const f = mp.flows[flow];
    if (!f) return { points: [], fine: false, source: null };
    const q = f.q15;
    const covers = q && q.start <= from;
    const overlaps = q && q.start < to;
    if (q && (covers || (res === 'original' && preferFine && overlaps))) {
      const pts = await this.fetchSeries(mp, q, from, to, res, { force });
      return { points: pts, fine: res === 'original', source: q.id };
    }
    if (f.daily.length) {
      const tp = res === 'original' ? 'daily' : res;
      const all = await Promise.all(f.daily.map((r) => this.fetchSeries(mp, r, from, to, tp, { force })));
      return { points: mergeSum(all), fine: false, source: f.daily.map((r) => r.id).join('+') };
    }
    if (q) {
      const pts = await this.fetchSeries(mp, q, from, to, res, { force });
      return { points: pts, fine: res === 'original', source: q.id };
    }
    return { points: [], fine: false, source: null };
  }

  /** Aktueller Zählerstand (letzter Viertelstundenwert der letzten Tage) → {reading, t} */
  async latestReading(mp, flow = 'consumption') {
    const q = mp.flows[flow] && mp.flows[flow].q15;
    if (!q) return null;
    const key = `reading|${mp.id}|${q.id}`;
    const hit = cacheGet(key, 30 * 60000);
    if (hit && (hit.fresh || this.offline)) return hit.value && { reading: hit.value.reading, t: new Date(hit.value.t) };
    try {
      const to = addDays(startOfDay(new Date()), 1);
      const from = addDays(to, -4);
      const pts = await this.api.series({ accountId: mp.accountId, meterPointId: mp.id, valueId: q.id, type: q.type, from, to, timeParameter: 'original' });
      let last = null;
      for (const p of pts) if (p.r != null && p.v != null) last = p;
      const val = last ? { reading: last.r, t: last.t.getTime() + QUARTER_MS } : null;
      cachePut(key, val);
      return val && { reading: val.reading, t: new Date(val.t) };
    } catch {
      return hit && hit.value ? { reading: hit.value.reading, t: new Date(hit.value.t) } : null;
    }
  }

  async maxPower(mp, flow, from, to) {
    const f = mp.flows[flow];
    if (!f || !f.q15) return null;
    const start = from < f.q15.start ? f.q15.start : from;
    if (start >= to) return null;
    const key = `max|${mp.id}|${f.q15.id}|${start.getTime()}|${to.getTime()}`;
    const stable = Date.now() - to.getTime() > stableAfter;
    const hit = cacheGet(key, stable ? 30 * 86400000 : 20 * 60000);
    if (hit && (hit.fresh || this.offline)) return hit.value && { ...hit.value, t: new Date(hit.value.t) };
    try {
      const r = await this.api.maxPower({ accountId: mp.accountId, meterPointId: mp.id, valueId: f.q15.id, type: f.q15.type, from: start, to });
      cachePut(key, r && { kw: r.kw, t: r.t.getTime(), s: r.s });
      return r;
    } catch (e) {
      if (hit) return hit.value && { ...hit.value, t: new Date(hit.value.t) };
      return null; // Spitzenwert ist optional
    }
  }
}

/** Summiert mehrere Reihen nach Zeitstempel (z. B. Tarifregister 1.8.1 + 1.8.2 oder mehrere Zählpunkte) */
export function mergeSum(seriesList) {
  const map = new Map();
  for (const series of seriesList) {
    for (const p of series) {
      const k = p.t.getTime();
      const e = map.get(k);
      if (!e) map.set(k, { t: p.t, v: p.v, s: p.s });
      else {
        e.v = e.v == null ? p.v : p.v == null ? e.v : e.v + p.v;
        e.s = worse(e.s, p.s);
      }
    }
  }
  return [...map.values()].sort((a, b) => a.t - b.t);
}

/**
 * Lädt alles, was eine Ansicht braucht.
 * sel: {mps: [mp…], flow, period, compareMode}
 */
export async function loadView(store, sel, { force = false } = {}) {
  const { mps, flow, period, compareMode } = sel;
  const res = resolutionFor(period);
  const bucket = chartBucketFor(period, res);
  const preferFine = bucket === 'quarter';
  const cp = comparePeriod(period, compareMode);
  store.lastStale = false;

  const jobs = mps.map(async (mp) => {
    const cur = await store.load(mp, flow, period.start, period.end, res, { preferFine, force });
    const cmp = cp ? await store.load(mp, flow, cp.start, cp.end, res, { preferFine, force }).catch(() => null) : null;
    // Spitzenleistung für lange Zeiträume ohne 15-min-Daten vom Server holen
    const peak = !cur.fine ? await store.maxPower(mp, flow, period.start, period.end) : null;
    return { mp, cur, cmp, peak };
  });
  const perMp = await Promise.all(jobs);
  const fine = perMp.length > 0 && perMp.every((x) => x.cur.fine);
  return {
    period, comparePeriod: cp, res, bucket: fine ? bucket : bucket === 'quarter' ? 'day' : bucket, fine, perMp,
    stale: !!store.lastStale, loadedAt: new Date(),
  };
}

/* ------------------------------------------------------------------ Filter & Aggregation */

export const DEFAULT_FILTERS = { weekdays: [true, true, true, true, true, true, true], hours: [0, 24] };

export function filtersActive(f) {
  return f.weekdays.some((x) => !x) || !(f.hours[0] === 0 && f.hours[1] === 24);
}
export function hourFilterActive(f) {
  return !(f.hours[0] === 0 && f.hours[1] === 24);
}

const inHours = (h, [a, b]) => (a === 0 && b === 24 ? true : a < b ? h >= a && h < b : h >= a || h < b);

/** Filter auf Wochentage und (bei 15-min-Daten) Tageszeit */
export function applyFilters(points, filters, fine) {
  if (!filters || !filtersActive(filters)) return points;
  const hf = fine && hourFilterActive(filters);
  return points.filter((p) => {
    if (!filters.weekdays[dow(p.t)]) return false;
    if (hf) return inHours(p.t.getHours() + p.t.getMinutes() / 60, filters.hours);
    return true;
  });
}

const bucketStart = {
  quarter: (d) => d,
  hour: (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()),
  day: (d) => startOfDay(d),
  month: (d) => new Date(d.getFullYear(), d.getMonth(), 1),
  year: (d) => new Date(d.getFullYear(), 0, 1),
};

/** Alle Buckets eines Zeitraums (auch leere), damit die Achse vollständig ist */
export function bucketAxis(period, bucket, clampFrom) {
  const out = [];
  let d = bucketStart[bucket](clampFrom && clampFrom > period.start ? clampFrom : period.start);
  const end = period.end;
  let guard = 0;
  while (d < end && guard++ < 20000) {
    out.push(d);
    if (bucket === 'quarter') d = new Date(d.getTime() + QUARTER_MS);
    else if (bucket === 'hour') d = new Date(d.getTime() + 3600000);
    else if (bucket === 'day') d = addDays(d, 1);
    else if (bucket === 'month') d = addMonths(d, 1);
    else d = new Date(d.getFullYear() + 1, 0, 1);
  }
  return out;
}

/** Summen je Bucket → Map(ms → {v, s, n}) */
export function aggregate(points, bucket) {
  const fn = bucketStart[bucket];
  const map = new Map();
  for (const p of points) {
    const k = fn(p.t).getTime();
    let e = map.get(k);
    if (!e) map.set(k, (e = { v: null, s: 'W', n: 0 }));
    if (p.v != null) {
      e.v = (e.v || 0) + p.v;
      e.n++;
    }
    // fehlende/zukünftige Viertelstunden (F ohne Wert) färben den Bucket nicht ein
    if (p.v != null) e.s = worse(e.s, p.s);
    else if (p.s !== 'W' && p.s !== 'F') e.s = worse(e.s, p.s);
  }
  return map;
}

/** Reihe für ein Diagramm: [{t, v, s}] entlang der Achse */
export function seriesOnAxis(points, axis, bucket) {
  const map = aggregate(points, bucket);
  return axis.map((t) => {
    const e = map.get(t.getTime());
    return { t, v: e ? e.v : null, s: e ? e.s : 'W' };
  });
}

/* ------------------------------------------------------------------ Kennzahlen */

function percentile(sorted, q) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function lastDataPoint(points) {
  for (let i = points.length - 1; i >= 0; i--) if (points[i].v != null) return points[i];
  return null;
}

/** Anzahl abgedeckter Tage (für Ø pro Tag), passend zur Auflösung der Punkte */
function coveredDays(points, res, n) {
  if (res === 'original') return n / 96;
  if (res === 'monthly' || res === 'yearly') {
    const today = startOfDay(new Date());
    let d = 0;
    for (const p of points) {
      if (p.v == null) continue;
      const s = p.t;
      const e = res === 'monthly' ? addMonths(s, 1) : new Date(s.getFullYear() + 1, 0, 1);
      d += Math.max(0, daysBetween(s, e < today ? e : addDays(today, 0)));
    }
    return d;
  }
  return n; // Tageswerte
}

/**
 * Kennzahlen eines (gefilterten) Zeitraums.
 * res: Auflösung der Punkte ('original' = kWh je Viertelstunde, 'daily', 'monthly')
 */
export function computeStats(points, res) {
  const fine = res === 'original' || res === true;
  if (res === true) res = 'original';
  if (res === false || res == null) res = 'daily';
  let total = 0, n = 0, night = 0, peak = null;
  const status = {};
  const powers = [];
  const lastPt = lastDataPoint(points);
  for (const p of points) {
    // fehlende Werte nur bis zum letzten vorhandenen Wert zählen (Zukunft ist nicht „fehlend“)
    if (p.s && p.s !== 'W' && (p.v != null || (p.s === 'F' && lastPt && p.t <= lastPt.t))) status[p.s] = (status[p.s] || 0) + 1;
    if (p.v == null) continue;
    total += p.v;
    n++;
    if (fine) {
      const kwv = p.v * 4;
      powers.push(kwv);
      if (!peak || kwv > peak.kw) peak = { kw: kwv, t: p.t };
      const h = p.t.getHours();
      if (h >= 22 || h < 6) night += p.v;
    }
  }
  powers.sort((a, b) => a - b);
  const last = lastPt;
  const days = coveredDays(points, res, n);
  return {
    total: n ? total : null,
    count: n,
    days,
    avgPerDay: days > 0 ? total / days : null,
    peak,
    baseLoad: fine ? percentile(powers, 0.1) : null, // kW, 10%-Perzentil
    avgPower: fine && n ? (total * 4) / n : null,
    nightShare: fine && total > 0 ? night / total : null,
    status,
    last: last ? last.t : null,
  };
}

/** Schnitt bis „gleicher Stand“: Vergleichszeitraum auf die bereits verstrichene Dauer kürzen */
export function likeForLikeCut(period, cmpPeriod, curPoints, fine) {
  const last = lastDataPoint(curPoints);
  if (!last || !cmpPeriod) return null;
  if (period.end.getTime() <= Date.now() - 86400000 * 2) return null; // abgeschlossener Zeitraum
  if (fine) {
    const elapsed = last.t.getTime() + QUARTER_MS - period.start.getTime();
    return new Date(cmpPeriod.start.getTime() + elapsed);
  }
  const days = daysBetween(period.start, last.t) + 1;
  return addDays(cmpPeriod.start, days);
}

/** Hochrechnung auf den ganzen Zeitraum (nur laufende Monate/Jahre) */
export function forecast(period, stats) {
  const minDays = { week: 1, month: 3, year: 14 }[period.kind];
  if (!stats.avgPerDay || !minDays || stats.days < minDays) return null;
  const now = new Date();
  if (!(period.start <= now && now < period.end)) return null;
  const totalDays = daysBetween(period.start, period.end);
  if (stats.days >= totalDays) return null;
  return stats.avgPerDay * totalDays;
}

/* ------------------------------------------------------------------ Analysen (15-min) */

/** Durchschnittliche Leistung je Viertelstunde des Tages, Werktage vs. Wochenende */
export function dailyProfile(points) {
  const mk = () => ({ sum: new Float64Array(96), cnt: new Uint32Array(96) });
  const wk = mk(), we = mk();
  for (const p of points) {
    if (p.v == null) continue;
    const i = p.t.getHours() * 4 + Math.floor(p.t.getMinutes() / 15);
    const g = dow(p.t) >= 5 ? we : wk;
    g.sum[i] += p.v * 4;
    g.cnt[i]++;
  }
  const avg = (g) => Array.from(g.sum, (s, i) => (g.cnt[i] ? s / g.cnt[i] : null));
  const has = (g) => g.cnt.some((c) => c > 0);
  return { weekday: has(wk) ? avg(wk) : null, weekend: has(we) ? avg(we) : null };
}

/** Lastgang-Teppich: Tage × Stunden (mittlere Leistung in kW = kWh je Stunde) */
export function carpet(points, period) {
  const last = lastDataPoint(points);
  const all = bucketAxis(period, 'day');
  const days = last ? all.filter((d) => d <= last.t) : all;
  const idx = new Map(days.map((d, i) => [d.getTime(), i]));
  const cells = [];
  const hourMap = new Map();
  for (const p of points) {
    if (p.v == null) continue;
    const di = idx.get(startOfDay(p.t).getTime());
    if (di == null) continue;
    const k = di * 24 + p.t.getHours();
    const e = hourMap.get(k) || { v: 0, n: 0 };
    e.v += p.v;
    e.n++;
    hourMap.set(k, e);
  }
  let max = 0;
  for (const [k, e] of hourMap) {
    // n kann am Zeitumstellungstag 8 sein → auf Mittelwert je Stunde normieren
    const kwAvg = (e.v / e.n) * 4;
    cells.push([k % 24, Math.floor(k / 24), kwAvg]);
    if (kwAvg > max) max = kwAvg;
  }
  return { days, cells, max };
}

/** Mittlerer Tagesverbrauch je Wochentag */
export function weekdayAverages(points) {
  const daily = aggregate(points, 'day');
  const sum = new Array(7).fill(0), cnt = new Array(7).fill(0);
  for (const [ms, e] of daily) {
    if (e.v == null) continue;
    const d = dow(new Date(ms));
    sum[d] += e.v;
    cnt[d]++;
  }
  return sum.map((s, i) => (cnt[i] ? s / cnt[i] : null));
}

/** Monatssummen je Jahr (für den Jahresvergleich in der Gesamtansicht) */
export function monthsByYear(points) {
  const months = aggregate(points, 'month');
  const years = new Map();
  for (const [ms, e] of months) {
    const d = new Date(ms);
    if (!years.has(d.getFullYear())) years.set(d.getFullYear(), new Array(12).fill(null));
    years.get(d.getFullYear())[d.getMonth()] = e.v;
  }
  return [...years.entries()].sort((a, b) => a[0] - b[0]);
}

/** Tageswerte für den Kalender (Jahresansicht) */
export function dailyTotals(points) {
  const daily = aggregate(points, 'day');
  return [...daily.entries()].filter(([, e]) => e.v != null).map(([ms, e]) => ({ t: new Date(ms), v: e.v, s: e.s }));
}

export { daysBetween };

/* ------------------------------------------------------------------ Aufteilung (Kreisdiagramm) */

export const DAY_PARTS = [
  { id: 'night', name: 'Nachts', from: 0, to: 6 },
  { id: 'morning', name: 'Vormittags', from: 6, to: 12 },
  { id: 'afternoon', name: 'Nachmittags', from: 12, to: 18 },
  { id: 'evening', name: 'Abends', from: 18, to: 24 },
];

/** Summe je Tagesabschnitt (braucht Viertelstundenwerte) */
export function splitByDayPart(points) {
  const sums = DAY_PARTS.map(() => 0);
  let any = false;
  for (const p of points) {
    if (p.v == null) continue;
    const h = p.t.getHours();
    const i = DAY_PARTS.findIndex((d) => h >= d.from && h < d.to);
    sums[i] += p.v;
    any = true;
  }
  return any ? DAY_PARTS.map((d, i) => ({ id: d.id, name: `${d.name} ${d.from}–${d.to} Uhr`, value: sums[i] })) : [];
}

/** Summe Werktage gegen Wochenende (Tages- oder Viertelstundenwerte) */
export function splitByWeekpart(points) {
  let wd = 0, we = 0, any = false;
  for (const p of points) {
    if (p.v == null) continue;
    if (dow(p.t) >= 5) we += p.v; else wd += p.v;
    any = true;
  }
  return any ? [{ id: 'weekday', name: 'Werktage', value: wd }, { id: 'weekend', name: 'Wochenende', value: we }] : [];
}

/** Summe je Zählpunkt; parts: [{id, name, points}] */
export function splitByMeter(parts) {
  return parts.map((x) => ({ id: x.id, name: x.name, value: x.points.reduce((a, p) => a + (p.v || 0), 0) }))
    .filter((x) => x.value > 0);
}

/** Auswahl der Zählpunkte: gespeicherte Liste gegen vorhandene prüfen; nie leer */
export function normalizeSelection(saved, mps) {
  const ids = mps.map((m) => m.id);
  let sel = Array.isArray(saved) ? saved.filter((id) => ids.includes(id)) : saved === 'all' ? ids : ids.includes(saved) ? [saved] : [];
  if (!sel.length) sel = ids.slice();
  return ids.filter((id) => sel.includes(id)); // Reihenfolge wie im Portal
}
