// Netzblick – App-Steuerung
import { PortalApi, ApiError } from './api.js';
import {
  DataStore, meterPointsFrom, meterLabel, shortId, firstDataDate, loadView, mergeSum, applyFilters, filtersActive, hourFilterActive,
  DEFAULT_FILTERS, bucketAxis, seriesOnAxis, computeStats, likeForLikeCut, forecast, dailyProfile, carpet, weekdayAverages,
  monthsByYear, dailyTotals, STATUS_LABEL, aggregate,
} from './model.js';
import { makePeriod, shiftPeriod, periodTitle, periodShortName, PERIOD_LABELS, daysBetween, addDays, startOfDay } from './time.js';
import { num, kwh, kw, watt, euro, pct, signedPct, dateLong, dateTime, dateShort, time, isoDate, WEEKDAYS_SHORT, MONTHS_LONG } from './format.js';
import * as charts from './charts.js';
import { icons } from './icons.js';
import { http, secure, loadSettings, saveSettings, shareCsv, onBack, onResume, setSystemBars, isNative } from './platform.js';
import { demoHttp } from './demo.js';
import { cacheClear } from './cache.js';

/* ================================================================ Hilfen */
const $ = (id) => document.getElementById(id);
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v; // nur für eigene, statische Icons
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'style') el.setAttribute('style', v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}
const icon = (name) => h('span', { class: 'ic', html: icons[name] });
function fillIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) => {
    if (!el.dataset.iconDone) {
      el.insertAdjacentHTML('afterbegin', icons[el.dataset.icon] || '');
      el.dataset.iconDone = '1';
    }
  });
}
// Web-Vorschau (ohne native Schicht): nur Demo-Daten möglich, da der Browser die Portal-API blockiert
const PREVIEW = (document.querySelector('meta[name="netzblick-mode"]') || {}).content === 'demo-preview';
/* global __APP_VERSION__ */
const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ================================================================ Zustand */
const state = {
  api: null,
  store: null,
  demo: false,
  accounts: [],
  mps: [],
  selected: 'all',
  flow: 'consumption',
  period: makePeriod('month', new Date()),
  filters: JSON.parse(JSON.stringify(DEFAULT_FILTERS)),
  settings: loadSettings(),
  view: null,
  loading: false,
  loadSeq: 0,
  error: null,
  readings: new Map(),
};

/* ================================================================ Thema */
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  const t = state.settings.theme;
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
  const dark = t === 'dark' || (t === 'system' && darkQuery.matches);
  setSystemBars(dark);
  if (state.view) renderAll();
}
darkQuery.addEventListener?.('change', applyTheme);

/* ================================================================ Rollenzählwerk */
function setCounter(el, value, { digits = 6, animate = true } = {}) {
  const v = Math.max(0, value || 0);
  const intStr = Math.floor(v).toString().padStart(digits, '0');
  const dec = Math.floor((v * 10) % 10);
  const chars = [...intStr, String(dec)];
  if (el.children.length !== chars.length) {
    el.textContent = '';
    chars.forEach((_, i) => {
      const roll = h('span', { class: 'roll' + (i === chars.length - 1 ? ' roll--dec' : '') },
        h('span', { class: 'strip' }, ...Array.from({ length: 10 }, (_, n) => h('span', { text: String(n) }))));
      el.append(roll);
    });
  }
  chars.forEach((c, i) => {
    const strip = el.children[i].firstChild;
    strip.style.transition = animate && !reduceMotion() ? `transform ${900 + i * 120}ms cubic-bezier(.2,.8,.2,1)` : 'none';
    strip.style.transform = `translateY(-${Number(c) * 10}%)`;
  });
  el.setAttribute('aria-label', `Zählerstand ${num(v, 1)} Kilowattstunden`);
}

/* ================================================================ Bottom-Sheet */
let sheetOnClose = null;
function openSheet(title, body, onClose) {
  $('sheetTitle').textContent = title;
  const b = $('sheetBody');
  b.textContent = '';
  b.append(body);
  fillIcons(b);
  $('scrim').hidden = false;
  $('sheet').hidden = false;
  requestAnimationFrame(() => { $('sheet').classList.add('open'); $('scrim').classList.add('open'); });
  sheetOnClose = onClose || null;
  setTimeout(() => {
    const first = b.querySelector('input, button, select');
    if (first && !isNative) first.focus({ preventScroll: true });
  }, 50);
}
function closeSheet() {
  if ($('sheet').hidden) return false;
  $('sheet').classList.remove('open');
  $('scrim').classList.remove('open');
  setTimeout(() => { $('sheet').hidden = true; $('scrim').hidden = true; }, 220);
  const cb = sheetOnClose;
  sheetOnClose = null;
  if (cb) cb();
  return true;
}

