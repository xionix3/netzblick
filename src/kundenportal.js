// Client für das Kundenportal von Netz Burgenland (portal.netzburgenland.at)
// Ermittelt aus dem Web-Portal, Stand 11/2026.
//
//  Anmeldung: AWS Cognito (derselbe Benutzerpool wie das Smart-Meter-Portal).
//    Der Smart-Meter-Login liefert bereits `cognitoToken.idToken` → damit funktioniert auch dieses Portal.
//    Ausweichweg: POST /papi/auth/signin {email, password} → {idToken, accessToken, refreshToken, expireIn}
//  Header: Authorization: <idToken>   (ohne „Bearer“; nur für /api/-Pfade)
//  GET /api/profile                                   Profil
//  GET /api/profile/customer-nr/{nr}/pods             Zählpunkte mit Adresse
//  GET /api/profile/customer-nr/{nr}/pods-data        Zählpunkte mit Zähler, Netzebene, Lieferant, Energiegemeinschaft
//  GET /api/profile/customer-nr/{nr}/consumption-premise   abgerechnete Jahresverbräuche je Vertragskonto
//  GET /api/contracts?customerNr={nr}                 Verträge
//  GET /api/contracts/{ca}/bills                      Rechnungen (nicht bei externem Rechnungssteller)
//  GET /api/contracts/{ca}/part-payment-plan?customerNr={nr}   Teilbeträge
//  GET /api/profile/link/customers                    verknüpfte Kundennummern

import { ApiError } from './api.js';

export const KP_BASE = 'https://api.portal.netzburgenland.at';

