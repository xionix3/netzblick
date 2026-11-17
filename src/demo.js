// Demo-Modus: simuliert die Portal-API mit erfundenen, aber realistischen Daten.
// Antworten haben exakt das Format der echten API, damit derselbe Code durchlaufen wird.
import { API_BASE } from './api.js';
import { KP_BASE } from './kundenportal.js';

const Q = 15 * 60 * 1000;
const Q15_START = new Date(2023, 5, 21);
const H24_START = new Date(2019, 0, 1);

const METERS = [
  { id: 'AT0090000000000000000000000012345', kind: 'house' },
  { id: 'AT0090000000000000000000000054321', kind: 'heatpump' },
];

function valueIds() {
  return [
    { identifier: '1-0:1.8.0*H15', type: 'MeterReadingSequence', unit: 'kWh', cumulative: true, isActiveEnergy: true, measuringIntervalSeconds: 900, startTimestamp: Q15_START.toISOString(), endTimestamp: '2100-01-01T00:00:00.000Z' },
    { identifier: '1-0:1.8.1*H24', type: 'MeterReadingSequence', unit: 'kWh', cumulative: true, isActiveEnergy: true, measuringIntervalSeconds: 86400, startTimestamp: H24_START.toISOString(), endTimestamp: '2100-01-01T00:00:00.000Z' },
    { identifier: '1-0:1.8.2*H24', type: 'MeterReadingSequence', unit: 'kWh', cumulative: true, isActiveEnergy: true, measuringIntervalSeconds: 86400, startTimestamp: H24_START.toISOString(), endTimestamp: '2100-01-01T00:00:00.000Z' },
  ];
}

const ACCOUNT = {
  identifier: 'DEMO',
  email: '',
  salutation: '',
  displayName: 'Demo-Haushalt',
  token: 'Bearer demo',
  operModesAtMeterPts: METERS.map((m) => ({
    legend: 'Verbrauch',
    meteringPointIdentifier: m.id,
    meteringPointDisplayName: m.id,
    category: 'Consumption',
    address: { street: 'Musterweg', houseNumber: m.kind === 'house' ? '12' : '12a', postalCode: '7000', city: 'Eisenstadt' },
    valueIdentifiers: valueIds(),
  })),
};

// deterministisches Rauschen
function rnd(a, b = 0) {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return ((h >>> 0) % 100000) / 100000;
}
const dayIndex = (d) => Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
const bump = (h, from, to, kw) => (h >= from && h < to ? kw : 0);

/** Leistung in kW für einen Zählpunkt zu einem Zeitpunkt */
function power(kind, t) {
  const d = new Date(t);
  const h = d.getHours() + d.getMinutes() / 60;
  const di = dayIndex(d);
  const wd = (d.getDay() + 6) % 7;
  const weekend = wd >= 5;
  const doy = (d - new Date(d.getFullYear(), 0, 1)) / 86400000;
  const cold = Math.max(0, Math.cos((2 * Math.PI * (doy - 15)) / 365)); // 1 im Jänner, 0 im Sommer
  const q = Math.floor(t / Q);
  const n = rnd(q, kind === 'house' ? 1 : 2);
  if (kind === 'heatpump') {
    if (cold < 0.08) return 0.03 + (h > 17 && h < 18.5 ? 1.1 : 0) * (rnd(di, 9) > 0.3 ? 1 : 0); // nur Warmwasser
    const duty = Math.min(0.95, cold * 0.8 + (h < 6 || h > 21 ? 0.15 : 0));
    const on = rnd(Math.floor(t / (Q * 2)), 5) < duty;
    return 0.04 + (on ? 1.2 + cold * 1.6 + n * 0.3 : 0);
  }
  let kw = 0.16 + 0.05 * n + 0.08 * cold; // Grundlast
  kw += bump(h, 6.25, 7.75, weekend ? 0 : 0.9 + n * 0.6);
  kw += bump(h, 8, 10, weekend ? 0.8 + n * 0.5 : 0);
  kw += bump(h, 11.5, 13, weekend ? 2.1 * n + 0.6 : 0.15);
  kw += bump(h, 17, 22.5, 0.7 + 0.9 * n + 0.4 * cold);
  if (h >= 18 && h < 19 && rnd(di, 3) > 0.35) kw += 2.4 * n; // Kochen
  if (rnd(di, 4) > 0.72 && h >= 9 && h < 10.75) kw += 1.9; // Waschmaschine
  if (rnd(di, 6) > 0.7 && (h >= 23 || h < 3)) kw += 3.6; // E-Auto laden
  return kw;
}

