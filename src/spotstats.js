// Auswertungen der Börsenpreise: Tageswerte, günstigste und teuerste Zeitfenster, typischer Tagesverlauf,
// Teppich (Tage × Stunden). Reine Funktionen auf Punkten {t: Date, v: Zahl | null, step: ms}.

const HOUR = 3600000;
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

/** Viertelstunden zu Stundenmitteln zusammenfassen (Stundenwerte bleiben, wie sie sind) */
export function toHourly(pts) {
  if (!pts.length || (pts[0].step || 900000) >= HOUR) return pts.map((p) => ({ ...p, step: p.step || HOUR }));
  const by = new Map();
  for (const p of pts) {
    const k = new Date(p.t.getFullYear(), p.t.getMonth(), p.t.getDate(), p.t.getHours()).getTime();
    if (!by.has(k)) by.set(k, []);
    if (p.v != null) by.get(k).push(p.v);
  }
  return [...by].map(([k, a]) => ({ t: new Date(k), v: mean(a), step: HOUR }));
}

/** Durchschnitt, billigster und teuerster Wert, Zahl der negativen Preise */
export function dayStats(pts) {
  const ok = pts.filter((p) => p.v != null);
  if (!ok.length) return null;
  let min = ok[0], max = ok[0];
  for (const p of ok) {
    if (p.v < min.v) min = p;
    if (p.v > max.v) max = p;
  }
  return { avg: mean(ok.map((p) => p.v)), min, max, negative: ok.filter((p) => p.v < 0).length, count: ok.length };
}

/**
 * Günstigstes und teuerstes zusammenhängendes Zeitfenster von `hours` Stunden.
 * Lücken (fehlende Werte) unterbrechen ein Fenster. → {cheap, dear} mit {from, to, avg} oder null
 */
export function windows(pts, hours) {
  if (!pts.length) return { cheap: null, dear: null };
  const step = pts[0].step || 900000;
  const n = Math.max(1, Math.round((hours * HOUR) / step));
  let cheap = null, dear = null;
  for (let i = 0; i + n <= pts.length; i++) {
    const a = pts[i], b = pts[i + n - 1];
    if (b.t.getTime() - a.t.getTime() !== (n - 1) * step) continue;
    let s = 0, bad = false;
    for (let j = i; j < i + n; j++) {
      if (pts[j].v == null) { bad = true; break; }
      s += pts[j].v;
    }
    if (bad) continue;
    const w = { from: a.t, to: new Date(b.t.getTime() + step), avg: s / n };
    if (!cheap || w.avg < cheap.avg) cheap = w;
    if (!dear || w.avg > dear.avg) dear = w;
  }
  return { cheap, dear };
}

/** Typischer Tagesverlauf: Mittel je Stunde, getrennt nach Werktagen und Wochenende → {weekday[24], weekend[24]} */
export function profile(pts) {
  const acc = { weekday: Array.from({ length: 24 }, () => []), weekend: Array.from({ length: 24 }, () => []) };
  for (const p of pts) {
    if (p.v == null) continue;
    const we = p.t.getDay() === 0 || p.t.getDay() === 6;
    acc[we ? 'weekend' : 'weekday'][p.t.getHours()].push(p.v);
  }
  const out = {};
  for (const k of ['weekday', 'weekend']) out[k] = acc[k].some((a) => a.length) ? acc[k].map(mean) : null;
  return out;
}

/** Günstigste und teuerste Stunde eines Verlaufs (Array mit 24 Werten) */
export function extremeHours(arr) {
  if (!arr) return null;
  let lo = -1, hi = -1;
  arr.forEach((v, h) => {
    if (v == null) return;
    if (lo < 0 || v < arr[lo]) lo = h;
    if (hi < 0 || v > arr[hi]) hi = h;
  });
  return lo < 0 ? null : { cheap: { hour: lo, v: arr[lo] }, dear: { hour: hi, v: arr[hi] } };
}

/** Teppich: Stundenmittel je Kalendertag → {days: [Date], cells: [[tagIndex, stunde, wert]]} */
export function carpet(pts, from, to) {
  const days = [];
  for (let d = new Date(from.getFullYear(), from.getMonth(), from.getDate()); d < to; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) days.push(d);
  const idx = new Map(days.map((d, i) => [d.getTime(), i]));
  const acc = new Map();
  for (const p of pts) {
    if (p.v == null) continue;
    const di = idx.get(new Date(p.t.getFullYear(), p.t.getMonth(), p.t.getDate()).getTime());
    if (di == null) continue;
    const k = di * 24 + p.t.getHours();
    if (!acc.has(k)) acc.set(k, []);
    acc.get(k).push(p.v);
  }
  const cells = [...acc].map(([k, a]) => [Math.floor(k / 24), k % 24, mean(a)]);
  return { days, cells };
}

/**
 * Farbskala um den Durchschnitt: günstiger ↔ teurer. Die Spanne reicht vom 5. bis 95. Perzentil,
 * damit einzelne Ausreißer nicht alles andere blass machen. → {mid, lo, hi}
 */
export function scaleAround(values, minSpread = 0.5) {
  const v = values.filter((x) => x != null).sort((a, b) => a - b);
  if (!v.length) return { mid: 0, lo: -minSpread, hi: minSpread };
  const mid = mean(v);
  const q = (p) => v[Math.min(v.length - 1, Math.max(0, Math.round(p * (v.length - 1))))];
  const spread = Math.max(minSpread, q(0.95) - mid, mid - q(0.05));
  return { mid, lo: mid - spread, hi: mid + spread };
}
