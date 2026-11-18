// Netzblick – App-Steuerung: Start, Anmeldung, Menü, Verbrauchsansicht
import { PortalApi, ApiError } from './api.js';
import { KundenportalApi, extractTokens } from './kundenportal.js';
import {
  DataStore, meterPointsFrom, meterLabel, compactId, firstDataDate, loadView, mergeSum, applyFilters, filtersActive, hourFilterActive,
  DEFAULT_FILTERS, bucketAxis, seriesOnAxis, computeStats, likeForLikeCut, forecast, dailyProfile, carpet, weekdayAverages,
  monthsByYear, dailyTotals, STATUS_LABEL, splitByDayPart, splitByWeekpart, splitByMeter, normalizeSelection,
} from './model.js';
import { makePeriod, shiftPeriod, periodTitle, periodShortName, daysBetween, addDays, startOfDay } from './time.js';
import { num, kwh, kw, watt, euro, pct, dateLong, dateTime, dateShort, time, isoDate, WEEKDAYS_SHORT, MONTHS_LONG } from './format.js';
import * as charts from './charts.js';
import { icons } from './icons.js';
import { http, secure, loadSettings, saveSettings, shareCsv, onBack, onResume, setSystemBars } from './platform.js';
import { demoHttp } from './demo.js';
import { cacheClear } from './cache.js';
import { $, h, icon, fillIcons, reduceMotion, setCounter, countUp, openSheet, closeSheet, toast, brandMark, spinBrand } from './ui.js';
import * as pages from './pages.js';
import { parseBillingPeriod } from './kundenportal.js';

// Web-Vorschau (ohne native Schicht): nur Demo-Daten möglich, da der Browser die Portal-API blockiert
const PREVIEW = (document.querySelector('meta[name="netzblick-mode"]') || {}).content === 'demo-preview';
/* global __APP_VERSION__ */
const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';
const PARAMS = new URLSearchParams(location.search);

/* ================================================================ Zustand */
const state = {
  api: null,
  store: null,
  demo: false,
  accounts: [],
  mps: [],
  selected: [],
  flow: 'consumption',
  period: makePeriod('month', new Date()),
  filters: JSON.parse(JSON.stringify(DEFAULT_FILTERS)),
  settings: loadSettings(),
  view: null,
  loading: false,
  loadSeq: 0,
  error: null,
  readings: new Map(),
  page: 'usage',
  kp: null,
  kpCreds: null, // eigene Kundenportal-Zugangsdaten (nur im Speicher, wenn nicht „angemeldet bleiben“)
  kpData: null,
  kpError: null,
  kpPromise: null,
};
if (!state.settings.chartTypes) state.settings.chartTypes = {};

/* ================================================================ Thema */
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  const t = state.settings.theme;
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
  const dark = t === 'dark' || (t === 'system' && darkQuery.matches);
  setSystemBars(dark);
  if (state.view) renderAll();
  if (state.page !== 'usage') renderPage();
}
darkQuery.addEventListener?.('change', applyTheme);

/* ================================================================ Marken-Intro */
const intro = { started: 0, minMs: 0 };
function startIntro() {
  const mark = brandMark('xl');
  $('bootMark').append(mark);
  spinBrand(mark, ['0', '0', '0'], false);
  const skip = PARAMS.has('demo') || reduceMotion();
  intro.started = performance.now();
  intro.minMs = skip ? 0 : 1250;
  if (skip) { spinBrand(mark, ['1', '8', '0'], false); $('boot').classList.add('play', 'instant'); return; }
  requestAnimationFrame(() => requestAnimationFrame(() => {
    $('boot').classList.add('play');
    spinBrand(mark, ['1', '8', '0']);
  }));
}
function hideBoot() {
  const boot = $('boot');
  if (boot.hidden || boot.dataset.leaving) return;
  boot.dataset.leaving = '1';
  const wait = Math.max(0, intro.minMs - (performance.now() - intro.started));
  setTimeout(() => {
    boot.classList.add('out');
    setTimeout(() => { boot.hidden = true; }, reduceMotion() ? 0 : 320);
  }, wait);
}

/* ================================================================ Anmeldung */
function showLogin(message) {
  hideBoot();
  closeNav();
  $('dash').hidden = true;
  $('login').hidden = false;
  if (!$('loginMark').firstChild) {
    const m = brandMark('lg');
    $('loginMark').append(m);
    spinBrand(m, ['1', '8', '0'], false);
  }
  if (PREVIEW) {
    // Vorschau: keine Eingabefelder für Zugangsdaten, nur der Demo-Einstieg
    $('loginForm').querySelectorAll('.field, .switch, #loginBtn, .kp-extra').forEach((el) => { el.hidden = true; });
    message = 'Web-Vorschau mit Beispieldaten. Die Anmeldung mit deinem Netz-Burgenland-Zugang gibt es in der Android-App.';
    $('loginError').classList.add('is-info');
  }
  const err = $('loginError');
  if (message) { err.textContent = message; err.hidden = false; } else err.hidden = true;
}

async function doLogin(username, password, { remember, demo = false, silent = false, kp = null } = {}) {
  state.demo = demo;
  state.api = new PortalApi(demo ? demoHttp : http);
  const accounts = await state.api.login(username, password);
  state.accounts = accounts;
  state.store = new DataStore(state.api);
  if (!demo) {
    if (remember) {
      await secure.set('username', username).catch(() => {});
      await secure.set('password', password).catch(() => {});
    } else if (!silent) {
      await secure.remove('username').catch(() => {});
      await secure.remove('password').catch(() => {});
    }
    if (kp && kp.email && kp.password) {
      state.settings.kundenportal = 'own';
      saveSettings(state.settings);
      state.kpCreds = kp;
      if (remember) {
        await secure.set('kpUser', kp.email).catch(() => {});
        await secure.set('kpPass', kp.password).catch(() => {});
      }
    }
    // Zählpunkt-Liste (ohne Token) für den Offline-Start merken
    try {
      const meta = accounts.map((a) => ({ ...a, token: null }));
      localStorage.setItem('nb.accounts', JSON.stringify(meta));
    } catch { /* */ }
  }
  enterDashboard();
}

function bindLogin() {
  $('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const u = $('user').value.trim();
    const p = $('pass').value;
    const err = $('loginError');
    if (!u || !p) {
      err.textContent = 'Bitte Benutzername und Passwort eingeben.';
      err.hidden = false;
      return;
    }
    if (PREVIEW) {
      err.textContent = 'In dieser Web-Vorschau gibt es nur Beispieldaten. Die echte Anmeldung funktioniert in der Android-App.';
      err.hidden = false;
      return;
    }
    const kpEmail = $('kpUser').value.trim();
    const kpPass = $('kpPass').value;
    const btn = $('loginBtn');
    btn.disabled = true;
    btn.textContent = 'Anmelden …';
    err.hidden = true;
    try {
      await doLogin(u, p, { remember: $('remember').checked, kp: kpEmail && kpPass ? { email: kpEmail, password: kpPass } : null });
    } catch (ex) {
      err.textContent = ex instanceof ApiError ? ex.message : 'Anmeldung fehlgeschlagen. Versuch es noch einmal.';
      if (ex.code === 'MUST_CHANGE_PASSWORD') err.textContent += ' Ändere es im Portal von Netz Burgenland und melde dich dann hier an.';
      err.hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Anmelden';
    }
  });
  $('demoBtn').addEventListener('click', () => doLogin('demo', 'demo', { demo: true }).catch((e) => showLogin(e.message)));
}

async function logout() {
  closeSheet();
  closeNav();
  for (const k of ['username', 'password', 'kpUser', 'kpPass']) await secure.remove(k).catch(() => {});
  try { localStorage.removeItem('nb.accounts'); } catch { /* */ }
  cacheClear();
  Object.assign(state, { api: null, view: null, kp: null, kpData: null, kpError: null, kpCreds: null, page: 'usage' });
  state.readings.clear();
  $('pass').value = '';
  $('kpPass').value = '';
  showLogin();
}

/* ================================================================ Kundenportal */
function cognitoIdToken(api) {
  const c = api && api.cognito;
  if (!c) return null;
  if (typeof c === 'string') return c;
  const t = extractTokens({ cognitoToken: c });
  return t ? t.idToken : null;
}

async function setupKp() {
  const mode = state.settings.kundenportal;
  if (mode === 'off' || !state.api) { state.kp = null; return null; }
  const kp = new KundenportalApi(state.demo ? demoHttp : http);
  if (mode === 'own') {
    let creds = state.kpCreds;
    if (!creds && !state.demo) {
      const email = await secure.get('kpUser').catch(() => null);
      const password = await secure.get('kpPass').catch(() => null);
      if (email && password) creds = { email, password };
    }
    if (!creds) {
      state.kp = kp;
      throw new ApiError('KP_NO_CREDENTIALS', 'Für das Kundenportal sind eigene Zugangsdaten eingestellt, aber keine gespeichert. Trag sie unter „Konto“ ein.');
    }
    state.kp = kp;
    await kp.login(creds.email, creds.password);
  } else {
    const t = cognitoIdToken(state.api);
    if (t) kp.setToken(t, 'smartmeter');
    kp.tokenProvider = async () => { await state.api.relogin(); return cognitoIdToken(state.api); };
    state.kp = kp;
    if (!t) throw new ApiError('KP_NO_TOKEN', 'Die Smart-Meter-Anmeldung hat keinen Zugang zum Kundenportal geliefert. Trag unter „Konto“ eigene Zugangsdaten ein.');
  }
  return kp;
}