function statusFor(kind, t) {
  const d = new Date(t);
  const di = dayIndex(d);
  return rnd(di, kind === 'house' ? 11 : 12) > 0.985 && d.getHours() >= 2 && d.getHours() < 5 ? 'E' : 'W';
}

const LAG = 30 * 3600 * 1000; // Daten kommen ca. einen Tag verzögert

function quarterValues(kind, from, to) {
  const out = [];
  const now = Date.now() - LAG;
  for (let t = Math.ceil(from.getTime() / Q) * Q; t < to.getTime(); t += Q) {
    const future = t >= now;
    out.push({ t, v: future ? null : power(kind, t) / 4, s: future ? 'F' : statusFor(kind, t) });
  }
  return out;
}

const bucketStart = {
  daily: (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()),
  monthly: (d) => new Date(d.getFullYear(), d.getMonth(), 1),
  yearly: (d) => new Date(d.getFullYear(), 0, 1),
};

function aggregate(vals, tp) {
  const map = new Map();
  for (const x of vals) {
    const k = bucketStart[tp](new Date(x.t)).getTime();
    const e = map.get(k) || { v: null, s: 'W' };
    if (x.v != null) e.v = (e.v || 0) + x.v;
    if (x.s === 'E') e.s = 'E';
    map.set(k, e);
  }
  return [...map.entries()].map(([t, e]) => ({ t, v: e.v, s: e.s }));
}

function toResponse(vid, vals, intervalMs) {
  return [{
    name: 'Verbrauch', deviceExceptionStatus: null, isBasePrice: false, valueIdentifier: vid, isEmpty: vals.length === 0,
    data: vals.map((x) => ({
      startTimestamp: new Date(x.t).toISOString(),
      endTimestamp: new Date(x.t + intervalMs).toISOString(),
      value: x.v, reading: x.r ?? null, powerValue: null, price: null, emission: null, status: x.s, readingStatus: null,
    })),
  }];
}

function readingAt(kind, t) {
  // grober, aber monotoner Zählerstand
  const base = kind === 'house' ? 41250 : 12680;
  const days = (t - H24_START.getTime()) / 86400000;
  return base + days * (kind === 'house' ? 11.2 : 5.1);
}

function handleValues(url) {
  const u = new URL(url);
  const p = u.searchParams;
  const meter = METERS.find((m) => m.id === p.get('meteringPointIdentifier'));
  if (!meter) return { status: 400, data: { message: 'unknown meter' } };
  const vid = p.get('valueIdentifier');
  let from = new Date(p.get('from'));
  const to = new Date(p.get('to'));
  const tp = p.get('timeParameter');
  if (isNaN(from) || isNaN(to)) return { status: 500, data: '' };
  if (vid.endsWith('1.8.2*H24')) return { status: 200, data: [] }; // Eintarif-Zähler: Tarif 2 leer
  const isQ15 = vid.endsWith('*H15');
  const minStart = isQ15 ? Q15_START : H24_START;
  if (from < minStart) from = minStart;
  if (from >= to) return { status: 200, data: [] };
  const vals = quarterValues(meter.kind, from, to);
  if (isQ15 && tp === 'original') {
    let r = readingAt(meter.kind, from.getTime());
    for (const x of vals) {
      if (x.v != null) { r += x.v; x.r = Math.round(r * 1000) / 1000; }
    }
    return { status: 200, data: toResponse(vid, vals, Q) };
  }
  const agg = aggregate(vals, tp === 'original' ? 'daily' : tp);
  return { status: 200, data: toResponse(vid, agg, 86400000) };
}

