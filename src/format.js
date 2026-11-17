// Zahlen- und Datumsformatierung (österreichische Schreibweise: 1.067,7 kWh)
const LOCALE = 'de-DE'; // de-DE liefert den in AT üblichen Tausenderpunkt

const nfCache = new Map();
function nf(min, max) {
  const key = min + ':' + max;
  if (!nfCache.has(key)) {
    nfCache.set(key, new Intl.NumberFormat(LOCALE, { minimumFractionDigits: min, maximumFractionDigits: max }));
  }
  return nfCache.get(key);
}

/** Zahl mit sinnvoller Genauigkeit je nach Größe */
export function num(v, digits) {
  if (v == null || !isFinite(v)) return '–';
  if (digits != null) return nf(digits, digits).format(v);
  const a = Math.abs(v);
  if (a >= 1000) return nf(0, 0).format(v);
  if (a >= 100) return nf(0, 1).format(v);
  if (a >= 10) return nf(1, 1).format(v);
  return nf(1, 2).format(v);
}

export const kwh = (v) => `${num(v)} kWh`;
export const kw = (v) => `${num(v, v != null && Math.abs(v) < 10 ? 2 : 1)} kW`;
export const watt = (kwValue) => (kwValue == null ? '–' : `${nf(0, 0).format(kwValue * 1000)} W`);
export const euro = (v) => (v == null || !isFinite(v) ? '–' : `${nf(2, 2).format(v)} €`);
export const pct = (v, digits = 0) => (v == null || !isFinite(v) ? '–' : `${nf(digits, digits).format(v * 100)} %`);
export const signedPct = (v) => {
  if (v == null || !isFinite(v)) return '–';
  const s = nf(0, 0).format(Math.abs(v * 100));
  return `${v > 0 ? '+' : v < 0 ? '−' : '±'}${s} %`;
};

export const WEEKDAYS_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
export const WEEKDAYS_LONG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
export const MONTHS_LONG = ['Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
export const MONTHS_SHORT = ['Jän', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

const pad = (n) => String(n).padStart(2, '0');
/** Montag = 0 … Sonntag = 6 */
export const dow = (d) => (d.getDay() + 6) % 7;
export const time = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const dateShort = (d) => `${d.getDate()}.${d.getMonth() + 1}.`;
export const dateNum = (d) => `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
export const dateLong = (d) => `${WEEKDAYS_SHORT[dow(d)]}, ${d.getDate()}. ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
export const dateTime = (d) => `${dateLong(d)}, ${time(d)}`;
export const monthYear = (d) => `${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
export const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