/** Daten aus dem Kundenportal laden (einmal pro Sitzung, außer force) */
function ensureKp({ force = false } = {}) {
  if (state.settings.kundenportal === 'off' || !state.api) return Promise.resolve(null);
  if (state.kpData && !force) return Promise.resolve(state.kpData);
  if (state.kpPromise) return state.kpPromise;
  state.kpPromise = (async () => {
    if (!state.kp || !state.kp.connected || force) await setupKp();
    const data = await state.kp.loadAll();
    state.kpData = data;
    state.kpError = null;
    return data;
  })().catch((e) => {
    state.kpError = e;
    throw e;
  }).finally(() => {
    state.kpPromise = null;
    if (state.mps.length) { renderHeader(); }
    if (state.page !== 'usage') renderPage();
  });
  return state.kpPromise;
}

/** Zusatzinfos eines Zählpunkts aus dem Kundenportal */
function podFor(id) {
  return state.kpData ? state.kpData.pods.find((p) => p.id === id) || null : null;
}

/* ================================================================ Menü */
const NAV = [
  { id: 'usage', label: 'Verbrauch', icon: 'chart' },
  { id: 'plants', label: 'Anlagen', icon: 'plant' },
  { id: 'billing', label: 'Abrechnung', icon: 'receipt' },
  { id: 'account', label: 'Konto', icon: 'user' },
  { id: 'settings', label: 'Einstellungen', icon: 'settings', sheet: true },
  { id: 'info', label: 'Info', icon: 'info' },
];
let navMark = null;

function buildNav() {
  const nav = $('nav');
  nav.textContent = '';
  navMark = brandMark('sm');
  spinBrand(navMark, ['1', '8', '0'], false);
  nav.append(
    h('div', { class: 'nav-brand' }, navMark,
      h('div', { class: 'nav-brand-text' }, h('span', { class: 'nav-name', text: 'Netzblick' }), h('span', { class: 'nav-by', text: 'von geister-it' }))),
    h('ul', { class: 'nav-list', role: 'list' }, ...NAV.map((it) => h('li', {},
      h('button', {
        type: 'button', class: 'nav-item', 'data-nav': it.id,
        onclick: () => { if (it.sheet) { closeNav(); openSettings(); } else goto(it.id); },
      }, icon(it.icon), h('span', { text: it.label }))))),
    h('div', { class: 'nav-foot' },
      h('p', { class: 'nav-user', id: 'navUser' }),
      h('button', { type: 'button', class: 'nav-item nav-item--quiet', onclick: logout }, icon('logout'), h('span', { id: 'navLogout', text: 'Abmelden' })),
      h('p', { class: 'nav-version', text: `Version ${APP_VERSION}` })),
  );
  syncNav();
}