function handleMaxPower(url) {
  const u = new URL(url);
  const p = u.searchParams;
  const meter = METERS.find((m) => m.id === p.get('meteringPointIdentifier'));
  const from = new Date(p.get('from'));
  const to = new Date(p.get('to'));
  let best = null;
  for (const x of quarterValues(meter.kind, from, to)) {
    if (x.v != null && (!best || x.v > best.v)) best = x;
  }
  if (!best) return { status: 200, data: { value: null } };
  return { status: 200, data: { value: best.v * 4, startTimestamp: new Date(best.t).toISOString(), endTimestamp: new Date(best.t + Q).toISOString(), status: 'W', legend: '1-0:1.8.0*H15' } };
}

/* ------------------------------------------------------------ Kundenportal (Demo) */

const b64url = (o) => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const DEMO_CUSTOMER = '1000000001';
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const DEMO_JWT = `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url({ 'custom:customerNr': DEMO_CUSTOMER, email: 'demo@example.at', exp: 4102444800 })}.demo`;

const CONTRACTS = [
  { nr: '200000000001', meter: METERS[0], description: 'Musterweg 12, 7000 Eisenstadt', external: false },
  { nr: '200000000002', meter: METERS[1], description: 'Musterweg 12a, 7000 Eisenstadt', external: true },
];

