// Client für die (inoffizielle) API des Netz-Burgenland-Verbrauchsdatenportals
// (IDSpecto enVIEW von VIVAVIS). Ermittelt aus dem Web-Portal, Stand 11/2026.
//
//  POST api/account/login            {usernameOrEMail, password, rememberMe}
//       → {success, data:{linkedAccounts:[{identifier, displayName, token:"Bearer …",
//          operModesAtMeterPts:[{meteringPointIdentifier, category, address, valueIdentifiers:[…]}]}],
//          cognitoToken}, message, mustChangePassword}
//  GET  api/{type}/values/normal     ?meteringPointIdentifier&valueIdentifier&from&to&name&timeParameter
//       timeParameter: original | daily | monthly | yearly
//       → [{name, valueIdentifier, data:[{startTimestamp, endTimestamp, value, reading, status}]}]
//  GET  api/maxPower/{type}          ?meteringPointIdentifier&valueIdentifier&name&from&to
//       → {value (kW), startTimestamp, endTimestamp, status}
//  Header: Authorization: <token aus linkedAccounts>  (gültig ca. 60 min)

export const API_BASE = 'https://smartmeter.netzburgenland.at/enVIEW/enVIEW.Portal.Api/';

export class ApiError extends Error {
  constructor(code, message, status) {
    super(message || code);
    this.code = code; // INVALID_CREDENTIALS | MUST_CHANGE_PASSWORD | NETWORK | AUTH_EXPIRED | SERVER | NO_METER
    this.status = status;
  }
}

function parseLoginError(status, body) {
  if (body && body.mustChangePassword) {
    return new ApiError('MUST_CHANGE_PASSWORD', 'Netz Burgenland verlangt ein neues Passwort.', status);
  }
  let inner = null;
  if (body && typeof body.message === 'string') {
    try { inner = JSON.parse(body.message); } catch { inner = { message: body.message }; }
  }
  const code = inner && inner.errorCode;
  if (code === 'ErrCodeUserPasswordInvalid' || (inner && inner.status === 401)) {
    return new ApiError('INVALID_CREDENTIALS', 'Benutzername oder Passwort stimmt nicht.', status);
  }
  if (status >= 500) return new ApiError('SERVER', 'Das Portal antwortet gerade nicht. Versuch es in ein paar Minuten noch einmal.', status);
  return new ApiError('LOGIN_FAILED', (inner && inner.message) || 'Anmeldung fehlgeschlagen.', status);
}

/** ISO-Zeitpunkt in UTC („…Z“) – vom Server zuverlässig akzeptiert, ohne „+“-Kodierungsprobleme */
export const isoUtc = (d) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');

export class PortalApi {
  /** @param http async ({method,url,headers,data}) => {status, data} */
  constructor(http) {
    this.http = http;
    this.accounts = [];
    this.credentials = null;
    this.reloginPromise = null;
  }

  async login(username, password) {
    let res;
    try {
      res = await this.http({
        method: 'POST',
        url: API_BASE + 'api/account/login',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        data: { usernameOrEMail: username.trim(), password: password.trim(), rememberMe: false },
      });
    } catch (e) {
      throw new ApiError('NETWORK', 'Keine Verbindung zum Portal. Prüfe die Internetverbindung.');
    }
    const body = res.data;
    const ok = res.status >= 200 && res.status < 300 && body && body.success !== false && body.data;
    if (!ok) throw parseLoginError(res.status, body);
    const accounts = body.data.linkedAccounts || [];
    if (!accounts.length) throw new ApiError('NO_METER', 'Zu diesem Zugang sind keine Zählpunkte hinterlegt.');
    this.accounts = accounts;
    this.credentials = { username, password };
    return accounts;
  }

  /** Übernimmt eine bestehende Sitzung (z. B. Token aus dem Portal) */
  useAccounts(accounts) {
    this.accounts = accounts;
  }

  tokenFor(accountId) {
    const acc = this.accounts.find((a) => a.identifier === accountId) || this.accounts[0];
    return acc && acc.token;
  }

  async relogin() {
    if (!this.credentials) throw new ApiError('AUTH_EXPIRED', 'Sitzung abgelaufen. Bitte neu anmelden.', 401);
    if (!this.reloginPromise) {
      const { username, password } = this.credentials;
      this.reloginPromise = this.login(username, password).finally(() => { this.reloginPromise = null; });
    }
    await this.reloginPromise;
  }

  async get(path, params, accountId, retried = false) {
    const qs = Object.entries(params)
      .filter(([, v]) => v != null)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join('&');
    let res;
    try {
      res = await this.http({
        method: 'GET',
        url: `${API_BASE}${path}?${qs}`,
        headers: { Authorization: this.tokenFor(accountId), Accept: 'application/json' },
      });
    } catch (e) {
      throw new ApiError('NETWORK', 'Keine Verbindung zum Portal. Prüfe die Internetverbindung.');
    }
    if ((res.status === 401 || res.status === 403) && !retried) {
      await this.relogin();
      return this.get(path, params, accountId, true);
    }
    if (res.status === 401 || res.status === 403) throw new ApiError('AUTH_EXPIRED', 'Sitzung abgelaufen. Bitte neu anmelden.', res.status);
    if (res.status >= 400) throw new ApiError('SERVER', `Das Portal hat mit Fehler ${res.status} geantwortet.`, res.status);
    let data = res.data;
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch { /* leer */ }
    }
    return data;
  }

  /** Messreihe laden → [{t: Date, v: number|null, s: string}] */
  async series({ accountId, meterPointId, valueId, type, from, to, timeParameter }) {
    const data = await this.get(`api/${type || 'MeterReadingSequence'}/values/normal`, {
      meteringPointIdentifier: meterPointId,
      valueIdentifier: valueId,
      from: isoUtc(from),
      to: isoUtc(to),
      name: 'Verbrauch',
      timeParameter,
    }, accountId);
    const s = Array.isArray(data) ? data[0] : null;
    if (!s || !Array.isArray(s.data)) return [];
    return s.data.map((d) => ({
      t: new Date(d.startTimestamp),
      v: d.value == null ? null : +d.value,
      s: d.status || 'W',
      r: d.reading == null ? null : +d.reading, // Zählerstand am Ende des Intervalls
    }));
  }

  /** Höchste Viertelstunden-Leistung im Zeitraum → {kw, t} */
  async maxPower({ accountId, meterPointId, valueId, type, from, to }) {
    const d = await this.get(`api/maxPower/${type || 'MeterReadingSequence'}`, {
      meteringPointIdentifier: meterPointId,
      valueIdentifier: valueId,
      name: valueId,
      from: isoUtc(from),
      to: isoUtc(to),
    }, accountId);
    if (!d || d.value == null) return null;
    return { kw: +d.value, t: new Date(d.startTimestamp), s: d.status };
  }
}