function syncNav() {
  document.querySelectorAll('.nav-item[data-nav]').forEach((b) => {
    const on = b.dataset.nav === state.page;
    b.classList.toggle('on', on);
    if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  const acc = state.accounts[0];
  const u = $('navUser');
  if (u) u.textContent = state.demo ? 'Demo mit Beispieldaten' : acc ? `Angemeldet als ${acc.displayName || acc.email || ''}` : '';
  const lo = $('navLogout');
  if (lo) lo.textContent = state.demo ? 'Demo beenden' : 'Abmelden';
}

const navPermanent = () => window.matchMedia('(min-width: 1024px) and (min-height: 560px)').matches;
function openNav() {
  if (navPermanent()) return;
  const nav = $('nav');
  $('navScrim').hidden = false;
  requestAnimationFrame(() => { nav.classList.add('open'); $('navScrim').classList.add('open'); });
  if (navMark) { spinBrand(navMark, ['0', '0', '0'], false); requestAnimationFrame(() => requestAnimationFrame(() => spinBrand(navMark, ['1', '8', '0']))); }
}
function closeNav() {
  const nav = $('nav');
  if (!nav || !nav.classList.contains('open')) return false;
  nav.classList.remove('open');
  $('navScrim').classList.remove('open');
  setTimeout(() => { $('navScrim').hidden = true; }, 220);
  return true;
}

const PAGE_TITLES = { plants: 'Anlagen', billing: 'Abrechnung', account: 'Konto', info: 'Info' };
function goto(page) {
  closeNav();
  if (state.page === page && page !== 'usage') { renderPage(); return; }
  state.page = page;
  syncNav();
  const usage = page === 'usage';
  $('pageUsage').hidden = !usage;
  $('pageOther').hidden = usage;
  window.scrollTo(0, 0);
  if (usage) {
    if (state.view) renderAll();
    return;
  }
  $('pageTitle').textContent = PAGE_TITLES[page] || '';
  $('pageRefresh').hidden = page === 'info';
  renderPage();
  if (page === 'plants' || page === 'billing' || page === 'account') ensureKp().catch(() => {});
}

function pageCtx() {
  return {
    state, APP_VERSION, PREVIEW,
    names: state.settings.meterNames,
    meterColor, podFor, ensureKp, setupKp, logout, goto, openSettings, toast, renderPage,
    showUsage: (ids, period) => {
      if (ids) { state.selected = normalizeSelection(ids, state.mps); saveSelection(); }
      if (period) state.period = period;
      if (!availableFlows().includes(state.flow)) state.flow = availableFlows()[0] || 'consumption';
      goto('usage');
      renderHeader();
      renderControls();
      refresh();
    },
    saveSettings: () => saveSettings(state.settings),
  };
}

function renderPage() {
  if (state.page === 'usage') return;
  const body = $('pageBody');
  body.querySelectorAll('.chart').forEach((c) => charts.dispose(c));
  body.textContent = '';
  const ctx = pageCtx();
  const fn = { plants: pages.renderPlants, billing: pages.renderBilling, account: pages.renderAccount, info: pages.renderInfo }[state.page];
  if (fn) fn(body, ctx);
  fillIcons(body);
}

/* ================================================================ Auswahl der Zählpunkte */
function saveSelection() {
  try { localStorage.setItem('nb.selection', JSON.stringify(state.selected)); } catch { /* */ }
}
function loadSelection() {
  try {
    const raw = localStorage.getItem('nb.selection');
    if (raw) return JSON.parse(raw);
    const old = localStorage.getItem('nb.selected'); // Version 1.0
    if (old) return old;
  } catch { /* */ }
  return 'all';
}
function selectedMps() {
  return state.mps.filter((m) => state.selected.includes(m.id));
}
function viewMps() {
  return selectedMps().filter((m) => m.flows[state.flow]);
}
function availableFlows() {
  const set = new Set();
  for (const mp of selectedMps()) Object.keys(mp.flows).forEach((f) => set.add(f));
  return ['consumption', 'feedin'].filter((f) => set.has(f));
}
/** Farbe folgt dem Zählpunkt, nicht seiner Position in der Auswahl */
function meterColor(mp) {
  const T = charts.tokens();
  const i = state.mps.findIndex((m) => m.id === mp.id);
  return i >= 0 && i < T.s.length ? T.s[i] : T.older;
}
function setSelection(ids) {
  state.selected = normalizeSelection(ids, state.mps);
  saveSelection();
  if (!availableFlows().includes(state.flow)) state.flow = availableFlows()[0] || 'consumption';
  renderHeader();
  renderChips();
  refresh();
}
function toggleMeter(id) {
  const on = state.selected.includes(id);
  if (on && state.selected.length === 1) { toast('Mindestens ein Zählpunkt bleibt ausgewählt.'); return; }
  setSelection(on ? state.selected.filter((x) => x !== id) : [...state.selected, id]);
}

/* ================================================================ Übersicht */
function enterDashboard() {
  state.mps = meterPointsFrom(state.accounts);
  state.selected = normalizeSelection(loadSelection(), state.mps);
  if (!availableFlows().includes(state.flow)) state.flow = availableFlows()[0] || 'consumption';
  hideBoot();
  $('login').hidden = true;
  $('dash').hidden = false;
  buildNav();
  goto('usage');
  renderHeader();
  renderControls();
  refresh();
  loadReadings();
  ensureKp().catch(() => {}); // Zusatzinfos im Hintergrund
  showWhatsNew();
}

/** Einmal pro Version zeigen, was neu ist (nicht in Demo-Links und Web-Vorschau) */
function showWhatsNew() {
  if (PREVIEW || PARAMS.has('demo') || APP_VERSION === 'dev') return;
  const major = APP_VERSION.split('.').slice(0, 2).join('.');
  try { if (localStorage.getItem('nb.seenVersion') === major) return; localStorage.setItem('nb.seenVersion', major); } catch { return; }
  const items = [
    ['menu', 'Menü über ☰ oben links oder vom linken Rand wischen: Anlagen, Abrechnung, Konto, Info und Abmelden.'],
    ['meter', 'Mehrere Zählpunkte: oben auf den Namen tippen und ankreuzen, oder im Diagramm die Legende antippen.'],
    ['pie', 'Diagrammart wählen: Balken, Linien, Fläche oder Kreis, über die Symbole rechts über dem Diagramm.'],
    ['receipt', 'Daten aus dem Kundenportal: Seiten „Anlagen“ und „Abrechnung“. Andere Zugangsdaten trägst du unter „Konto“ ein.'],
  ];
  const body = h('div', { class: 'whatsnew' },
    h('ul', { class: 'whatsnew-list', role: 'list' }, ...items.map(([ic, text]) => h('li', {}, icon(ic), h('span', { text })))),
    h('div', { class: 'sheet-actions' },
      h('button', { class: 'btn btn--ghost', type: 'button', onclick: () => closeSheet() }, 'Später'),
      h('button', { class: 'btn btn--primary', type: 'button', onclick: () => { closeSheet(); setTimeout(openNav, 240); } }, 'Menü öffnen')));
  setTimeout(() => openSheet(`Neu in Netzblick ${major}`, body), 700);
}

async function loadReadings() {
  for (const mp of state.mps) {
    state.store.latestReading(mp, 'consumption').then((r) => {
      if (r) { state.readings.set(mp.id, r); renderReading(true); }
    });
  }
}

function renderHeader() {
  const mps = selectedMps();
  const names = state.settings.meterNames;
  const demo = state.demo ? ', Demo' : '';
  if (mps.length > 1) {
    const all = mps.length === state.mps.length;
    $('meterName').textContent = all ? 'Alle Zählpunkte' : `${mps.length} von ${state.mps.length} Zählpunkten`;
    $('meterSub').textContent = all ? `${state.mps.length} Zählpunkte, zusammengezählt${demo}` : mps.map((m) => meterLabel(m, names, { compact: true })).join(', ');
  } else {
    const mp = mps[0];
    if (!mp) { $('meterName').textContent = 'Kein Zählpunkt'; $('meterSub').textContent = ''; }
    else {
      const pod = podFor(mp.id);
      const custom = !!names[mp.id];
      $('meterName').textContent = meterLabel(mp, names, { compact: !custom });
      const a = mp.address;
      const where = pod && pod.address ? pod.address : a && a.street ? `${a.street} ${a.houseNumber || ''}, ${a.city || ''}`.trim() : '';
      const parts = [custom ? compactId(mp.id) : null, where, pod && pod.meterNr ? `Zähler ${pod.meterNr}` : null].filter(Boolean);
      $('meterSub').textContent = (parts.join(', ') || mp.id) + demo;
    }
  }
  renderReading(false);
  syncNav();
}

function renderReading(animate) {
  const box = $('readingBox');
  const mps = selectedMps();
  if (mps.length !== 1) { box.hidden = true; return; }
  const r = state.readings.get(mps[0].id);
  if (!r) { box.hidden = true; return; }
  box.hidden = false;
  setCounter($('counter'), r.reading, { animate });
  $('readingTime').textContent = `Stand ${dateShort(r.t)}, ${time(r.t)} Uhr`;
}

function renderControls() {
  document.querySelectorAll('#periodTabs button').forEach((b) => {
    const on = b.dataset.kind === state.period.kind;
    b.setAttribute('aria-selected', on ? 'true' : 'false');
    b.classList.toggle('on', on);
  });
  $('periodTitle').textContent = periodTitle(state.period);
  const p = state.period;
  const canShift = p.kind !== 'total';
  $('prevBtn').disabled = !canShift;
  $('nextBtn').disabled = !canShift || shiftPeriod(p, 1).start > new Date();
  renderChips();
}

function renderChips() {
  const c = $('chips');
  c.textContent = '';
  const cmpLabel = { prev: 'Vorperiode', yoy: 'Vorjahr', none: 'aus' }[state.settings.compareMode];
  if (state.period.kind !== 'total') {
    c.append(h('button', { class: 'chip', type: 'button', onclick: openCompareSheet }, icon('compare'), `Vergleich: ${cmpLabel}`));
  }
  const flows = availableFlows();
  if (flows.length > 1) {
    c.append(h('button', {
      class: 'chip', type: 'button',
      onclick: () => { state.flow = state.flow === 'consumption' ? 'feedin' : 'consumption'; renderChips(); refresh(); },
    }, state.flow === 'consumption' ? 'Bezug' : 'Einspeisung'));
  }
  const f = state.filters;
  const active = filtersActive(f);
  c.append(h('button', { class: 'chip' + (active ? ' chip--on' : ''), type: 'button', onclick: openFilterSheet }, icon('filter'), active ? 'Filter' : 'Filtern'));
  if (state.mps.length > 1 && state.selected.length < state.mps.length) {
    c.append(h('button', {
      class: 'chip chip--active', type: 'button', 'aria-label': 'Alle Zählpunkte anzeigen',
      onclick: () => setSelection(state.mps.map((m) => m.id)),
    }, `${state.selected.length} von ${state.mps.length} Zählpunkten`, icon('close')));
  }
  if (f.weekdays.some((x) => !x)) {
    c.append(h('button', {
      class: 'chip chip--active', type: 'button', 'aria-label': 'Wochentag-Filter entfernen',
      onclick: () => { state.filters.weekdays = [true, true, true, true, true, true, true]; renderChips(); renderAll(); },
    }, weekdayLabel(f.weekdays), icon('close')));
  }
  if (hourFilterActive(f)) {
    c.append(h('button', {
      class: 'chip chip--active', type: 'button', 'aria-label': 'Tageszeit-Filter entfernen',
      onclick: () => { state.filters.hours = [0, 24]; renderChips(); renderAll(); },
    }, `${f.hours[0]}–${f.hours[1]} Uhr`, icon('close')));
  }
}

function weekdayLabel(w) {
  const on = w.map((x, i) => (x ? i : -1)).filter((i) => i >= 0);
  if (on.length === 5 && on.join() === '0,1,2,3,4') return 'Werktage';
  if (on.length === 2 && on.join() === '5,6') return 'Wochenende';
  const parts = [];
  let start = null;
  for (let i = 0; i <= 7; i++) {
    if (w[i] && start == null) start = i;
    if ((!w[i] || i === 7) && start != null) {
      const end = i - 1;
      parts.push(end - start >= 2 ? `${WEEKDAYS_SHORT[start]}–${WEEKDAYS_SHORT[end]}` : WEEKDAYS_SHORT.slice(start, end + 1).join(', '));
      start = null;
    }
  }
  return parts.join(', ');
}

/* ================================================================ Laden */
async function refresh({ force = false } = {}) {
  const seq = ++state.loadSeq;
  state.loading = true;
  document.body.classList.add('is-loading');
  $('banner').hidden = true;
  try {
    const first = firstDataDate(state.mps, state.flow);
    if (state.period.kind === 'total') {
      state.period = makePeriod('total', new Date(), { firstDate: first || undefined });
      renderControls();
    }
    const view = await loadView(state.store, {
      mps: viewMps(),
      flow: state.flow,
      period: state.period,
      compareMode: state.settings.compareMode,
    }, { force });
    if (seq !== state.loadSeq) return;
    state.view = view;
    state.error = null;
    renderAll();
    if (view.stale) showBanner('Keine Verbindung zum Portal. Angezeigt werden gespeicherte Werte.', false);
  } catch (e) {
    if (seq !== state.loadSeq) return;
    state.error = e;
    if (e.code === 'AUTH_EXPIRED') {
      showLogin('Sitzung abgelaufen. Bitte neu anmelden.');
      return;
    }
    showBanner(e instanceof ApiError ? e.message : 'Die Daten konnten nicht geladen werden.', true);
  } finally {
    if (seq === state.loadSeq) {
      state.loading = false;
      document.body.classList.remove('is-loading');
    }
  }
}

function showBanner(msg, retry) {
  const b = $('banner');
  b.textContent = '';
  b.append(icon('warn'), h('span', { text: msg }));
  if (retry) b.append(h('button', { class: 'btn btn--small', type: 'button', onclick: () => refresh({ force: true }) }, 'Erneut laden'));
  b.hidden = false;
}

/* ================================================================ Darstellung */
function derive() {
  const v = state.view;
  const f = state.filters;
  const names = state.settings.meterNames;
  const per = v.perMp.map((x) => ({
    mp: x.mp,
    name: meterLabel(x.mp, names, { compact: true }),
    color: meterColor(x.mp),
    cur: applyFilters(x.cur.points, f, x.cur.fine),
    cmp: x.cmp ? applyFilters(x.cmp.points, f, x.cmp.fine) : null,
    peak: x.peak,
  }));
  const combined = per.length === 1 ? per[0].cur : mergeSum(per.map((x) => x.cur));
  const combinedCmpRaw = v.comparePeriod && per.length && per.every((x) => x.cmp) ? (per.length === 1 ? per[0].cmp : mergeSum(per.map((x) => x.cmp))) : null;
  const res = v.fine ? 'original' : v.res === 'original' ? 'daily' : v.res;
  const stats = computeStats(combined, res);
  const cut = combinedCmpRaw ? likeForLikeCut(v.period, v.comparePeriod, combined, v.fine) : null;
  const cmpForDelta = combinedCmpRaw ? (cut ? combinedCmpRaw.filter((p) => p.t < cut) : combinedCmpRaw) : null;
  const cmpStats = cmpForDelta ? computeStats(cmpForDelta, res) : null;
  return { v, per, combined, combinedCmpRaw, res, stats, cut, cmpStats };
}

function renderAll() {
  if (!state.view) return;
  const d = derive();
  renderHero(d);
  renderMain(d);
  renderKpis(d);
  renderAnalysis(d);
  renderTable(d);
  renderFoot(d);
}

function costOf(kwhValue, days) {
  const s = state.settings;
  if (s.pricePerKwh == null || kwhValue == null) return null;
  return kwhValue * s.pricePerKwh + (s.feePerMonth || 0) * (days / 30.437);
}

function renderHero(d) {
  const { v, stats, cmpStats, cut } = d;
  const flowWord = state.flow === 'feedin' ? 'Einspeisung' : 'Verbrauch';
  const filtered = filtersActive(state.filters);
  $('heroLabel').textContent = `${flowWord}${filtered ? ' (gefiltert)' : ''}, ${periodTitle(v.period)}`;
  countUp($('heroValue'), stats.total, (x) => num(x, stats.total >= 100 ? 0 : 1));

  const delta = $('heroDelta');
  delta.textContent = '';
  if (cmpStats && cmpStats.total && stats.total != null) {
    const ch = (stats.total - cmpStats.total) / cmpStats.total;
    const more = ch > 0.005, less = ch < -0.005;
    const good = state.flow === 'feedin' ? more : less;
    const word = more ? 'mehr als' : less ? 'weniger als' : 'gleich viel wie';
    delta.append(
      h('span', { class: 'delta-ic ' + (more || less ? (good ? 'is-good' : 'is-bad') : ''), html: more ? icons.up : less ? icons.downArrow : '' }),
      h('span', { class: 'delta-text' }, more || less ? h('b', { text: pct(Math.abs(ch)) }) : null, `${more || less ? ' ' : ''}${word} ${periodShortName(v.comparePeriod)}`),
    );
    if (cut) delta.append(h('span', { class: 'delta-sub', text: `bis zum gleichen Zeitpunkt (${num(cmpStats.total)} kWh)` }));
    else delta.append(h('span', { class: 'delta-sub', text: `${num(cmpStats.total)} kWh` }));
  } else if (v.comparePeriod && stats.total != null) {
    delta.append(h('span', { class: 'delta-sub', text: `Keine Vergleichswerte für ${periodShortName(v.comparePeriod)}` }));
  }

  const extra = $('heroExtra');
  extra.textContent = '';
  const fc = filtered ? null : forecast(v.period, stats);
  if (fc) extra.append(h('div', { class: 'pill' }, h('span', { text: 'Hochrechnung' }), h('b', { text: kwh(fc) })));
  const days = stats.days || 0;
  const cost = costOf(stats.total, filtered ? 0 : days);
  if (cost != null) {
    extra.append(h('div', { class: 'pill' }, h('span', { text: filtered ? 'Energiekosten' : 'Kosten ca.' }), h('b', { text: euro(cost) })));
    if (fc) {
      const fcCost = costOf(fc, daysBetween(v.period.start, v.period.end));
      extra.append(h('div', { class: 'pill' }, h('span', { text: 'Kosten hochgerechnet' }), h('b', { text: euro(fcCost) })));
    }
  } else if (state.flow === 'consumption') {
    extra.append(h('button', { class: 'pill pill--link', type: 'button', onclick: openSettings }, 'Strompreis eintragen, um Kosten zu sehen'));
  }
}

/* ---------- Diagrammart */
const TYPES = [
  { id: 'bar', label: 'Balken', icon: 'bars' },
  { id: 'line', label: 'Linien', icon: 'line' },
  { id: 'area', label: 'Fläche', icon: 'area' },
  { id: 'pie', label: 'Kreis (Aufteilung)', icon: 'pie' },
];

function splitOptions(d) {
  const { v, per, stats } = d;
  const opts = [];
  if (per.length > 1) opts.push({ id: 'meter', label: 'Zählpunkte' });
  if (v.fine) opts.push({ id: 'daypart', label: 'Tageszeit' });
  if ((v.fine || v.res === 'daily') && (stats.days || 0) >= 2) opts.push({ id: 'weekpart', label: 'Wochentage' });
  return opts;
}

function chartTypeFor(d) {
  const bucket = d.v.bucket;
  let t = state.settings.chartTypes[bucket] || charts.autoChartType(bucket);
  if (t === 'pie' && !splitOptions(d).length) t = charts.autoChartType(bucket);
  return t;
}

function renderTypeSeg(d, current) {
  const seg = $('typeSeg');
  seg.textContent = '';
  const canPie = splitOptions(d).length > 0;
  for (const t of TYPES) {
    if (t.id === 'pie' && !canPie) continue;
    seg.append(h('button', {
      type: 'button', class: current === t.id ? 'on' : '', 'aria-pressed': current === t.id ? 'true' : 'false', 'aria-label': t.label, title: t.label,
      onclick: () => {
        state.settings.chartTypes[d.v.bucket] = t.id;
        saveSettings(state.settings);
        renderMain(derive());
      },
    }, icon(t.icon)));
  }
}

function renderMainLegend(d, type, compareName) {
  const el = $('mainLegend');
  el.textContent = '';
  const T = charts.tokens();
  const names = state.settings.meterNames;
  const kind = type === 'bar' ? 'bar' : type === 'pie' ? 'bar' : 'line';
  const candidates = state.mps.filter((m) => m.flows[state.flow]);
  if (candidates.length > 1) {
    for (const mp of candidates) {
      const on = state.selected.includes(mp.id);
      el.append(h('button', {
        type: 'button', class: 'lg lg--btn' + (on ? '' : ' is-off'), 'aria-pressed': on ? 'true' : 'false',
        title: on ? 'Zählpunkt ausblenden' : 'Zählpunkt einblenden', onclick: () => toggleMeter(mp.id),
      }, h('span', { class: 'lg-key lg-key--' + kind, style: `background:${meterColor(mp)}` }), meterLabel(mp, names, { compact: true })));
    }
  } else if (compareName && d.per[0]) {
    el.append(h('span', { class: 'lg' }, h('span', { class: 'lg-key lg-key--' + kind, style: `background:${d.per[0].color}` }), d.per[0].name));
  }
  if (compareName) el.append(h('span', { class: 'lg' }, h('span', { class: 'lg-key lg-key--line lg-key--cmp', style: `background:${T.compare}` }), compareName));
  el.hidden = !el.children.length;
}

function renderMain(d) {
  const { v, per, combinedCmpRaw } = d;
  const T = charts.tokens();
  const bucket = v.bucket;
  const type = chartTypeFor(d);
  renderTypeSeg(d, type);
  const split = $('splitBox');
  split.textContent = '';
  const chartEl = $('mainChart');

  if (type === 'pie') {
    renderMainLegend(d, type, null);
    chartEl.classList.remove('chart--tall');
    chartEl.classList.add('chart--donut');
    renderSplit(d, chartEl, split);
  } else {
    chartEl.classList.remove('chart--donut');
    split.hidden = true;
    const days = daysBetween(v.period.start, v.period.end);
    const axis = bucketAxis(v.period, bucket);
    const series = per.map((x) => ({ name: x.name, color: x.color, data: seriesOnAxis(x.cur, axis, bucket) }));
    let compare = null;
    if (combinedCmpRaw && v.comparePeriod) {
      const cAxis = bucketAxis(v.comparePeriod, bucket);
      const cSeries = seriesOnAxis(combinedCmpRaw, cAxis, bucket);
      compare = {
        name: periodShortName(v.comparePeriod),
        axis: axis.map((_, i) => cAxis[i] || null),
        data: axis.map((_, i) => (cSeries[i] ? cSeries[i].v : null)),
      };
    }
    renderMainLegend(d, type, compare ? compare.name : null);
    chartEl.classList.toggle('chart--tall', bucket === 'quarter');
    charts.render(chartEl, charts.mainOption(T, { bucket, axis, days, series, compare, type }));
  }

  // Hinweise: Ersatzwerte, Filter, die nicht greifen
  const notes = [];
  const st = d.stats.status;
  const estCount = Object.entries(st).filter(([k]) => k !== 'W').reduce((a, [, n]) => a + n, 0);
  if (estCount) {
    const unit = d.res === 'original' ? 'Viertelstunden' : d.res === 'monthly' ? 'Monate' : 'Tage';
    const parts = Object.entries(st).map(([k, n]) => `${STATUS_LABEL[k] || k}: ${num(n, 0)} ${unit}`).join(', ');
    notes.push(`${parts}${type === 'bar' && (bucket === 'day' || bucket === 'quarter') ? ' (blasser dargestellt)' : ''}.`);
  }
  if (hourFilterActive(state.filters) && !v.fine) notes.push('Der Tageszeit-Filter braucht Viertelstundenwerte und wirkt in dieser Ansicht nicht.');
  if (filtersActive(state.filters) && v.res === 'monthly') notes.push('In der Gesamtansicht liegen nur Monatswerte vor, Filter wirken hier nicht.');
  const note = $('mainNote');
  note.textContent = notes.join(' ');
  note.hidden = !notes.length;
}

/** Kreisdiagramm: Aufteilung nach Zählpunkt, Tageszeit oder Werktag/Wochenende */
function renderSplit(d, chartEl, box) {
  const T = charts.tokens();
  const opts = splitOptions(d);
  let by = state.settings.splitBy;
  if (!opts.some((o) => o.id === by)) by = opts[0].id;
  let items;
  if (by === 'meter') {
    items = splitByMeter(d.per.map((x) => ({ id: x.mp.id, name: x.name, points: x.cur }))).map((x) => ({ ...x, color: meterColor({ id: x.id }) }));
  } else if (by === 'daypart') {
    items = splitByDayPart(d.combined).map((x, i) => ({ ...x, color: T.s[i] }));
  } else {
    items = splitByWeekpart(d.combined).map((x, i) => ({ ...x, color: T.s[i] }));
  }
  items = items.filter((x) => x.value > 0);
  box.hidden = false;
  if (opts.length > 1) {
    box.append(h('div', { class: 'seg seg--small seg--split', role: 'group', 'aria-label': 'Aufteilen nach' }, ...opts.map((o) => h('button', {
      type: 'button', class: o.id === by ? 'on' : '', 'aria-pressed': o.id === by ? 'true' : 'false',
      onclick: () => { state.settings.splitBy = o.id; saveSettings(state.settings); renderMain(derive()); },
    }, o.label))));
  }
  if (!items.length) {
    charts.dispose(chartEl);
    chartEl.textContent = '';
    box.append(h('p', { class: 'empty', text: 'Für diesen Zeitraum liegen noch keine Werte vor.' }));
    return;
  }
  charts.render(chartEl, charts.donutOption(T, items));
  const total = items.reduce((a, x) => a + x.value, 0);
  const days = d.stats.days || 0;
  box.append(h('table', { class: 'tbl tbl--split' },
    h('thead', {}, h('tr', {}, h('th', { scope: 'col', text: { meter: 'Zählpunkt', daypart: 'Tageszeit', weekpart: 'Tage' }[by] }), h('th', { scope: 'col', class: 'num', text: 'kWh' }), h('th', { scope: 'col', class: 'num', text: 'Anteil' }))),
    h('tbody', {}, ...items.map((x) => h('tr', {},
      h('td', {}, h('span', { class: 'lg-key', style: `background:${x.color}` }), ' ', x.name),
      h('td', { class: 'num', text: num(x.value, x.value >= 100 ? 0 : 1) }),
      h('td', { class: 'num', text: pct(x.value / total) })))),
  ));
  if (by === 'weekpart' && days >= 7) {
    const perDay = splitPerDay(d.combined);
    if (perDay) box.append(h('p', { class: 'hint', text: `Pro Tag: Werktag ${kwh(perDay.weekday)}, Wochenendtag ${kwh(perDay.weekend)}. Werktage sind häufiger, darum ist ihr Anteil größer.` }));
  }
}

function splitPerDay(points) {
  const days = { wd: new Set(), we: new Set() };
  let wd = 0, we = 0;
  for (const p of points) {
    if (p.v == null) continue;
    const k = isoDate(p.t);
    const isWe = (p.t.getDay() + 6) % 7 >= 5;
    (isWe ? days.we : days.wd).add(k);
    if (isWe) we += p.v; else wd += p.v;
  }
  if (!days.wd.size || !days.we.size) return null;
  return { weekday: wd / days.wd.size, weekend: we / days.we.size };
}

function coverageText(days) {
  if (!days) return null;
  if (days < 1) return `erst ${num(Math.round(days * 24), 0)} Stunden Daten`;
  const d = Math.round(days * 10) / 10;
  return d === 1 ? 'aus 1 Tag' : `aus ${num(d, d % 1 ? 1 : 0)} Tagen`;
}

function kpi(label, value, sub, opts = {}) {
  return h('div', { class: 'kpi' + (opts.wide ? ' kpi--wide' : '') },
    h('p', { class: 'kpi-label', text: label }),
    h('p', { class: 'kpi-value', text: value }),
    sub ? h('p', { class: 'kpi-sub', text: sub }) : null);
}

function renderKpis(d) {
  const { v, stats, per } = d;
  const el = $('kpis');
  el.textContent = '';
  el.append(kpi('Ø pro Tag', stats.avgPerDay == null || stats.days < 1 ? '–' : kwh(stats.avgPerDay), coverageText(stats.days)));

  let peak = stats.peak;
  let peakSub = null;
  if (!peak) {
    const srv = per.map((x) => x.peak).filter(Boolean).sort((a, b) => b.kw - a.kw)[0];
    if (srv) { peak = srv; if (per.length > 1) peakSub = 'höchster einzelner Zähler'; }
  }
  el.append(kpi('Spitzenleistung', peak ? kw(peak.kw) : '–', peak ? (peakSub ? `${peakSub}, ${dateShort(peak.t)}` : `${dateShort(peak.t)} um ${time(peak.t)} Uhr`) : 'Viertelstundenwert'));

  if (v.fine) {
    el.append(kpi('Grundlast', stats.baseLoad == null ? '–' : watt(stats.baseLoad), 'läuft fast immer (10-%-Wert)'));
    el.append(kpi('Nachts 22–6 Uhr', stats.nightShare == null ? '–' : pct(stats.nightShare), 'Anteil am Verbrauch'));
  }
  const filtered = filtersActive(state.filters);
  const cost = costOf(stats.total, filtered ? 0 : stats.days || 0);
  if (cost != null && stats.avgPerDay != null) {
    el.append(kpi('Kosten pro Tag', euro(costOf(stats.avgPerDay, filtered ? 0 : 1)), `bei ${num(state.settings.pricePerKwh * 100, 2)} ct/kWh`));
  }
  if (v.fine && stats.avgPower != null) el.append(kpi('Ø Leistung', kw(stats.avgPower), 'über den Zeitraum'));
}

function analysisPanel(title, sub, chartClass, legendItems) {
  const legend = h('div', { class: 'legend' });
  legend.textContent = '';
  for (const it of legendItems || []) {
    legend.append(h('span', { class: 'lg' }, h('span', { class: 'lg-key lg-key--' + (it.kind || 'bar'), style: `background:${it.color}` }), it.name));
  }
  legend.hidden = (legendItems || []).length < 2;
  const chart = h('div', { class: 'chart ' + (chartClass || '') });
  const panel = h('section', { class: 'panel' },
    h('div', { class: 'panel-head' }, h('h2', { text: title })),
    sub ? h('p', { class: 'panel-sub', text: sub }) : null,
    legend, chart);
  return { panel, chart, legend };
}

function seqLegend(T, max) {
  return h('div', { class: 'seq-legend' },
    h('span', { text: '0' }),
    h('span', { class: 'seq-bar', style: `background:linear-gradient(90deg, ${T.seq.join(',')})` }),
    h('span', { text: kw(max) }));
}

function renderAnalysis(d) {
  const { v, combined } = d;
  const root = $('analysis');
  root.querySelectorAll('.chart').forEach((c) => charts.dispose(c));
  root.textContent = '';
  const T = charts.tokens();
  const days = daysBetween(v.period.start, v.period.end);
  const hasData = combined.some((p) => p.v != null);
  if (!hasData) return;
  const covered = d.stats.days || 0;

  if (v.fine && days >= 3 && covered >= 2) {
    const cp = carpet(combined, v.period);
    const a = analysisPanel('Wann Strom gebraucht wird', 'Jede Zeile ein Tag, jede Spalte eine Stunde. Je dunkler, desto mehr Leistung.', days > 10 ? 'chart--carpet' : 'chart--carpet-short');
    root.append(a.panel);
    const opt = charts.carpetOption(T, cp);
    a.chart.style.height = `${Math.max(150, 34 + cp.days.length * (days > 10 ? 11 : 22))}px`;
    charts.render(a.chart, opt);
    a.panel.append(seqLegend(T, opt._max));

    const prof = dailyProfile(combined);
    const items = [];
    if (prof.weekday) items.push({ name: 'Werktage', color: T.s[0], kind: 'line' });
    if (prof.weekend) items.push({ name: 'Wochenende', color: T.s[1], kind: 'line' });
    const b = analysisPanel('Typischer Tagesverlauf', 'Mittlere Leistung je Viertelstunde.', '', items);
    root.append(b.panel);
    charts.render(b.chart, charts.profileOption(T, prof));
  }

  if (((v.fine && days >= 7) || v.res === 'daily') && covered >= 7) {
    const avgs = weekdayAverages(combined);
    if (avgs.some((x) => x != null)) {
      const c = analysisPanel('Nach Wochentag', 'Mittlerer Verbrauch pro Tag.');
      root.append(c.panel);
      charts.render(c.chart, charts.weekdayOption(T, avgs));
    }
  }

  if (v.period.kind === 'year' && v.res === 'daily') {
    const daysData = dailyTotals(combined);
    const c = analysisPanel('Tage im Jahr', 'Tagesverbrauch im Kalender. Je dunkler, desto mehr.', 'chart--calendar');
    root.append(c.panel);
    const opt = charts.calendarOption(T, v.period.start.getFullYear(), daysData);
    charts.render(c.chart, opt);
    const lg = seqLegend(T, opt._max);
    lg.lastChild.textContent = kwh(opt._max);
    c.panel.append(lg);
  }

  if (v.res === 'monthly') {
    const years = monthsByYear(combined).filter(([, m]) => m.some((x) => x != null));
    if (years.length >= 2) {
      const recent = years.slice(-3).reverse();
      const items = recent.map(([y], i) => ({ name: String(y), color: T.s[i], kind: 'line' }));
      if (years.length > 3) items.push({ name: 'frühere Jahre', color: T.older, kind: 'line' });
      const c = analysisPanel('Jahre im Vergleich', 'Monatsverbrauch je Jahr.', '', items);
      root.append(c.panel);
      charts.render(c.chart, charts.yearsOption(T, years));
    }
  }
}

function tableBucket(v) {
  if (v.bucket === 'quarter') return daysBetween(v.period.start, v.period.end) <= 1 ? 'hour' : 'day';
  return v.bucket;
}

function renderTable(d) {
  const { v, per, combined } = d;
  const wrap = $('tableWrap');
  wrap.textContent = '';
  const tb = tableBucket(v);
  const axis = bucketAxis(v.period, tb);
  const multi = per.length > 1;
  const perRows = per.map((x) => seriesOnAxis(x.cur, axis, tb));
  const total = seriesOnAxis(combined, axis, tb);
  const rows = axis.map((t, i) => ({ t, v: total[i].v, s: total[i].s, parts: perRows.map((r) => r[i].v) })).filter((r) => r.v != null);
  if (!rows.length) {
    wrap.append(h('p', { class: 'empty', text: 'Für diesen Zeitraum liegen noch keine Werte vor. Das Portal liefert Messwerte meist mit einem Tag Verzögerung.' }));
    return;
  }
  const label = (t) => (tb === 'hour' ? `${time(t)}–${time(new Date(t.getTime() + 3600000))}` : tb === 'day' ? dateLong(t) : tb === 'month' ? `${MONTHS_LONG[t.getMonth()]} ${t.getFullYear()}` : String(t.getFullYear()));
  const max = Math.max(...rows.map((r) => r.v));
  const table = h('table', { class: 'tbl' },
    h('thead', {}, h('tr', {},
      h('th', { scope: 'col', text: tb === 'hour' ? 'Uhrzeit' : 'Zeitraum' }),
      ...(multi ? per.map((x) => h('th', { scope: 'col', class: 'num' }, h('span', { class: 'lg-key', style: `background:${x.color}` }), ' ', x.name)) : []),
      h('th', { scope: 'col', class: 'num', text: multi ? 'Summe kWh' : 'kWh' }))),
    h('tbody', {}, ...rows.map((r) => h('tr', { class: r.v === max ? 'is-max' : '' },
      h('td', {}, label(r.t), r.s !== 'W' && (tb === 'hour' || tb === 'day') ? h('span', { class: 'tag', title: STATUS_LABEL[r.s], text: STATUS_LABEL[r.s] }) : null),
      ...(multi ? r.parts.map((p) => h('td', { class: 'num', text: p == null ? '–' : num(p, 2) })) : []),
      h('td', { class: 'num' }, h('span', { class: 'bar-cell', style: `--w:${Math.max(2, (r.v / max) * 100)}%` }), h('span', { text: num(r.v, 2) }))))));
  const n = rows.length;
  const scroller = h('div', { class: 'tbl-scroll' }, table);
  if (n > 12) wrap.append(h('details', { class: 'more' }, h('summary', {}, `Alle ${n} Zeilen anzeigen`), scroller));
  else wrap.append(scroller);
}

function renderFoot(d) {
  const { v, stats } = d;
  const f = $('foot');
  f.textContent = '';
  const parts = [];
  if (stats.last) parts.push(`Letzter Messwert: ${dateTime(stats.last)} Uhr.`);
  parts.push(`Geladen um ${time(v.loadedAt)} Uhr${state.demo ? ' (Demo-Daten)' : ''}.`);
  f.append(h('p', { text: parts.join(' ') }));
  f.append(h('p', { text: 'Netzblick ist eine inoffizielle App von geister-it und zeigt die Daten aus den Portalen von Netz Burgenland.' }));
}

/* ================================================================ Sheets */
function meterOption(mp, on, onToggle, extra) {
  const names = state.settings.meterNames;
  const pod = podFor(mp.id);
  const a = mp.address;
  const where = pod && pod.address ? pod.address : a ? `${a.street || ''} ${a.houseNumber || ''}, ${a.postalCode || ''} ${a.city || ''}`.trim() : '';
  const sub = [names[mp.id] ? mp.id : null, where, pod && pod.meterNr ? `Zähler ${pod.meterNr}` : null, Object.keys(mp.flows).includes('feedin') ? 'mit Einspeisung' : null].filter(Boolean).join(', ');
  return h('div', { class: 'option option--check' + (on ? ' on' : '') },
    h('button', { type: 'button', class: 'option-main', role: 'checkbox', 'aria-checked': on ? 'true' : 'false', onclick: onToggle },
      h('span', { class: 'check', style: `--c:${meterColor(mp)}` }, on ? icon('check') : null),
      h('span', { class: 'option-text' }, h('b', { text: meterLabel(mp, names) }), sub ? h('small', { text: sub }) : null)),
    extra || null);
}

function openMeterSheet() {
  let sel = state.selected.slice();
  const initial = sel.join();
  const list = h('div', { class: 'options' });
  const draw = () => {
    list.textContent = '';
    if (state.mps.length > 1) {
      list.append(h('div', { class: 'presets' },
        h('button', { class: 'chip', type: 'button', onclick: () => { sel = state.mps.map((m) => m.id); draw(); } }, 'Alle auswählen'),
        h('span', { class: 'hint', text: 'Mehrere Zählpunkte werden zusammengezählt und im Diagramm farbig unterschieden.' })));
    }
    for (const mp of state.mps) {
      const on = sel.includes(mp.id);
      list.append(meterOption(mp, on, () => {
        if (on && sel.length === 1) { toast('Mindestens ein Zählpunkt bleibt ausgewählt.'); return; }
        sel = on ? sel.filter((x) => x !== mp.id) : [...sel, mp.id];
        draw();
      }, state.mps.length > 1 ? h('button', { type: 'button', class: 'option-only', onclick: () => { sel = [mp.id]; closeSheet(); } }, 'nur dieser') : null));
    }
    list.append(h('p', { class: 'hint', text: 'Eigene Namen vergibst du in den Einstellungen. Ohne Namen zeigt Netzblick die Zählpunktnummer.' }));
    fillIcons(list);
  };
  draw();
  openSheet(state.mps.length > 1 ? 'Zählpunkte' : 'Zählpunkt', list, () => {
    if (sel.join() !== initial) setSelection(sel);
  });
}

function openCompareSheet() {
  const list = h('div', { class: 'options' });
  const cur = state.settings.compareMode;
  const p = state.period;
  const prevName = p.kind === 'custom' ? 'Gleich langer Zeitraum davor' : `Vorherige${p.kind === 'day' ? 'r Tag' : p.kind === 'week' ? ' Woche' : p.kind === 'month' ? 'r Monat' : 's Jahr'}`;
  for (const [id, title, sub] of [
    ['prev', 'Vorperiode', prevName],
    ['yoy', 'Vorjahr', p.kind === 'week' || p.kind === 'day' ? 'Gleicher Wochentag vor 52 Wochen' : 'Gleicher Zeitraum ein Jahr davor'],
    ['none', 'Kein Vergleich', null],
  ]) {
    list.append(h('button', {
      class: 'option' + (cur === id ? ' on' : ''), type: 'button',
      onclick: () => { state.settings.compareMode = id; saveSettings(state.settings); closeSheet(); renderChips(); refresh(); },
    }, h('span', { class: 'option-text' }, h('b', { text: title }), sub ? h('small', { text: sub }) : null), cur === id ? icon('check') : null));
  }
  openSheet('Vergleichen mit', list);
}

function openFilterSheet() {
  const f = JSON.parse(JSON.stringify(state.filters));
  let sel = state.selected.slice();
  const body = h('div', { class: 'filter' });
  const names = state.settings.meterNames;

  const meterBox = h('div', { class: 'meter-toggles' });
  const drawMeters = () => {
    meterBox.textContent = '';
    for (const mp of state.mps) {
      const on = sel.includes(mp.id);
      meterBox.append(h('button', {
        type: 'button', class: 'mtoggle' + (on ? ' on' : ''), 'aria-pressed': on ? 'true' : 'false',
        onclick: () => {
          if (on && sel.length === 1) { toast('Mindestens ein Zählpunkt bleibt ausgewählt.'); return; }
          sel = on ? sel.filter((x) => x !== mp.id) : [...sel, mp.id];
          drawMeters();
        },
      }, h('span', { class: 'lg-key', style: `background:${meterColor(mp)}` }), meterLabel(mp, names, { compact: true })));
    }
  };
  drawMeters();

  const dayBtns = WEEKDAYS_SHORT.map((wd, i) => h('button', {
    class: 'daybtn' + (f.weekdays[i] ? ' on' : ''), type: 'button', 'aria-pressed': f.weekdays[i] ? 'true' : 'false',
    onclick: () => {
      f.weekdays[i] = !f.weekdays[i];
      if (!f.weekdays.some(Boolean)) f.weekdays[i] = true;
      syncDays();
    },
  }, wd));
  const syncDays = () => dayBtns.forEach((b, i) => { b.classList.toggle('on', f.weekdays[i]); b.setAttribute('aria-pressed', f.weekdays[i] ? 'true' : 'false'); });
  const presetDays = (arr) => () => { f.weekdays = arr; syncDays(); };

  const hourSel = (val, onChange, max) => h('select', { class: 'select', onchange: (e) => onChange(Number(e.target.value)) },
    ...Array.from({ length: 25 }, (_, i) => i).filter((i) => (max ? i >= 1 : i <= 23)).map((i) => h('option', { value: String(i), selected: i === val ? true : null }, `${i} Uhr`)));
  let fromSel, toSel;
  const syncHours = () => { fromSel.value = String(f.hours[0]); toSel.value = String(f.hours[1]); };
  fromSel = hourSel(f.hours[0], (x) => { f.hours[0] = x; });
  toSel = hourSel(f.hours[1], (x) => { f.hours[1] = x; }, true);
  const presetHours = (a, b) => () => { f.hours = [a, b]; syncHours(); };

  const fineHint = state.view && !state.view.fine
    ? h('p', { class: 'hint', text: 'Die Tageszeit wirkt nur in Tag, Woche, Monat und kurzen Zeiträumen (Viertelstundenwerte).' })
    : null;

  body.append(...[
    state.mps.length > 1 ? h('h3', { text: 'Zählpunkte' }) : null,
    state.mps.length > 1 ? meterBox : null,
    h('h3', { text: 'Wochentage' }),
    h('div', { class: 'days' }, ...dayBtns),
    h('div', { class: 'presets' },
      h('button', { class: 'chip', type: 'button', onclick: presetDays([true, true, true, true, true, true, true]) }, 'Alle Tage'),
      h('button', { class: 'chip', type: 'button', onclick: presetDays([true, true, true, true, true, false, false]) }, 'Werktage'),
      h('button', { class: 'chip', type: 'button', onclick: presetDays([false, false, false, false, false, true, true]) }, 'Wochenende')),
    h('h3', { text: 'Tageszeit' }),
    h('div', { class: 'hours' }, h('label', {}, 'von', fromSel), h('label', {}, 'bis', toSel)),
    h('div', { class: 'presets' },
      h('button', { class: 'chip', type: 'button', onclick: presetHours(0, 24) }, 'Ganzer Tag'),
      h('button', { class: 'chip', type: 'button', onclick: presetHours(6, 22) }, 'Tagsüber 6–22'),
      h('button', { class: 'chip', type: 'button', onclick: presetHours(22, 6) }, 'Nachts 22–6'),
      h('button', { class: 'chip', type: 'button', onclick: presetHours(0, 5) }, 'Grundlast 0–5')),
    fineHint,
    h('div', { class: 'sheet-actions' },
      h('button', {
        class: 'btn btn--ghost', type: 'button',
        onclick: () => {
          state.filters = JSON.parse(JSON.stringify(DEFAULT_FILTERS));
          closeSheet();
          if (state.selected.length !== state.mps.length) setSelection(state.mps.map((m) => m.id));
          else { renderChips(); renderAll(); }
        },
      }, 'Zurücksetzen'),
      h('button', {
        class: 'btn btn--primary', type: 'button',
        onclick: () => {
          if (f.hours[0] === f.hours[1]) f.hours = [0, 24];
          if (f.hours[0] === 0 && f.hours[1] === 24) f.hours = [0, 24];
          state.filters = f;
          closeSheet();
          if (sel.join() !== state.selected.join()) setSelection(sel);
          else { renderChips(); renderAll(); }
        },
      }, 'Filter anwenden')),
  ].filter(Boolean));
  openSheet('Filtern', body);
}

function lastBillingStart() {
  const pods = selectedMps().map((m) => podFor(m.id)).filter((p) => p && p.lastBillingPeriod);
  const ends = pods.map((p) => parseBillingPeriod(p.lastBillingPeriod)).filter(Boolean).map((x) => x.to.getTime());
  return ends.length ? new Date(Math.min(...ends)) : null;
}

function openCustomRange() {
  const p = state.period;
  const from = h('input', { type: 'date', class: 'input', value: isoDate(p.start), max: isoDate(new Date()) });
  const to = h('input', { type: 'date', class: 'input', value: isoDate(addDays(p.end, -1)), max: isoDate(new Date()) });
  const quick = (label, fn) => h('button', { class: 'chip', type: 'button', onclick: () => { const [a, b] = fn(); from.value = isoDate(a); to.value = isoDate(b); } }, label);
  const today = startOfDay(new Date());
  const billStart = lastBillingStart();
  const body = h('div', { class: 'filter' },
    h('div', { class: 'hours' }, h('label', {}, 'von', from), h('label', {}, 'bis', to)),
    h('div', { class: 'presets' },
      billStart && billStart < today ? quick('Seit der letzten Abrechnung', () => [billStart, addDays(today, -1)]) : null,
      quick('Letzte 7 Tage', () => [addDays(today, -7), addDays(today, -1)]),
      quick('Letzte 30 Tage', () => [addDays(today, -30), addDays(today, -1)]),
      quick('Letzte 90 Tage', () => [addDays(today, -90), addDays(today, -1)]),
      quick('Letzte 12 Monate', () => [new Date(today.getFullYear() - 1, today.getMonth(), today.getDate()), addDays(today, -1)])),
    h('p', { class: 'hint', text: 'Bis 93 Tage gibt es Viertelstundenwerte samt Lastgang-Analyse, darüber Tageswerte.' }),
    h('div', { class: 'sheet-actions' },
      h('button', {
        class: 'btn btn--primary', type: 'button',
        onclick: () => {
          const a = new Date(from.value + 'T00:00:00');
          const b = new Date(to.value + 'T00:00:00');
          if (isNaN(a) || isNaN(b)) return;
          state.period = makePeriod('custom', a, { from: a, to: b });
          closeSheet();
          renderControls();
          refresh();
        },
      }, 'Zeitraum anzeigen')));
  openSheet('Eigener Zeitraum', body);
}

function openYearPicker() {
  const first = firstDataDate(state.mps, state.flow) || new Date(2019, 0, 1);
  const list = h('div', { class: 'options options--grid' });
  for (let y = new Date().getFullYear(); y >= first.getFullYear(); y--) {
    list.append(h('button', {
      class: 'option option--center' + (state.period.start.getFullYear() === y ? ' on' : ''), type: 'button',
      onclick: () => { state.period = makePeriod('year', new Date(y, 0, 1)); closeSheet(); renderControls(); refresh(); },
    }, String(y)));
  }
  openSheet('Jahr wählen', list);
}

function openSettings() {
  const s = state.settings;
  const priceIn = h('input', { class: 'input', type: 'number', inputmode: 'decimal', step: '0.01', min: '0', placeholder: 'z. B. 28,5', value: s.pricePerKwh != null ? String(Math.round(s.pricePerKwh * 10000) / 100) : '' });
  const feeIn = h('input', { class: 'input', type: 'number', inputmode: 'decimal', step: '0.01', min: '0', placeholder: 'z. B. 12', value: s.feePerMonth != null ? String(s.feePerMonth) : '' });
  const nameInputs = state.mps.map((mp) => ({ mp, el: h('input', { class: 'input', type: 'text', placeholder: 'z. B. Haus, Wärmepumpe', value: s.meterNames[mp.id] || '', maxlength: '40' }) }));
  const themeBtns = [['system', 'Wie System'], ['light', 'Hell'], ['dark', 'Dunkel']].map(([id, label]) => h('button', {
    type: 'button', class: s.theme === id ? 'on' : '', 'aria-pressed': s.theme === id ? 'true' : 'false',
    onclick: (e) => {
      s.theme = id;
      themeBtns.forEach((b) => { b.classList.toggle('on', b === e.currentTarget); b.setAttribute('aria-pressed', b === e.currentTarget ? 'true' : 'false'); });
      saveSettings(s);
      applyTheme();
    },
  }, label));
  const parseNum = (v) => {
    const x = parseFloat(String(v).replace(',', '.'));
    return isFinite(x) && x >= 0 ? x : null;
  };
  const body = h('div', { class: 'settings' },
    h('h3', { text: 'Kosten' }),
    h('label', { class: 'field' }, h('span', { text: 'Strompreis in Cent pro kWh (brutto, Energie + Netz)' }), priceIn),
    h('label', { class: 'field' }, h('span', { text: 'Fixkosten in Euro pro Monat (Grund- und Netzpauschalen)' }), feeIn),
    h('p', { class: 'hint', text: 'Beides steht auf deiner Jahresabrechnung. Die Kosten in der App sind eine Schätzung.' }),
    h('h3', { text: 'Namen der Zählpunkte' }),
    h('p', { class: 'hint', text: 'Ohne eigenen Namen zeigt Netzblick die Zählpunktnummer aus dem Smart-Meter-Portal.' }),
    ...nameInputs.map(({ mp, el }) => h('label', { class: 'field' }, h('span', { class: 'mono', text: mp.id }), el)),
    h('h3', { text: 'Darstellung' }),
    h('div', { class: 'seg seg--small' }, ...themeBtns),
    h('div', { class: 'sheet-actions' },
      h('button', {
        class: 'btn btn--primary', type: 'button',
        onclick: () => {
          const ct = parseNum(priceIn.value);
          s.pricePerKwh = ct == null ? null : ct / 100;
          s.feePerMonth = parseNum(feeIn.value);
          nameInputs.forEach(({ mp, el }) => { const n = el.value.trim(); if (n) s.meterNames[mp.id] = n; else delete s.meterNames[mp.id]; });
          saveSettings(s);
          closeSheet();
          renderHeader();
          renderAll();
          if (state.page !== 'usage') renderPage();
          toast('Einstellungen gespeichert');
        },
      }, 'Speichern')),
    h('p', { class: 'fineprint', text: `Netzblick ${APP_VERSION}. Inoffizielle App von geister-it, nicht von Netz Burgenland. Zugangsdaten bleiben verschlüsselt auf diesem Gerät.` }));
  openSheet('Einstellungen', body);
}

/* ================================================================ CSV */
function exportCsv() {
  if (!state.view) return;
  const v = state.view;
  const names = state.settings.meterNames;
  const fmt = (x) => (x == null ? '' : String(Math.round(x * 1000) / 1000).replace('.', ','));
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = (d) => `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const lines = ['Zählpunkt;Name;Beginn;Auflösung;kWh;Status'];
  const resName = v.fine ? '15 min' : v.res === 'monthly' ? 'Monat' : 'Tag';
  for (const x of v.perMp) {
    const pts = applyFilters(x.cur.points, state.filters, x.cur.fine);
    for (const p of pts) {
      if (p.v == null) continue;
      lines.push([x.mp.id, `"${meterLabel(x.mp, names).replace(/"/g, '""')}"`, stamp(p.t), resName, fmt(p.v), STATUS_LABEL[p.s] || p.s].join(';'));
    }
  }
  const p = v.period;
  const file = `netzblick_${isoDate(p.start)}_${isoDate(addDays(p.end, -1))}.csv`;
  shareCsv(file, lines.join('\r\n')).catch((e) => toast('Teilen nicht möglich: ' + (e.message || e)));
}

