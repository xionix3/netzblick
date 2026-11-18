// Abrechnungsjahr: Smart-Meter-Messwerte mit den Abrechnungsdaten des Kundenportals verbinden
import { addDays, startOfDay, daysBetween } from './time.js';

const sumOf = (pts) => pts.reduce((a, p) => a + (p.v || 0), 0);

/**
 * Laufendes Abrechnungsjahr aus den Smart-Meter-Tageswerten.
 * Hochgerechnet mit dem Verlauf der 12 Monate davor (Winter zählt mehr als Sommer).
 * Die letzte Abrechnung kann kürzer als ein Jahr sein (Zwischenabrechnung); ihre Summe steht in lastSum.
 */
export async function billingYearStatus(store, mp, lastPeriod, now = new Date()) {
  const curStart = lastPeriod.to;
  const curEnd = new Date(curStart.getFullYear() + 1, curStart.getMonth(), curStart.getDate());
  const prevFrom = new Date(curStart.getFullYear() - 1, curStart.getMonth(), curStart.getDate());
  const today = startOfDay(now);
  if (curStart >= today) return null;
  const [cur, prev, last] = await Promise.all([
    store.load(mp, 'consumption', curStart, curEnd < today ? curEnd : addDays(today, 1), 'daily'),
    store.load(mp, 'consumption', prevFrom, curStart, 'daily'),
    store.load(mp, 'consumption', lastPeriod.from, lastPeriod.to, 'daily'),
  ]);
  const lastDays = daysBetween(lastPeriod.from, lastPeriod.to);
  const lastSum = sumOf(last.points) || null;
  const curPts = cur.points.filter((p) => p.v != null);
  if (!curPts.length) return { curStart, curEnd, sum: null, lastSum, lastDays };
  const lastT = curPts[curPts.length - 1].t;
  const upto = addDays(startOfDay(lastT), 1); // erster Tag ohne Werte
  const sum = sumOf(curPts);
  const covered = daysBetween(curStart, upto);
  const prevTotal = sumOf(prev.points);
  const prevCut = new Date(upto.getFullYear() - 1, upto.getMonth(), upto.getDate());
  const prevSame = sumOf(prev.points.filter((p) => p.t < prevCut));
  const prevComplete = prev.points.some((p) => p.v != null && p.t < addDays(prevFrom, 7));
  let projection = null, method = null;
  if (covered >= 14) {
    if (prevTotal > 0 && prevSame > 0 && prevComplete) {
      projection = sum * (prevTotal / prevSame);
      method = 'vorjahr';
    } else {
      projection = (sum / covered) * daysBetween(curStart, curEnd);
      method = 'linear';
    }
  }
  return { curStart, curEnd, upto, covered, sum, prevTotal: prevComplete && prevTotal ? prevTotal : null, prevSame: prevSame || null, projection, method, lastSum, lastDays };
}

/** Vertragskonto zu einem Zählpunkt finden (Adresse, sonst eindeutig) */
export function consumptionFor(kpData, pod) {
  const list = kpData ? kpData.consumption : [];
  if (!pod) return null;
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9äöüß]/g, '');
  const byAddr = list.filter((c) => c.description && norm(pod.address).startsWith(norm(c.description).slice(0, 12)));
  if (byAddr.length === 1) return byAddr[0];
  const byPeriod = list.filter((c) => c.periods.some((p) => p.label === pod.lastBillingPeriod));
  if (byPeriod.length === 1) return byPeriod[0];
  return list.length === 1 ? list[0] : null;
}