let toastTimer = null;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.classList.remove('show'); setTimeout(() => (t.hidden = true), 250); }, 2600);
}

/* ================================================================ Anmeldung */
function showLogin(message) {
  $('boot').hidden = true;
  $('dash').hidden = true;
  $('login').hidden = false;
  setCounter($('loginCounter'), 0, { digits: 5, animate: false });
  if (PREVIEW) {
    // Vorschau: keine Eingabefelder für Zugangsdaten, nur der Demo-Einstieg
    $('loginForm').querySelectorAll('.field, .switch, #loginBtn').forEach((el) => { el.hidden = true; });
    message = 'Web-Vorschau mit Beispieldaten. Die Anmeldung mit deinem Netz-Burgenland-Zugang gibt es in der Android-App.';
    $('loginError').classList.add('is-info');
  }
  const err = $('loginError');
  if (message) { err.textContent = message; err.hidden = false; } else err.hidden = true;
}

async function doLogin(username, password, { remember, demo = false, silent = false } = {}) {
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
    const btn = $('loginBtn');
    btn.disabled = true;
    btn.textContent = 'Anmelden …';
    err.hidden = true;
    try {
      await doLogin(u, p, { remember: $('remember').checked });
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
  await secure.remove('username').catch(() => {});
  await secure.remove('password').catch(() => {});
  try { localStorage.removeItem('nb.accounts'); } catch { /* */ }
  cacheClear();
  state.api = null;
  state.view = null;
  state.readings.clear();
  $('pass').value = '';
  showLogin();
}

/* ================================================================ Übersicht */
function selectedMps() {
  return state.selected === 'all' ? state.mps : state.mps.filter((m) => m.id === state.selected);
}
function availableFlows() {
  const set = new Set();
  for (const mp of selectedMps()) Object.keys(mp.flows).forEach((f) => set.add(f));
  return [...set];
}

function enterDashboard() {
  state.mps = meterPointsFrom(state.accounts);
  const saved = localStorage.getItem('nb.selected');
  state.selected = state.mps.length === 1 ? state.mps[0].id : (saved && (saved === 'all' || state.mps.some((m) => m.id === saved)) ? saved : 'all');
  if (!availableFlows().includes(state.flow)) state.flow = availableFlows()[0] || 'consumption';
  $('boot').hidden = true;
  $('login').hidden = true;
  $('dash').hidden = false;
  renderHeader();
  renderControls();
  refresh();
  loadReadings();
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
  if (state.selected === 'all' && state.mps.length > 1) {
    $('meterName').textContent = 'Alle Zählpunkte';
    $('meterSub').textContent = `${state.mps.length} Zählpunkte${state.demo ? ', Demo' : ''}`;
  } else {
    const mp = mps[0];
    $('meterName').textContent = mp ? meterLabel(mp, names) : 'Kein Zählpunkt';
    $('meterSub').textContent = mp ? `${shortId(mp)}${mp.address && mp.address.city ? ', ' + mp.address.city : ''}${state.demo ? ', Demo' : ''}` : '';
  }
  renderReading(false);
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
  // zusammenhängende Bereiche zusammenfassen
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
      mps: selectedMps(),
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
function seriesColor(i) {
  const T = charts.tokens();
  return T.s[i % T.s.length];
}

function derive() {
  const v = state.view;
  const f = state.filters;
  const names = state.settings.meterNames;
  const per = v.perMp.map((x, i) => ({
    mp: x.mp,
    name: meterLabel(x.mp, names),
    color: seriesColor(i),
    cur: applyFilters(x.cur.points, f, x.cur.fine),
    cmp: x.cmp ? applyFilters(x.cmp.points, f, x.cmp.fine) : null,
    peak: x.peak,
  }));
  const combined = per.length === 1 ? per[0].cur : mergeSum(per.map((x) => x.cur));
  const combinedCmpRaw = v.comparePeriod && per.every((x) => x.cmp) ? (per.length === 1 ? per[0].cmp : mergeSum(per.map((x) => x.cmp))) : null;
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
  $('heroValue').textContent = stats.total == null ? '–' : num(stats.total, stats.total >= 100 ? 0 : 1);

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

function renderLegend(el, items) {
  el.textContent = '';
  if (items.length < 2) { el.hidden = true; return; }
  el.hidden = false;
  for (const it of items) {
    el.append(h('span', { class: 'lg' }, h('span', { class: 'lg-key lg-key--' + (it.kind || 'bar'), style: `background:${it.color}` }), it.name));
  }
}

function renderMain(d) {
  const { v, per, combinedCmpRaw } = d;
  const T = charts.tokens();
  const bucket = v.bucket;
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
  const legend = series.map((s) => ({ name: s.name, color: s.color, kind: bucket === 'quarter' ? 'line' : 'bar' }));
  if (compare) legend.push({ name: compare.name, color: T.compare, kind: 'line' });
  // eine Reihe + Vergleich: Legende trotzdem zeigen (2 Reihen)
  renderLegend($('mainLegend'), legend);
  $('mainChart').classList.toggle('chart--tall', bucket === 'quarter');
  charts.render($('mainChart'), charts.mainOption(T, { bucket, axis, days, series, compare }));

  // Hinweise: Ersatzwerte, Filter, die nicht greifen
  const notes = [];
  const st = d.stats.status;
  const estCount = Object.entries(st).filter(([k]) => k !== 'W').reduce((a, [, n]) => a + n, 0);
  if (estCount) {
    const unit = d.res === 'original' ? 'Viertelstunden' : d.res === 'monthly' ? 'Monate' : 'Tage';
    const parts = Object.entries(st).map(([k, n]) => `${STATUS_LABEL[k] || k}: ${num(n, 0)} ${unit}`).join(', ');
    notes.push(`${parts}${bucket === 'day' || bucket === 'quarter' ? ' (blasser dargestellt)' : ''}.`);
  }
  if (hourFilterActive(state.filters) && !v.fine) notes.push('Der Tageszeit-Filter braucht Viertelstundenwerte und wirkt in dieser Ansicht nicht.');
  if (filtersActive(state.filters) && v.res === 'monthly') notes.push('In der Gesamtansicht liegen nur Monatswerte vor, Filter wirken hier nicht.');
  const note = $('mainNote');
  note.textContent = notes.join(' ');
  note.hidden = !notes.length;
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
  renderLegend(legend, legendItems || []);
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
  // vorhandene Diagramme sauber entsorgen
  root.querySelectorAll('.chart').forEach((c) => charts.dispose(c));
  root.textContent = '';
  const T = charts.tokens();
  const days = daysBetween(v.period.start, v.period.end);
  const hasData = combined.some((p) => p.v != null);
  if (!hasData) return;
  const covered = d.stats.days || 0; // Tage mit Messwerten

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
      ...(multi ? per.map((x) => h('th', { scope: 'col', class: 'num', text: x.name })) : []),
      h('th', { scope: 'col', class: 'num', text: 'kWh' }))),
    h('tbody', {}, ...rows.map((r) => h('tr', { class: r.v === max ? 'is-max' : '' },
      h('td', {}, label(r.t), r.s !== 'W' && (tb === 'hour' || tb === 'day') ? h('span', { class: 'tag', title: STATUS_LABEL[r.s], text: STATUS_LABEL[r.s] }) : null),
      ...(multi ? r.parts.map((p) => h('td', { class: 'num', text: p == null ? '–' : num(p, 2) })) : []),
      h('td', { class: 'num' }, h('span', { class: 'bar-cell', style: `--w:${Math.max(2, (r.v / max) * 100)}%` }), h('span', { text: num(r.v, 2) }))))));
  const n = rows.length;
  if (n > 12) {
    const det = h('details', { class: 'more' }, h('summary', {}, `Alle ${n} Zeilen anzeigen`), table);
    wrap.append(det);
  } else wrap.append(table);
}