/* ================================================================ Bedienung */
function setPeriodKind(kind) {
  if (kind === 'custom') { openCustomRange(); return; }
  const anchor = state.period.kind === 'total' || state.period.kind === 'custom' ? (kind === 'day' ? addDays(startOfDay(new Date()), -1) : new Date()) : state.period.anchor;
  let a = anchor;
  if (kind === 'day' && state.period.kind !== 'day' && startOfDay(a) >= startOfDay(new Date())) a = addDays(startOfDay(new Date()), -1);
  state.period = makePeriod(kind, a, { firstDate: firstDataDate(state.mps, state.flow) || undefined });
  renderControls();
  refresh();
}

function shift(dir) {
  if (state.period.kind === 'total') return;
  const next = shiftPeriod(state.period, dir);
  if (dir > 0 && next.start > new Date()) return;
  state.period = next;
  renderControls();
  refresh();
}

function openPeriodPicker() {
  const k = state.period.kind;
  const tryPicker = (input) => {
    try { if (input.showPicker) { input.showPicker(); return; } } catch { /* */ }
    input.focus();
    input.click();
  };
  if (k === 'day' || k === 'week') {
    const i = $('dateInput');
    i.value = isoDate(state.period.anchor);
    i.max = isoDate(new Date());
    tryPicker(i);
  } else if (k === 'month') {
    const i = $('monthInput');
    const a = state.period.start;
    i.value = `${a.getFullYear()}-${String(a.getMonth() + 1).padStart(2, '0')}`;
    tryPicker(i);
  } else if (k === 'year') openYearPicker();
  else if (k === 'custom') openCustomRange();
}

