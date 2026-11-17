// Zeiträume (lokale Zeit des Geräts, in Österreich also Europe/Vienna inkl. Sommerzeit)
import { MONTHS_LONG, MONTHS_SHORT, dateShort, dateLong, dateNum, dow } from './format.js';

export const DAY_MS = 86400000;

export const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1);
export const startOfWeek = (d) => addDays(startOfDay(d), -dow(d));
/** Anzahl Kalendertage zwischen zwei Tagesanfängen (DST-sicher) */
export const daysBetween = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / DAY_MS);

export function isoWeek(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t - yearStart) / DAY_MS + 1) / 7);
}

export const PERIOD_LABELS = { day: 'Tag', week: 'Woche', month: 'Monat', year: 'Jahr', total: 'Gesamt', custom: 'Zeitraum' };

/**
 * Liefert {kind, start, end (exklusiv), anchor}
 * custom: {from: Date, to: Date (inklusive Tag)}
 */
export function makePeriod(kind, anchor, opts = {}) {
  const a = startOfDay(anchor);
  switch (kind) {
    case 'day':
      return { kind, anchor: a, start: a, end: addDays(a, 1) };
    case 'week': {
      const s = startOfWeek(a);
      return { kind, anchor: a, start: s, end: addDays(s, 7) };
    }
    case 'month': {
      const s = new Date(a.getFullYear(), a.getMonth(), 1);
      return { kind, anchor: a, start: s, end: addMonths(s, 1) };
    }
    case 'year': {
      const s = new Date(a.getFullYear(), 0, 1);
      return { kind, anchor: a, start: s, end: new Date(a.getFullYear() + 1, 0, 1) };
    }
    case 'total': {
      const first = opts.firstDate || new Date(a.getFullYear() - 5, 0, 1);
      const s = new Date(first.getFullYear(), 0, 1);
      return { kind, anchor: a, start: s, end: new Date(new Date().getFullYear() + 1, 0, 1) };
    }
    case 'custom': {
      const from = startOfDay(opts.from || a);
      const to = startOfDay(opts.to || a);
      const [s, e] = from <= to ? [from, to] : [to, from];
      return { kind, anchor: s, start: s, end: addDays(e, 1) };
    }
    default:
      throw new Error('Unbekannter Zeitraum ' + kind);
  }
}

/** Verschiebt den Zeitraum um dir (−1/+1) Einheiten */
export function shiftPeriod(p, dir, opts = {}) {
  switch (p.kind) {
    case 'day': return makePeriod('day', addDays(p.anchor, dir));
    case 'week': return makePeriod('week', addDays(p.anchor, 7 * dir));
    case 'month': return makePeriod('month', new Date(p.anchor.getFullYear(), p.anchor.getMonth() + dir, 1));
    case 'year': return makePeriod('year', new Date(p.anchor.getFullYear() + dir, 0, 1));
    case 'custom': {
      const len = daysBetween(p.start, p.end);
      return makePeriod('custom', p.start, { from: addDays(p.start, dir * len), to: addDays(p.end, dir * len - 1) });
    }
    default: return p;
  }
}

/** Vergleichszeitraum: 'prev' = Vorperiode, 'yoy' = Vorjahr */
export function comparePeriod(p, mode) {
  if (p.kind === 'total' || !mode || mode === 'none') return null;
  if (mode === 'prev') return shiftPeriod(p, -1);
  // Vorjahr: Wochen um 52 Wochen (gleiche Wochentage), sonst Kalenderjahr
  switch (p.kind) {
    case 'day': return makePeriod('day', addDays(p.anchor, -364));
    case 'week': return makePeriod('week', addDays(p.anchor, -364));
    case 'month': return makePeriod('month', new Date(p.anchor.getFullYear() - 1, p.anchor.getMonth(), 1));
    case 'year': return makePeriod('year', new Date(p.anchor.getFullYear() - 1, 0, 1));
    case 'custom': {
      const from = new Date(p.start.getFullYear() - 1, p.start.getMonth(), p.start.getDate());
      const last = addDays(p.end, -1);
      const to = new Date(last.getFullYear() - 1, last.getMonth(), last.getDate());
      return makePeriod('custom', from, { from, to });
    }
    default: return null;
  }
}

export function periodTitle(p) {
  const last = addDays(p.end, -1);
  switch (p.kind) {
    case 'day': return dateLong(p.start);
    case 'week': {
      const sameMonth = p.start.getMonth() === last.getMonth();
      const range = sameMonth
        ? `${p.start.getDate()}.–${last.getDate()}. ${MONTHS_SHORT[last.getMonth()]}`
        : `${p.start.getDate()}. ${MONTHS_SHORT[p.start.getMonth()]} – ${last.getDate()}. ${MONTHS_SHORT[last.getMonth()]}`;
      return `KW ${isoWeek(p.start)}, ${range}`;
    }
    case 'month': return `${MONTHS_LONG[p.start.getMonth()]} ${p.start.getFullYear()}`;
    case 'year': return String(p.start.getFullYear());
    case 'total': return `${p.start.getFullYear()} – ${last.getFullYear()}`;
    case 'custom': return p.start.getFullYear() === last.getFullYear()
      ? `${dateShort(p.start)} – ${dateNum(last)}`
      : `${dateNum(p.start)} – ${dateNum(last)}`;
    default: return '';
  }
}

/** Kurzname für Vergleichs-Texte: „ggü. Oktober“ */
export function periodShortName(p) {
  switch (p.kind) {
    case 'day': return dateShort(p.start) + p.start.getFullYear();
    case 'week': return `KW ${isoWeek(p.start)}/${p.start.getFullYear()}`;
    case 'month': return `${MONTHS_LONG[p.start.getMonth()]} ${p.start.getFullYear()}`;
    case 'year': return String(p.start.getFullYear());
    default: return periodTitle(p);
  }
}

/** Auflösung, in der die Daten für die Hauptgrafik geladen werden */
export function resolutionFor(p) {
  const days = daysBetween(p.start, p.end);
  switch (p.kind) {
    case 'day':
    case 'week':
    case 'month':
      return 'original';
    case 'year':
      return 'daily';
    case 'total':
      return 'monthly';
    case 'custom':
      return days <= 93 ? 'original' : days <= 800 ? 'daily' : 'monthly';
    default:
      return 'daily';
  }
}

/** Wie die Hauptgrafik gruppiert: 'quarter' | 'day' | 'month' | 'year' */
export function chartBucketFor(p, res) {
  const days = daysBetween(p.start, p.end);
  if (p.kind === 'total') return 'year';
  if (p.kind === 'year') return 'month';
  if (res === 'original' && days <= 7) return 'quarter';
  if (days <= 93) return 'day';
  if (days <= 800) return 'month';
  return 'year';
}