function renderFoot(d) {
  const { v, stats } = d;
  const f = $('foot');
  f.textContent = '';
  const parts = [];
  if (stats.last) parts.push(`Letzter Messwert: ${dateTime(stats.last)} Uhr.`);
  parts.push(`Geladen um ${time(v.loadedAt)} Uhr${state.demo ? ' (Demo-Daten)' : ''}.`);
  f.append(h('p', { text: parts.join(' ') }));
  f.append(h('p', { text: 'Netzblick ist eine inoffizielle App und zeigt die Daten aus dem Verbrauchsdatenportal von Netz Burgenland.' }));
}

/* ================================================================ Sheets */
function openMeterSheet() {
  const names = state.settings.meterNames;
  const list = h('div', { class: 'options' });
  const opt = (id, title, sub) => h('button', {
    class: 'option' + (state.selected === id ? ' on' : ''), type: 'button',
    onclick: () => {
      state.selected = id;
      try { localStorage.setItem('nb.selected', id); } catch { /* */ }
      if (!availableFlows().includes(state.flow)) state.flow = availableFlows()[0];
      closeSheet();
      renderHeader();
      renderChips();
      refresh();
    },
  }, h('span', { class: 'option-text' }, h('b', { text: title }), sub ? h('small', { text: sub }) : null), state.selected === id ? icon('check') : null);
  if (state.mps.length > 1) list.append(opt('all', 'Alle Zählpunkte', 'Summe, nach Zählpunkt gestapelt'));
  for (const mp of state.mps) {
    const a = mp.address;
    list.append(opt(mp.id, meterLabel(mp, names), `${mp.id}${a ? `, ${a.postalCode || ''} ${a.city || ''}` : ''}`));
  }
  list.append(h('p', { class: 'hint', text: 'Eigene Namen für Zählpunkte vergibst du in den Einstellungen.' }));
  openSheet('Zählpunkt', list);
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
  const body = h('div', { class: 'filter' });

  const dayBtns = WEEKDAYS_SHORT.map((wd, i) => h('button', {
    class: 'daybtn' + (f.weekdays[i] ? ' on' : ''), type: 'button', 'aria-pressed': f.weekdays[i] ? 'true' : 'false',
    onclick: (e) => {
      f.weekdays[i] = !f.weekdays[i];
      if (!f.weekdays.some(Boolean)) f.weekdays[i] = true; // mind. ein Tag
      syncDays();
    },
  }, wd));
  const syncDays = () => dayBtns.forEach((b, i) => { b.classList.toggle('on', f.weekdays[i]); b.setAttribute('aria-pressed', f.weekdays[i] ? 'true' : 'false'); });
  const presetDays = (arr) => () => { f.weekdays = arr; syncDays(); };

  const hourSel = (val, onChange, max) => {
    const s = h('select', { class: 'select', onchange: (e) => onChange(Number(e.target.value)) },
      ...Array.from({ length: 25 }, (_, i) => i).filter((i) => (max ? i >= 1 : i <= 23)).map((i) => h('option', { value: String(i), selected: i === val ? true : null }, `${i} Uhr`)));
    return s;
  };
  let fromSel, toSel;
  const syncHours = () => { fromSel.value = String(f.hours[0]); toSel.value = String(f.hours[1]); };
  fromSel = hourSel(f.hours[0], (x) => { f.hours[0] = x; });
  toSel = hourSel(f.hours[1], (x) => { f.hours[1] = x; }, true);
  const presetHours = (a, b) => () => { f.hours = [a, b]; syncHours(); };

  const fineHint = state.view && !state.view.fine
    ? h('p', { class: 'hint', text: 'Die Tageszeit wirkt nur in Tag, Woche, Monat und kurzen Zeiträumen (Viertelstundenwerte).' })
    : null;

  body.append(...[
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
      h('button', { class: 'btn btn--ghost', type: 'button', onclick: () => { state.filters = JSON.parse(JSON.stringify(DEFAULT_FILTERS)); closeSheet(); renderChips(); renderAll(); } }, 'Zurücksetzen'),
      h('button', {
        class: 'btn btn--primary', type: 'button',
        onclick: () => {
          if (f.hours[0] === f.hours[1]) f.hours = [0, 24];
          if (f.hours[0] === 0 && f.hours[1] === 24) f.hours = [0, 24];
          state.filters = f;
          closeSheet();
          renderChips();
          renderAll();
        },
      }, 'Filter anwenden')),
  ].filter(Boolean));
  openSheet('Filtern', body);
}