function bindDashboard() {
  fillIcons();
  document.querySelectorAll('[data-menu]').forEach((b) => b.addEventListener('click', openNav));
  $('navScrim').addEventListener('click', closeNav);
  $('meterBtn').addEventListener('click', openMeterSheet);
  $('refreshBtn').addEventListener('click', () => { refresh({ force: true }); loadReadings(); });
  $('pageRefresh').addEventListener('click', () => { ensureKp({ force: true }).catch(() => {}); renderPage(); });
  $('prevBtn').addEventListener('click', () => shift(-1));
  $('nextBtn').addEventListener('click', () => shift(1));
  $('periodTitle').addEventListener('click', openPeriodPicker);
  $('csvBtn').addEventListener('click', exportCsv);
  document.querySelectorAll('#periodTabs button').forEach((b) => b.addEventListener('click', () => setPeriodKind(b.dataset.kind)));
  $('dateInput').addEventListener('change', (e) => {
    if (!e.target.value) return;
    state.period = makePeriod(state.period.kind, new Date(e.target.value + 'T00:00:00'));
    renderControls();
    refresh();
  });
  $('monthInput').addEventListener('change', (e) => {
    if (!e.target.value) return;
    const [y, m] = e.target.value.split('-').map(Number);
    state.period = makePeriod('month', new Date(y, m - 1, 1));
    renderControls();
    refresh();
  });
  $('scrim').addEventListener('click', () => closeSheet());
  $('sheetClose').addEventListener('click', () => closeSheet());
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (!closeSheet()) closeNav(); } });

  // Wischen über Kopfbereich und Summe wechselt den Zeitraum
  let sx = null, sy = null;
  for (const el of [$('hero'), $('controls')]) {
    el.addEventListener('touchstart', (e) => { const t = e.touches[0]; sx = t.clientX; sy = t.clientY; }, { passive: true });
    el.addEventListener('touchend', (e) => {
      if (sx == null) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - sx, dy = t.clientY - sy;
      sx = null;
      if (Math.abs(dx) > 70 && Math.abs(dy) < 45) shift(dx < 0 ? 1 : -1);
    }, { passive: true });
  }
  // Wischen vom linken Rand öffnet das Menü
  let ex = null, ey = null;
  document.addEventListener('touchstart', (e) => { const t = e.touches[0]; if (t.clientX < 24 && !$('dash').hidden) { ex = t.clientX; ey = t.clientY; } else ex = null; }, { passive: true });
  document.addEventListener('touchend', (e) => {
    if (ex == null) return;
    const t = e.changedTouches[0];
    if (t.clientX - ex > 60 && Math.abs(t.clientY - ey) < 50) openNav();
    ex = null;
  }, { passive: true });

  onBack(() => closeSheet() || closeNav() || (state.page !== 'usage' && !$('dash').hidden ? (goto('usage'), true) : false));
  onResume(() => {
    if (state.view && Date.now() - state.view.loadedAt.getTime() > 20 * 60000) { refresh(); loadReadings(); }
  });
  window.matchMedia('(min-width: 1024px) and (min-height: 560px)').addEventListener?.('change', () => closeNav());
}