// Abrechnungsjahre Oktober bis September, aus denselben erfundenen Messwerten berechnet
let billedCache = null;
function billedYears() {
  if (billedCache) return billedCache;
  billedCache = new Map();
  const lastEnd = new Date(new Date().getFullYear() - (new Date().getMonth() >= 9 ? 0 : 1), 9, 1);
  for (const c of CONTRACTS) {
    const years = [];
    for (let y = 0; y < 5; y++) {
      const to = new Date(lastEnd.getFullYear() - y, 9, 1);
      const from = new Date(to.getFullYear() - 1, 9, 1);
      if (from < H24_START) break;
      let sum = 0;
      for (let t = from.getTime(); t < to.getTime(); t += Q * 4) sum += power(c.meter.kind, t);
      years.push({ year: String(to.getFullYear()), from, to, kwh: Math.round(sum) });
    }
    billedCache.set(c.nr, years.reverse());
  }
  return billedCache;
}
const MONTH_NAMES = ['Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const periodText = (from, to) => `${MONTH_NAMES[from.getMonth()]} ${from.getFullYear()} bis ${MONTH_NAMES[(to.getMonth() + 11) % 12]} ${new Date(to.getTime() - 86400000).getFullYear()}`;

function handleKp(method, path, data) {
  if (method === 'POST' && path === '/papi/auth/signin') {
    if (data && data.password === 'falsch') return { status: 401, data: { errorCode: 'NotAuthorizedException', message: 'Incorrect username or password.' } };
    return { status: 200, data: { idToken: DEMO_JWT, accessToken: 'demo', refreshToken: 'demo', expireIn: 3600 } };
  }
  const base = `/api/profile/customer-nr/${DEMO_CUSTOMER}`;
  const years = billedYears();
  if (path === '/api/profile') {
    return { status: 200, data: { customerNr: DEMO_CUSTOMER, firstName: 'Demo', lastName: 'Haushalt', email: 'demo@example.at', address: { strasse: 'Musterweg', hausnum1: '12', plz: '7000', ort: 'Eisenstadt' }, contact: { email: 'demo@example.at', electronicCorrespondence: true } } };
  }
  if (path === '/api/profile/link/customers') return { status: 200, data: { linkedCustomers: [] } };
  if (path === base + '/pods') {
    return { status: 200, data: CONTRACTS.map((c) => ({ extUI: c.meter.id, premiseAddress: c.description, utilityType: 'electricity', granularityCustomer: 'QH', electricityFeeder: false })) };
  }
  if (path === base + '/pods-data') {
    return {
      status: 200,
      data: CONTRACTS.map((c, i) => {
        const y = years.get(c.nr);
        const last = y[y.length - 1];
        return {
          extUI: c.meter.id,
          contractDateFrom: i === 0 ? '2016-04-01' : '2021-09-15',
          details: 'AT000000/Musterstrom GmbH',
          net: { serialNr: i === 0 ? '1KFM0200012345' : '1KFM0200054321', deviceType: 'IME', gridUsageLevel: '7', loadProfileType: i === 0 ? 'H0' : 'HA', lastBillingPeriod: periodText(last.from, last.to) },
          approvals: { active: i === 0 ? [{ dataType: 'EnergyCommunity', energyCommunity: { share: '50', factor: '1', type: 'Erneuerbare-Energie-Gemeinschaft', direction: 'consumption' } }] : [] },
          participationHistory: i === 0 ? [{ dateFrom: '2024-03-01' }] : [],
        };
      }),
    };
  }
  if (path === base + '/consumption-premise') {
    return {
      status: 200,
      data: {
        premises: CONTRACTS.map((c) => ({
          contractAccount: c.nr,
          utilities: [{ utilityType: 'electricity', years: years.get(c.nr).map((y) => ({ year: y.year, totalDiff: String(y.kwh) })), periods: years.get(c.nr).map((y) => ({ zeitraum: periodText(y.from, y.to), diff: String(y.kwh) })) }],
        })),
      },
    };
  }
  if (path === '/api/contracts') {
    return { status: 200, data: CONTRACTS.map((c) => ({ nr: c.nr, description: c.description, isActive: true, electricity: true, invoiceServiceProvider: c.external ? 'Musterstrom GmbH' : 'Netz Burgenland', extInvoicingServProv: c.external, eBilling: true })) };
  }
  const m = path.match(/^\/api\/contracts\/(\d+)\/(bills|part-payment-plan)$/);
  if (m) {
    const c = CONTRACTS.find((x) => x.nr === m[1]);
    if (!c) return { status: 404, data: { message: 'not found' } };
    if (c.external) return { status: 400, data: { errorCode: 'ErrCodeExternalServiceProvider', message: 'Rechnung über externen Dienstleister' } };
    if (m[2] === 'bills') {
      return { status: 200, data: years.get(c.nr).slice(-3).map((y, i) => ({ billNr: `9100000${i + 1}`, dateFrom: ymd(y.from), dateTo: ymd(new Date(y.to - 86400000)), amount: Math.round((y.kwh * 0.118 + 162) * 100) / 100, amountCurr: 'EUR', electricity: true })) };
    }
    const start = new Date(new Date().getFullYear() - (new Date().getMonth() >= 9 ? 0 : 1), 9, 15);
    return {
      status: 200,
      data: {
        installment: Array.from({ length: 12 }, (_, i) => {
          const due = new Date(start.getFullYear(), start.getMonth() + i, 15);
          const paid = due < new Date();
          return { dueDate: ymd(due), settlementDate: paid ? ymd(due) : null, amount: '185.00', amountOpen: paid ? '0.00' : '185.00', balancingStatus: paid ? 'ausgeglichen' : 'offen' };
        }),
        advancePayment: [],
      },
    };
  }
  return { status: 404, data: { message: 'not found' } };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Ersatz für http() im Demo-Modus */
export async function demoHttp({ method = 'GET', url, data }) {
  await wait(120 + Math.random() * 260);
  if (url.startsWith(KP_BASE)) return handleKp(method, url.slice(KP_BASE.length).split('?')[0], data);
  const path = url.replace(API_BASE, '').split('?')[0];
  if (method === 'POST' && path === 'api/account/login') {
    if (data && data.password === 'falsch') {
      return { status: 400, data: { data: null, success: false, message: JSON.stringify({ status: 401, errorCode: 'ErrCodeUserPasswordInvalid', message: 'failed email/password invalid' }), mustChangePassword: false } };
    }
    return { status: 200, data: { success: true, message: null, mustChangePassword: false, data: { linkedAccounts: [ACCOUNT], cognitoToken: { idToken: DEMO_JWT, refreshToken: 'demo', expireIn: 3600 } } } };
  }
  if (/\/values\/(normal|basePrice)$/.test(path)) return handleValues(url);
  if (path.startsWith('api/maxPower/')) return handleMaxPower(url);
  return { status: 404, data: '' };
}