function openCustomRange() {
  const p = state.period;
  const from = h('input', { type: 'date', class: 'input', value: isoDate(p.start), max: isoDate(new Date()) });
  const to = h('input', { type: 'date', class: 'input', value: isoDate(addDays(p.end, -1)), max: isoDate(new Date()) });
  const quick = (label, fn) => h('button', { class: 'chip', type: 'button', onclick: () => { const [a, b] = fn(); from.value = isoDate(a); to.value = isoDate(b); } }, label);
  const today = startOfDay(new Date());
  const body = h('div', { class: 'filter' },
    h('div', { class: 'hours' }, h('label', {}, 'von', from), h('label', {}, 'bis', to)),
    h('div', { class: 'presets' },
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
  const nameInputs = state.mps.map((mp) => {
    const a = mp.address;
    const fallback = a && a.street ? `${a.street} ${a.houseNumber || ''}`.trim() : shortId(mp);
    return { mp, el: h('input', { class: 'input', type: 'text', placeholder: fallback, value: s.meterNames[mp.id] || '', maxlength: '40' }) };
  });
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
  const acc = state.accounts[0];
  const body = h('div', { class: 'settings' },
    h('h3', { text: 'Kosten' }),
    h('label', { class: 'field' }, h('span', { text: 'Strompreis in Cent pro kWh (brutto, Energie + Netz)' }), priceIn),
    h('label', { class: 'field' }, h('span', { text: 'Fixkosten in Euro pro Monat (Grund- und Netzpauschalen)' }), feeIn),
    h('p', { class: 'hint', text: 'Beides steht auf deiner Jahresabrechnung. Die Kosten in der App sind eine Schätzung.' }),
    h('h3', { text: 'Namen der Zählpunkte' }),
    ...nameInputs.map(({ mp, el }) => h('label', { class: 'field' }, h('span', { text: mp.id }), el)),
    h('h3', { text: 'Darstellung' }),
    h('div', { class: 'seg seg--small' }, ...themeBtns),
    h('h3', { text: 'Konto' }),
    h('p', { class: 'hint', text: state.demo ? 'Demo-Modus mit erfundenen Werten.' : `Angemeldet als ${acc ? acc.displayName : ''}.` }),
    h('div', { class: 'sheet-actions' },
      h('button', { class: 'btn btn--ghost', type: 'button', onclick: logout }, state.demo ? 'Demo beenden' : 'Abmelden'),
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
          toast('Einstellungen gespeichert');
        },
      }, 'Speichern')),
    h('p', { class: 'fineprint', text: `Netzblick ${APP_VERSION}. Inoffizielle App, nicht von Netz Burgenland oder VIVAVIS. Die Daten kommen aus smartmeter.netzburgenland.at; Zugangsdaten bleiben auf diesem Gerät.` }));
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
  // Tagesansicht: standardmäßig gestern (heute ist meist noch leer)
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
  $('meterBtn').addEventListener('click', openMeterSheet);
  $('settingsBtn').addEventListener('click', openSettings);
  $('refreshBtn').addEventListener('click', () => { refresh({ force: true }); loadReadings(); });
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
  $('scrim').addEventListener('click', closeSheet);
  $('sheetClose').addEventListener('click', closeSheet);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });

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

  onBack(() => closeSheet());
  onResume(() => {
    if (state.view && Date.now() - state.view.loadedAt.getTime() > 20 * 60000) { refresh(); loadReadings(); }
  });
}

/* ================================================================ Start */
async function boot() {
  applyTheme();
  fillIcons();
  bindLogin();
  bindDashboard();
  setCounter($('bootCounter'), 0, { digits: 5, animate: false });

  const params = new URLSearchParams(location.search);
  if (params.has('demo') || PREVIEW) {
    if (params.get('period')) state.period = makePeriod(params.get('period'), params.get('date') ? new Date(params.get('date') + 'T00:00:00') : new Date());
    if (params.get('theme')) state.settings.theme = params.get('theme');
    if (params.get('price')) state.settings.pricePerKwh = Number(params.get('price'));
    if (params.get('sel')) localStorage.setItem('nb.selected', params.get('sel'));
    applyTheme();
    await doLogin('demo', 'demo', { demo: true });
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