/* ================================================================ Start */
async function boot() {
  applyTheme();
  fillIcons();
  startIntro();
  bindLogin();
  bindDashboard();

  if (PARAMS.has('demo') || PREVIEW) {
    if (PARAMS.get('period')) state.period = makePeriod(PARAMS.get('period'), PARAMS.get('date') ? new Date(PARAMS.get('date') + 'T00:00:00') : new Date());
    if (PARAMS.get('theme')) state.settings.theme = PARAMS.get('theme');
    if (PARAMS.get('price')) state.settings.pricePerKwh = Number(PARAMS.get('price'));
    if (PARAMS.get('chart')) state.settings.chartTypes = { quarter: PARAMS.get('chart'), day: PARAMS.get('chart'), month: PARAMS.get('chart'), year: PARAMS.get('chart') };
    if (PARAMS.get('split')) state.settings.splitBy = PARAMS.get('split');
    if (PARAMS.get('sel')) localStorage.setItem('nb.selection', JSON.stringify(PARAMS.get('sel') === 'all' ? 'all' : PARAMS.get('sel').split(',')));
    applyTheme();
    await doLogin('demo', 'demo', { demo: true });
    if (PARAMS.get('page')) goto(PARAMS.get('page'));
    if (PARAMS.has('menu')) openNav();
    return;
  }

  let username = null, password = null;
  try {
    username = await secure.get('username');
    password = await secure.get('password');
  } catch { /* */ }
  if (username && password) {
    $('user').value = username;
    $('bootText').textContent = 'Anmelden …';
    try {
      await doLogin(username, password, { remember: true, silent: true });
      return;
    } catch (e) {
      if (e.code === 'NETWORK') {
        // Offline-Start mit gespeicherten Zählpunkten und Werten
        const meta = localStorage.getItem('nb.accounts');
        if (meta) {
          state.api = new PortalApi(http);
          state.api.credentials = { username, password };
          state.api.useAccounts(JSON.parse(meta));
          state.accounts = state.api.accounts;
          state.store = new DataStore(state.api, { offline: true });
          enterDashboard();
          showBanner('Offline: Angezeigt werden die zuletzt geladenen Werte.', true);
          return;
        }
      }
      showLogin(e.message);
      return;
    }
  }
  showLogin();
}

boot();