/** Kundennummer aus dem Cognito-Token lesen (Claim „custom:customerNr“) */
export function tokenClaims(idToken) {
  try {
    const part = String(idToken).replace(/^Bearer\s+/i, '').split('.')[1];
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
    const json = decodeURIComponent(Array.from(atob(b64), (c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/** Tokens aus unterschiedlich verpackten Antworten herausholen */
export function extractTokens(body) {
  if (!body || typeof body !== 'object') return null;
  for (const c of [body, body.data, body.tokens, body.token, body.data && body.data.tokens, body.cognitoToken, body.data && body.data.cognitoToken]) {
    if (c && typeof c === 'object' && typeof c.idToken === 'string' && c.idToken) return c;
  }
  return null;
}

export class KundenportalApi {
  /** @param http async ({method,url,headers,data}) => {status, data} */
  constructor(http) {
    this.http = http;
    this.idToken = null;
    this.customerNr = null;
    this.credentials = null; // nur wenn eigene Zugangsdaten verwendet werden
    this.tokenProvider = null; // async () => frisches idToken (z. B. über den Smart-Meter-Login)
    this.source = null; // 'smartmeter' | 'eigene'
  }

  setToken(idToken, source = 'smartmeter') {
    const claims = tokenClaims(idToken);
    this.idToken = idToken;
    this.customerNr = (claims && claims['custom:customerNr']) || this.customerNr;
    this.source = source;
    return !!claims;
  }

  get connected() {
    return !!this.idToken;
  }

  async login(email, password) {
    let res;
    try {
      res = await this.http({ method: 'POST', url: KP_BASE + '/papi/auth/signin', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, data: { email: email.trim(), password } });
    } catch {
      throw new ApiError('NETWORK', 'Keine Verbindung zum Kundenportal. Prüfe die Internetverbindung.');
    }
    const tokens = extractTokens(res.data);
    if (res.status >= 200 && res.status < 300 && tokens) {
      this.setToken(tokens.idToken, 'eigene');
      this.credentials = { email, password };
      return this.customerNr;
    }
    const msg = res.data && (res.data.message || res.data.errorCode) || '';
    if (res.status === 401 || res.status === 400 || /password|credential|NotAuthorized/i.test(msg)) {
      throw new ApiError('INVALID_CREDENTIALS', 'E-Mail oder Passwort für das Kundenportal stimmt nicht.', res.status);
    }
    if (res.data && (res.data.challengeName || res.data.session)) {
      throw new ApiError('KP_CHALLENGE', 'Das Kundenportal verlangt einen zusätzlichen Schritt (z. B. neues Passwort). Bitte einmal im Web-Portal anmelden.', res.status);
    }
    throw new ApiError('SERVER', `Das Kundenportal hat mit Fehler ${res.status} geantwortet.`, res.status);
  }

  async refresh() {
    if (this.tokenProvider) {
      const t = await this.tokenProvider();
      if (t) { this.setToken(t, 'smartmeter'); return; }
    }
    if (this.credentials) {
      await this.login(this.credentials.email, this.credentials.password);
      return;
    }
    throw new ApiError('AUTH_EXPIRED', 'Die Verbindung zum Kundenportal ist abgelaufen.', 401);
  }

  async get(path, query = {}, retried = false) {
    if (!this.idToken) throw new ApiError('KP_NOT_CONNECTED', 'Nicht mit dem Kundenportal verbunden.');
    const qs = Object.entries(query).filter(([, v]) => v != null).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
    let res;
    try {
      res = await this.http({ method: 'GET', url: KP_BASE + path + (qs ? '?' + qs : ''), headers: { Authorization: this.idToken, Accept: 'application/json' } });
    } catch {
      throw new ApiError('NETWORK', 'Keine Verbindung zum Kundenportal. Prüfe die Internetverbindung.');
    }
    if ((res.status === 401 || res.status === 403) && !retried) {
      await this.refresh();
      return this.get(path, query, true);
    }
    let data = res.data;
    if (typeof data === 'string') { try { data = JSON.parse(data); } catch { /* Text */ } }
    if (res.status >= 400) {
      const code = data && data.errorCode;
      throw new ApiError(code || (res.status === 401 ? 'AUTH_EXPIRED' : 'SERVER'), (data && data.message) || `Fehler ${res.status}`, res.status);
    }
    return data;
  }

  nr() {
    if (!this.customerNr) throw new ApiError('KP_NO_CUSTOMER', 'Keine Kundennummer im Kundenportal hinterlegt.');
    return this.customerNr;
  }

  profile() { return this.get('/api/profile'); }
  pods() { return this.get(`/api/profile/customer-nr/${this.nr()}/pods`); }
  podsData() { return this.get(`/api/profile/customer-nr/${this.nr()}/pods-data`, { start: 0, limit: 50 }); }
  consumption() { return this.get(`/api/profile/customer-nr/${this.nr()}/consumption-premise`); }
  contracts() { return this.get('/api/contracts', { customerNr: this.nr() }); }
  linkedCustomers() { return this.get('/api/profile/link/customers'); }

  /** Rechnungen; bei externem Rechnungssteller → {external: true} */
  async bills(contractAccount) {
    try {
      const b = await this.get(`/api/contracts/${contractAccount}/bills`);
      return { bills: normalizeBills(b), external: false };
    } catch (e) {
      if (e.code === 'ErrCodeExternalServiceProvider') return { bills: [], external: true };
      throw e;
    }
  }

  async partPayments(contractAccount) {
    try {
      return normalizePartPayments(await this.get(`/api/contracts/${contractAccount}/part-payment-plan`, { customerNr: this.nr() }));
    } catch (e) {
      if (e.code === 'ErrCodeExternalServiceProvider') return { external: true, installments: [], advance: [] };
      throw e;
    }
  }

  /** Alles für die Ansichten „Anlagen“, „Abrechnung“ und „Konto“ in einem Rutsch */
  async loadAll() {
    const settle = (p) => p.then((v) => ({ ok: true, v }), (e) => ({ ok: false, e }));
    const [profile, pods, podsData, consumption, contracts, links] = await Promise.all([
      settle(this.profile()), settle(this.pods()), settle(this.podsData()), settle(this.consumption()), settle(this.contracts()), settle(this.linkedCustomers()),
    ]);
    const firstError = [profile, pods, podsData, consumption, contracts].find((x) => !x.ok);
    if (firstError && !profile.ok && !podsData.ok) throw firstError.e; // gar nichts geladen
    const contractList = contracts.ok ? normalizeContracts(contracts.v) : [];
    const active = contractList.filter((c) => c.active);
    const billing = await Promise.all(active.map(async (c) => {
      const [b, p] = await Promise.all([settle(this.bills(c.nr)), settle(this.partPayments(c.nr))]);
      return { contract: c, bills: b.ok ? b.v : { bills: [], external: false, error: b.e && b.e.message }, partPayments: p.ok ? p.v : null };
    }));
    return {
      profile: profile.ok ? normalizeProfile(profile.v) : null,
      pods: normalizePods(pods.ok ? pods.v : [], podsData.ok ? podsData.v : []),
      consumption: consumption.ok ? normalizeConsumption(consumption.v, contractList) : [],
      contracts: contractList,
      billing,
      linkedCustomers: links.ok && links.v && Array.isArray(links.v.linkedCustomers) ? links.v.linkedCustomers.map((l) => ({ customerNr: l.customerNr, pod: l.pointOfDelivery, status: l.status })) : [],
      loadedAt: new Date(),
      errors: [profile, pods, podsData, consumption, contracts].filter((x) => !x.ok).map((x) => x.e.message),
    };
  }
}

/* ------------------------------------------------------------ Normalisierung */

const DEVICE_TYPES = { IME: 'Smart Meter (intelligentes Messgerät)', IMS: 'Smart Meter', DZ: 'Drehstromzähler', WSZ: 'Wechselstromzähler' };
const LOAD_PROFILES = { H0: 'Haushalt (H0)', G0: 'Gewerbe allgemein (G0)', L0: 'Landwirtschaft (L0)', HA: 'Heizung/Wärmepumpe' };
const GRANULARITY = { QH: 'Viertelstundenwerte', D: 'Tageswerte', DD: 'Tageswerte', M: 'Monatswerte' };

export function normalizeProfile(p) {
  if (!p) return null;
  const a = p.address || {};
  return {
    name: [p.titlePrefix, p.firstName, p.lastName, p.titlePostfix].filter(Boolean).join(' ') || p.orgName || '',
    email: p.email || (p.contact && p.contact.email) || '',
    customerNr: p.customerNr || '',
    address: [[a.strasse, [a.hausnum1, a.hausnum2].filter(Boolean).join('/')].filter(Boolean).join(' '), [a.plz, a.ort].filter(Boolean).join(' ')].filter(Boolean).join(', '),
    eCorrespondence: !!(p.contact && p.contact.electronicCorrespondence),
  };
}

export function normalizePods(pods = [], podsData = []) {
  const byId = new Map();
  for (const p of Array.isArray(pods) ? pods : []) {
    byId.set(p.extUI, { id: p.extUI, address: p.premiseAddress || '', utility: p.utilityType, granularity: GRANULARITY[p.granularityCustomer] || p.granularityCustomer || '', feeder: !!p.electricityFeeder });
  }
  for (const d of Array.isArray(podsData) ? podsData : []) {
    const e = byId.get(d.extUI) || { id: d.extUI, address: '' };
    const net = d.net || {};
    const ecs = ((d.approvals && d.approvals.active) || []).filter((x) => x.energyCommunity || /EnergyCommunity/i.test(x.dataType || ''));
    const ec = ecs[0] && ecs[0].energyCommunity;
    const hist = Array.isArray(d.participationHistory) ? d.participationHistory : [];
    Object.assign(e, {
      contractFrom: d.contractDateFrom ? new Date(d.contractDateFrom) : null,
      supplier: (d.details || '').split('/').slice(1).join('/').trim() || d.details || '',
      supplierId: (d.details || '').split('/')[0].trim(),
      meterNr: net.serialNr || '',
      deviceType: DEVICE_TYPES[net.deviceType] || net.deviceType || '',
      gridLevel: net.gridUsageLevel != null ? Number(net.gridUsageLevel) : null,
      loadProfile: LOAD_PROFILES[net.loadProfileType] || net.loadProfileType || '',
      lastBillingPeriod: net.lastBillingPeriod || '',
      energyCommunity: ec ? {
        share: ec.share != null ? Number(ec.share) : null,
        factor: ec.factor != null ? Number(ec.factor) : null,
        type: ec.type || '',
        direction: ec.direction || '',
        since: hist.length ? new Date(hist.map((h) => h.dateFrom).filter(Boolean).sort()[0]) : null,
      } : null,
    });
    byId.set(d.extUI, e);
  }
  return [...byId.values()].filter((p) => p.id);
}

export function normalizeContracts(list = []) {
  return (Array.isArray(list) ? list : []).map((k) => ({
    nr: k.nr,
    description: k.description || '',
    active: !!k.isActive,
    invoicedBy: k.invoiceServiceProvider || '',
    externalInvoicing: !!k.extInvoicingServProv,
    kinds: [k.electricity && 'Strom', k.naturalGas && 'Gas', k.warmth && 'Wärme', k.eMobility && 'E-Mobilität', k.electricityFeeder && 'Einspeisung'].filter(Boolean),
    eBilling: !!k.eBilling,
  }));
}

/** Abgerechnete Jahresverbräuche je Vertragskonto (nur Strom, kWh) */
export function normalizeConsumption(c, contracts = []) {
  const premises = (c && Array.isArray(c.premises)) ? c.premises : [];
  const out = [];
  for (const p of premises) {
    const contract = contracts.find((k) => k.nr === p.contractAccount);
    for (const u of p.utilities || []) {
      const years = (u.years || []).map((y) => ({ year: Number(y.year), kwh: Number(y.totalDiff) || 0 })).filter((y) => y.year);
      const periods = (u.periods || []).map((x) => ({ label: x.zeitraum || '', kwh: Number(x.diff) || 0 }));
      if (!years.length && !periods.length) continue;
      out.push({ contractAccount: p.contractAccount, description: contract ? contract.description : '', active: contract ? contract.active : null, utility: u.utilityType, years: years.sort((a, b) => a.year - b.year), periods });
    }
  }
  return out;
}

export function normalizeBills(list = []) {
  return (Array.isArray(list) ? list : []).map((b) => ({
    nr: b.billNr,
    from: b.dateFrom ? new Date(b.dateFrom) : null,
    to: b.dateTo ? new Date(b.dateTo) : null,
    amount: b.amount != null ? Number(b.amount) : null,
    currency: b.amountCurr || 'EUR',
    kinds: [b.electricity && 'Strom', b.naturalGas && 'Gas', b.warmth && 'Wärme', b.eMobility && 'E-Mobilität', b.service && 'Service'].filter(Boolean),
  })).sort((a, b) => (b.to || 0) - (a.to || 0));
}

export function normalizePartPayments(p) {
  const map = (x) => ({
    due: x.dueDate ? new Date(x.dueDate) : null,
    settled: x.settlementDate ? new Date(x.settlementDate) : null,
    amount: x.amount != null ? Number(x.amount) : null,
    open: x.amountOpen != null ? Number(x.amountOpen) : null,
    status: x.balancingStatus || '',
  });
  return {
    external: false,
    installments: ((p && p.installment) || []).map(map).sort((a, b) => (a.due || 0) - (b.due || 0)),
    advance: ((p && p.advancePayment) || []).map(map).sort((a, b) => (a.due || 0) - (b.due || 0)),
  };
}

/** Text „Oktober 2025 bis September 2026“ → {from, to (exklusiv)} */
const MONTHS = ['jänner', 'februar', 'märz', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'dezember'];
export function parseBillingPeriod(text) {
  if (!text) return null;
  const m = String(text).toLowerCase().replace('januar', 'jänner').match(/([a-zäöü]+)\s+(\d{4})\s+bis\s+([a-zäöü]+)\s+(\d{4})/);
  if (!m) return null;
  const a = MONTHS.indexOf(m[1]);
  const b = MONTHS.indexOf(m[3]);
  if (a < 0 || b < 0) return null;
  return { from: new Date(Number(m[2]), a, 1), to: new Date(Number(m[4]), b + 1, 1) };
}
