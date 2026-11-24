// Seite „Börsenpreis“: Day-Ahead-Preise EPEX Spot für Österreich.
// Ein Tag in Viertelstunden (günstig blau, teuer rot), die günstigsten und teuersten Zeitfenster,
// der Vergleich mit den Nachbarländern und die Muster über Wochen und Monate.
import { h, icon } from './ui.js';
import { SpotStore, ZONES, SPOT_SOURCE, SPOT_SINCE, dynamicPrice } from './spot.js';
import { toHourly, dayStats, windows, profile, extremeHours, carpet, scaleAround } from './spotstats.js';
import { supplierFor } from './costs.js';
import { VAT, DYNAMIC_PROVIDERS } from './netzdaten.js';
import { addDays, startOfDay } from './time.js';
import { num, time, WEEKDAYS_LONG, MONTHS_LONG, dow } from './format.js';
import * as charts from './charts.js';
import { openExternal } from './platform.js';

const DAY = 86400000;
const ct = (x, d = 2) => `${num(x, d)} ct`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
/** wie el.append, aber ohne leere Teile (append würde „null“ schreiben) */
const append = (el, ...kids) => el.append(...kids.filter((k) => k != null && k !== false));
const section = (title, sub, ...kids) => h('section', { class: 'panel' },
  title ? h('div', { class: 'panel-head' }, h('h2', { text: title })) : null,
  sub ? h('p', { class: 'panel-sub', text: sub }) : null,
  ...kids);
const kpiTile = (label, value, sub) => h('div', { class: 'kpi' },
  h('p', { class: 'kpi-label', text: label }),
  h('p', { class: 'kpi-value', text: value }),
  sub ? h('p', { class: 'kpi-sub', text: sub }) : null);
const spinner = (text) => h('p', { class: 'hint' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), ` ${text}`);
const hourRange = (hr) => `${hr}–${hr + 1} Uhr`;
const span = (w) => `${time(w.from)}–${time(w.to)} Uhr`;
/** Dauer in Stunden als „5 h 45 min“ */
export function duration(hours) {
  const m = Math.round(hours * 60);
  const hh = Math.floor(m / 60), mm = m % 60;
  return hh && mm ? `${hh} h ${mm} min` : hh ? `${hh} h` : `${mm} min`;
}

export const RANGES = [
  { id: '7', days: 7, label: '7 Tage' },
  { id: '28', days: 28, label: '4 Wochen' },
  { id: '91', days: 91, label: '3 Monate' },
  { id: '365', days: 365, label: '12 Monate' },
];

/** Name eines Tages relativ zu heute */
export function dayTitle(d, now = new Date()) {
  const diff = Math.round((startOfDay(d).getTime() - startOfDay(now).getTime()) / DAY);
  const date = `${d.getDate()}. ${MONTHS_LONG[d.getMonth()]}`;
  if (diff === 0) return `Heute, ${date}`;
  if (diff === 1) return `Morgen, ${date}`;
  if (diff === -1) return `Gestern, ${date}`;
  return `${WEEKDAYS_LONG[dow(d)]}, ${date}${d.getFullYear() !== now.getFullYear() ? ` ${d.getFullYear()}` : ''}`;
}

/** Speicher je Nachbarland (hält nur wenige Monate vor) */
function zoneStore(state, bzn) {
  if (bzn === 'AT') return state.spot;
  state.zoneStores = state.zoneStores || {};
  if (!state.zoneStores[bzn]) state.zoneStores[bzn] = new SpotStore(state.spot.http, { bzn });
  return state.zoneStores[bzn];
}

/** Dynamischer Tarif des ersten Zählpunkts mit Verbrauch, sonst null */
function dynamicSupplier(state) {
  const first = state.mps.find((m) => m.flows && m.flows.consumption) || state.mps[0];
  const sup = first ? supplierFor(state.settings, first.id) : null;
  return sup && sup.kind === 'dynamic' ? sup : null;
}

export function renderSpotPage(body, ctx) {
  const { state } = ctx;
  if (!state.spot) { body.append(h('p', { class: 'empty', text: 'Börsenpreise sind erst nach der Anmeldung verfügbar.' })); return; }
  const now = new Date();
  const today = startOfDay(now);
  const tomorrow = addDays(today, 1);
  const sup = dynamicSupplier(state);
  let mode = sup && state.spotMode !== 'spot' ? 'mine' : 'spot';
  let day = state.spotDay && state.spotDay >= SPOT_SINCE && state.spotDay <= tomorrow ? startOfDay(state.spotDay) : today;
  let range = RANGES.find((r) => r.id === state.spotRange) || RANGES[1];
  let res = state.settings.spotRes === 60 ? 60 : 15; // Tagesansicht: Viertelstunden oder Stunden

  // Preis je Punkt: Börse netto oder dein Energiepreis brutto (mit Aufschlag)
  const label = () => (mode === 'mine' ? 'dein Preis brutto' : 'Börse netto');
  const hourlyTariff = () => mode === 'mine' && sup.interval === 60;
  const priced = (raw, hourly) => {
    let pts = raw.map((x) => ({ t: x.t, spot: x.p, v: x.p == null ? null : mode === 'mine' ? dynamicPrice(x.p, sup, VAT) : x.p, step: x.step }));
    if (hourly && pts.length && pts[0].step < 3600000) {
      // Stundentarif: Aufschlag auf das Stundenmittel der Börse (wie abgerechnet); sonst Mittel der Viertelstundenpreise
      const hs = toHourly(raw.map((x) => ({ t: x.t, v: x.p, step: x.step })));
      const hv = mode === 'mine' && !hourlyTariff() ? toHourly(pts) : null;
      pts = hs.map((x, i) => ({ t: x.t, spot: x.v, v: x.v == null ? null : mode !== 'mine' ? x.v : hv ? hv[i].v : dynamicPrice(x.v, sup, VAT), step: 3600000 }));
    }
    return pts;
  };

  body.append(h('p', { class: 'page-lead', text: 'Die Day-Ahead-Preise der Strombörse EPEX Spot für Österreich. Sie werden jeden Tag gegen 13 Uhr für alle Viertelstunden des nächsten Tages festgelegt.' }));

  /* ---- Tag wählen, Ansicht wählen */
  const prev = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Vorheriger Tag' }, icon('prev'));
  const next = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Nächster Tag' }, icon('next'));
  const title = h('button', { class: 'period-title', type: 'button', 'aria-label': 'Zu heute springen' });
  const controls = h('div', { class: 'spot-controls' }, h('div', { class: 'period-nav' }, prev, title, next));
  if (sup) {
    const modeBtns = [['mine', 'Dein Preis'], ['spot', 'Börse netto']].map(([id, text]) => h('button', {
      type: 'button', class: mode === id ? 'on' : '', 'aria-pressed': mode === id ? 'true' : 'false',
      onclick: () => {
        if (mode === id) return;
        mode = id;
        state.spotMode = id;
        modeBtns.forEach((b, i) => { const on = ['mine', 'spot'][i] === id; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
        renderDay();
        renderPattern();
      },
    }, text));
    controls.append(h('div', { class: 'seg seg--small', role: 'group', 'aria-label': 'Preis' }, ...modeBtns));
  }
  body.append(controls);

  const dayBox = h('div', {});
  const winBox = h('div', {});
  const zoneBox = h('div', {});
  const patBox = h('div', {});
  const dayH2 = h('h2');
  const daySub = h('p', { class: 'panel-sub' });
  const resBtns = [[15, '15 Min'], [60, 'Stunde']].map(([id, text]) => h('button', {
    type: 'button', 'data-res': String(id),
    onclick: () => {
      if (res === id) return;
      res = id;
      state.settings.spotRes = id;
      ctx.saveSettings();
      renderDay();
    },
  }, text));
  const resSeg = h('div', { class: 'seg seg--small seg--res', role: 'group', 'aria-label': 'Raster' }, ...resBtns);
  const syncRes = (fine) => {
    const eff = !fine || hourlyTariff() ? 60 : res;
    resBtns.forEach((b) => {
      const id = Number(b.dataset.res);
      const on = id === eff;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.disabled = id === 15 && (!fine || hourlyTariff());
      b.title = id === 15 && !fine ? 'Vor Oktober 2025 gibt es nur Stundenpreise' : id === 15 && hourlyTariff() ? 'Dein Tarif rechnet je Stunde' : '';
    });
    return eff;
  };
  const winSub = h('p', { class: 'panel-sub' });
  body.append(
    h('section', { class: 'panel' }, h('div', { class: 'panel-head' }, dayH2, resSeg), daySub, dayBox),
    h('section', { class: 'panel' }, h('div', { class: 'panel-head' }, h('h2', { text: 'Günstigste und teuerste Zeiten' })), winSub, winBox),
    section('Wo ist es günstiger?', 'Tagesschnitt der Börsenpreise in Österreich und den Nachbarländern, netto in Cent je kWh.', zoneBox),
    section('Wann ist es meist günstig?', 'Stundenmittel über einen längeren Zeitraum.', patBox));

  if (!sup) {
    body.append(h('div', { class: 'notice notice--quiet notice--page' }, icon('info'),
      h('div', {}, h('p', { text: 'Hast du einen dynamischen Stromtarif? Dann trag ihn bei „Strompreis“ ein. Netzblick zeigt dir hier dann deinen Endpreis mit Aufschlag.' }),
        h('button', { class: 'btn btn--small', type: 'button', onclick: () => ctx.goto('tariff') }, 'Strompreis einstellen'))));
  } else {
    const pv = DYNAMIC_PROVIDERS.find((p) => p.id === sup.provider);
    body.append(h('p', { class: 'note note--page', text: `Dein Preis: Börsenpreis${sup.pct ? ` + ${num(sup.pct, 1)} %` : ''}, plus 20 % USt und ${num(sup.ct, 2)} ct Aufschlag${pv && pv.id !== 'other' ? ` (${pv.name})` : ''}, je ${sup.interval === 60 ? 'Stunde' : 'Viertelstunde'}. Ohne Netzkosten und Abgaben.` }));
  }
  body.append(h('p', { class: 'note note--page' },
    'Quelle: ', h('button', { class: 'link-btn', type: 'button', onclick: () => openExternal(SPOT_SOURCE.url) }, SPOT_SOURCE.label),
    ', Originaldaten: ', h('button', { class: 'link-btn', type: 'button', onclick: () => openExternal('https://www.smard.de/home') }, 'SMARD.de (Bundesnetzagentur)'),
    '. Netzblick vertritt keine Behörde.'));

  const hasDay = (d) => state.spot.series(d, addDays(d, 1)).some((x) => x.p != null);
  const syncNav = () => {
    title.textContent = dayTitle(day, now);
    prev.disabled = day <= SPOT_SINCE;
    next.disabled = day >= tomorrow || (day >= today && !hasDay(tomorrow));
  };
  const go = (d) => {
    day = startOfDay(d);
    state.spotDay = day;
    syncNav();
    loadDay().then(loadZones);
  };
  prev.addEventListener('click', () => go(addDays(day, -1)));
  next.addEventListener('click', () => go(addDays(day, 1)));
  title.addEventListener('click', () => { if (day.getTime() !== today.getTime()) go(today); });

  /* ---- 1) Der Tag */
  let dayToken = 0;
  async function loadDay() {
    const my = ++dayToken;
    syncNav();
    dayH2.textContent = 'Preise des Tages';
    dayBox.querySelectorAll('.chart').forEach((c) => charts.dispose(c));
    dayBox.textContent = '';
    dayBox.append(spinner('Lade Börsenpreise …'));
    winBox.textContent = '';
    let err = null;
    try { await state.spot.ensure(day, addDays(day, 1 + (day.getTime() === today.getTime() ? 1 : 0))); } catch (e) { err = e; }
    if (my !== dayToken || !body.isConnected) return;
    syncNav();
    renderDay(err);
  }

  function renderDay(err) {
    dayBox.querySelectorAll('.chart').forEach((c) => charts.dispose(c));
    dayBox.textContent = '';
    winBox.textContent = '';
    const raw = state.spot.series(day, addDays(day, 1));
    const fine = !raw.length || raw[0].step === 900000;
    const eff = syncRes(fine);
    const pts = priced(raw, eff === 60);
    const st = dayStats(pts);
    const step = pts.length ? pts[0].step : 900000;
    const per = step === 3600000 ? 'Stunde' : 'Viertelstunde';
    dayH2.textContent = `Preise je ${per}`;
    daySub.textContent = `${mode === 'mine' ? 'Dein Energiepreis brutto' : 'Börsenpreis netto ohne USt'}, in Cent je kWh.`;
    winSub.textContent = '';
    if (!st) {
      const msg = err ? err.message : day >= tomorrow ? 'Die Preise für morgen gibt es ab etwa 13 Uhr.' : 'Für diesen Tag gibt es keine Börsenpreise.';
      dayBox.append(h('p', { class: 'empty', text: msg }));
      winBox.append(h('p', { class: 'empty', text: '–' }));
      return;
    }
    const isToday = day.getTime() === today.getTime();
    const cur = isToday ? pts.find((x) => x.v != null && x.t <= now && now < new Date(x.t.getTime() + x.step)) : null;
    const scale = scaleAround(pts.map((x) => x.v), 0.3);
    scale.mid = st.avg;
    const endOf = (p) => new Date(p.t.getTime() + p.step);
    const chart = h('div', { class: 'chart chart--spotday' });
    append(dayBox,
      h('div', { class: 'kpis kpis--page' },
        kpiTile('Durchschnitt', ct(st.avg), `${ct(st.min.v, 1)} bis ${ct(st.max.v, 1)}`),
        kpiTile('Am günstigsten', `${time(st.min.t)} Uhr`, `${ct(st.min.v)} bis ${time(endOf(st.min))} Uhr`),
        kpiTile('Am teuersten', `${time(st.max.t)} Uhr`, `${ct(st.max.v)} bis ${time(endOf(st.max))} Uhr`),
        cur ? kpiTile('Jetzt', ct(cur.v), `${cur.v <= st.avg ? 'unter' : 'über'} dem Schnitt, bis ${time(endOf(cur))} Uhr`)
          : kpiTile('Spanne', ct(st.max.v - st.min.v), 'zwischen günstigster und teuerster')),
      chart,
      h('div', { class: 'seq-legend' },
        h('span', { text: 'günstiger' }),
        h('span', { class: 'seq-bar', style: `background:linear-gradient(90deg, ${charts.tokens().divBar.join(', ')})` }),
        h('span', { text: 'teurer als der Tagesschnitt' })),
      st.negative ? h('p', { class: 'note', text: `${st.negative} ${per === 'Stunde' ? (st.negative === 1 ? 'Stunde' : 'Stunden') : (st.negative === 1 ? 'Viertelstunde' : 'Viertelstunden')} mit negativem ${mode === 'mine' ? 'Preis: Du bekommst Geld für den Strom.' : 'Börsenpreis.'}` }) : null);
    const T = charts.tokens();
    charts.render(chart, charts.zoomable(charts.spotDayOption(T, { pts, step, now: isToday ? now : null, scale, label: label() }), T, pts.length, { min: 96 }));

    // Zeitfenster: heute ab jetzt, sonst der ganze Tag
    const from = cur ? cur.t : null;
    const list = from ? pts.filter((x) => x.t >= from) : pts;
    winSub.textContent = `${from ? 'Heute ab jetzt' : 'Am ganzen Tag'}, ${label()}. Praktisch für Waschmaschine, Geschirrspüler, Wärmepumpe oder das Laden des Autos.`;
    const rows = [1, 2, 3, 4].map((hrs) => {
      const w = windows(list, hrs);
      const cell = (x, cls) => h('td', { class: cls }, x ? [h('b', { text: span(x) }), h('br'), h('span', { class: 'win-sub', text: `Ø ${ct(x.avg)}` })] : '–');
      return h('tr', {}, h('th', { scope: 'row', text: hrs === 1 ? '1 Stunde' : `${hrs} Stunden` }), cell(w.cheap, 'win-cheap'), cell(w.dear, 'win-dear'));
    });
    const anyWin = windows(list, 1).cheap;
    winBox.append(anyWin
      ? h('table', { class: 'tbl tbl--win' },
        h('thead', {}, h('tr', {}, h('th', { scope: 'col', text: 'Dauer' }), h('th', { scope: 'col' }, h('span', { class: 'lg-key', style: `background:${charts.tokens().divBar[0]}` }), ' Am günstigsten'), h('th', { scope: 'col' }, h('span', { class: 'lg-key', style: `background:${charts.tokens().divBar[2]}` }), ' Am teuersten'))),
        h('tbody', {}, ...rows))
      : h('p', { class: 'empty', text: 'Heute bleibt keine ganze Stunde mehr. Schau dir morgen an.' }));
    if (!anyWin && hasDay(tomorrow)) winBox.append(h('button', { class: 'btn btn--small', type: 'button', onclick: () => go(tomorrow) }, 'Preise für morgen'));
  }

  /* ---- 2) Nachbarländer */
  let zoneToken = 0;
  async function loadZones() {
    const my = ++zoneToken;
    const d = day;
    zoneBox.querySelectorAll('.chart').forEach((c) => charts.dispose(c));
    zoneBox.textContent = '';
    const chart = h('div', { class: 'chart chart--zones' });
    const status = spinner(`Lade ${ZONES.length - 1} Nachbarländer …`);
    const summary = h('p', { class: 'zone-summary' });
    const foot = h('p', { class: 'note', text: 'Börsenpreise ohne Steuern, Netzkosten und Aufschläge. Die Slowakei fehlt, weil ihre Preise nicht frei weitergegeben werden dürfen.' });
    const tbody = h('tbody');
    const table = h('details', { class: 'peak-details zone-table', hidden: true }, h('summary', {}, 'Als Tabelle'),
      h('table', { class: 'tbl' },
        h('thead', {}, h('tr', {}, h('th', { scope: 'col', text: 'Land' }), h('th', { scope: 'col', class: 'num', text: 'Ø' }), h('th', { scope: 'col', class: 'num', text: 'günstigste' }), h('th', { scope: 'col', class: 'num', text: 'teuerste' }))),
        tbody));
    zoneBox.append(summary, chart, status, table, foot);
    const rows = [];
    const failed = [];
    const draw = () => {
      rows.sort((a, b) => a.avg - b.avg);
      chart.style.height = `${rows.length * 34 + 16}px`;
      charts.render(chart, charts.zonesOption(charts.tokens(), { rows }));
      table.hidden = false;
      tbody.textContent = '';
      for (const r of rows) {
        tbody.append(h('tr', { class: r.home ? 'is-max' : '' }, h('td', { text: r.name }),
          h('td', { class: 'num', text: ct(r.avg) }), h('td', { class: 'num', text: ct(r.min) }), h('td', { class: 'num', text: ct(r.max) })));
      }
      const home = rows.find((r) => r.home);
      const best = rows[0];
      if (!home) { summary.textContent = ''; return; }
      if (rows.length < 2) { summary.textContent = `Österreich: Ø ${ct(home.avg)}.`; return; }
      const rank = rows.indexOf(home) + 1;
      summary.textContent = best.home
        ? `Österreich hat an diesem Tag den niedrigsten Durchschnitt, Ø ${ct(home.avg)}.`
        : `Am günstigsten: ${best.name} mit Ø ${ct(best.avg)}, ${ct(home.avg - best.avg)} weniger als Österreich (Platz ${rank} von ${rows.length}).`;
    };
    for (const z of ZONES) {
      if (my !== zoneToken || !body.isConnected) return;
      const store = zoneStore(state, z.id);
      const monthStart = new Date(d.getFullYear(), d.getMonth(), 1);
      const needsFetch = !store.fresh(monthStart);
      let ok = false;
      for (let attempt = 0; attempt < 3 && !ok; attempt++) {
        try {
          await store.ensure(d, addDays(d, 1));
          ok = true;
        } catch (e) {
          if (e.busy && attempt < 2 && (e.retryAfter == null || e.retryAfter <= 20)) {
            status.lastChild.textContent = ` ${z.name}: Der Dienst bremst kurz, gleich geht es weiter …`;
            await wait(((e.retryAfter ?? 3) + 0.4) * 1000);
            if (my !== zoneToken || !body.isConnected) return;
            continue;
          }
          break;
        }
      }
      if (my !== zoneToken || !body.isConnected) return;
      const st = ok ? dayStats(store.series(d, addDays(d, 1)).map((x) => ({ t: x.t, v: x.p, step: x.step }))) : null;
      if (st) {
        rows.push({ id: z.id, name: z.name, avg: st.avg, min: st.min.v, max: st.max.v, home: z.id === 'AT' });
        draw();
      } else if (z.id === 'AT') {
        status.remove();
        chart.remove();
        table.remove();
        summary.remove();
        zoneBox.prepend(h('p', { class: 'empty', text: d >= tomorrow ? 'Die Preise für morgen gibt es ab etwa 13 Uhr.' : 'Für diesen Tag gibt es keine Börsenpreise.' }));
        return;
      } else failed.push(z.name);
      status.lastChild.textContent = ` ${rows.length} von ${ZONES.length} Ländern geladen …`;
      if (needsFetch && z !== ZONES[ZONES.length - 1]) await wait(700); // den Dienst nicht überfordern
    }
    status.remove();
    if (!rows.length) {
      chart.remove();
      table.remove();
      zoneBox.prepend(h('p', { class: 'empty', text: 'Für diesen Tag gibt es noch keine Preise.' }));
      return;
    }
    if (failed.length) {
      zoneBox.insertBefore(h('div', { class: 'zone-retry' },
        h('p', { class: 'hint', text: `Nicht geladen: ${failed.join(', ')}. Der Dienst für Börsenpreise war ausgelastet.` }),
        h('button', { class: 'btn btn--small', type: 'button', onclick: () => loadZones() }, 'Erneut versuchen')), foot);
    }
  }

  /* ---- 3) Muster über einen Zeitraum */
  const rangeRow = h('div', { class: 'chip-row chip-row--inline', role: 'group', 'aria-label': 'Zeitraum' });
  const patOut = h('div', {});
  patBox.append(rangeRow, patOut);
  const renderRangeRow = () => {
    rangeRow.textContent = '';
    for (const r of RANGES) {
      const on = r.id === range.id;
      rangeRow.append(h('button', {
        type: 'button', class: 'chip' + (on ? ' chip--active' : ''), 'aria-pressed': on ? 'true' : 'false',
        onclick: () => { if (range.id === r.id) return; range = r; state.spotRange = r.id; renderRangeRow(); loadPattern(); },
      }, r.label));
    }
  };
  let patToken = 0;
  let patErr = null;
  async function loadPattern() {
    const my = ++patToken;
    patOut.querySelectorAll('.chart').forEach((c) => charts.dispose(c));
    patOut.textContent = '';
    patOut.append(spinner(range.days > 100 ? 'Lade die Börsenpreise eines Jahres …' : 'Lade Börsenpreise …'));
    const to = tomorrow;
    const from = addDays(to, -range.days);
    patErr = null;
    try { await state.spot.ensure(from, to); } catch (e) { patErr = e; }
    if (my !== patToken || !body.isConnected) return;
    renderPattern();
  }

  function renderPattern() {
    patOut.querySelectorAll('.chart').forEach((c) => charts.dispose(c));
    patOut.textContent = '';
    const to = tomorrow;
    const from = addDays(to, -range.days);
    const raw = state.spot.series(from, to);
    const pts = priced(raw, false).filter((x) => x.v != null);
    if (!pts.length) {
      patOut.append(h('p', { class: 'empty', text: patErr ? patErr.message : 'Für diesen Zeitraum gibt es keine Börsenpreise.' }));
      return;
    }
    const cp = carpet(pts, from, to);
    const scale = scaleAround(cp.cells.map((c) => c[2]), 0.5);
    const prof = profile(pts);
    const ex = extremeHours(prof.weekday) || extremeHours(prof.weekend);
    const T = charts.tokens();
    const carpetChart = h('div', { class: 'chart chart--spotcarpet' });
    const profChart = h('div', { class: 'chart chart--spotprofile' });
    const st = dayStats(pts);
    const negHours = pts.reduce((a, x) => (x.v < 0 ? a + x.step / 3600000 : a), 0);
    append(patOut,
      h('div', { class: 'kpis kpis--page' },
        kpiTile('Durchschnitt', ct(st.avg), label()),
        kpiTile('Meist am günstigsten', ex ? hourRange(ex.cheap.hour) : '–', ex ? `Ø ${ct(ex.cheap.v)} an Werktagen` : ''),
        kpiTile('Meist am teuersten', ex ? hourRange(ex.dear.hour) : '–', ex ? `Ø ${ct(ex.dear.v)} an Werktagen` : ''),
        kpiTile('Negative Preise', negHours ? duration(negHours) : 'keine', negHours ? 'insgesamt in diesem Zeitraum' : 'in diesem Zeitraum')),
      h('h3', { class: 'sub-title', text: 'Jeder Tag, Stunde für Stunde' }),
      carpetChart,
      h('div', { class: 'seq-legend' },
        h('span', { text: 'günstiger' }),
        h('span', { class: 'seq-bar', style: `background:linear-gradient(90deg, ${T.div.join(', ')})` }),
        h('span', { text: `teurer als Ø ${ct(scale.mid, 1)}` })),
      h('h3', { class: 'sub-title', text: 'Typischer Tagesverlauf' }),
      h('div', { class: 'legend legend--static' },
        prof.weekday ? h('span', { class: 'lg' }, h('span', { class: 'lg-key lg-key--line', style: `background:${T.s[0]}` }), 'Werktage') : null,
        prof.weekend ? h('span', { class: 'lg' }, h('span', { class: 'lg-key lg-key--line', style: `background:${T.s[1]}` }), 'Wochenende') : null),
      profChart,
      ex ? h('p', { class: 'note', text: `An Werktagen ist Strom an der Börse im Schnitt zwischen ${hourRange(ex.cheap.hour)} am günstigsten und zwischen ${hourRange(ex.dear.hour)} am teuersten.` }) : null);
    charts.render(carpetChart, charts.spotCarpetOption(T, { days: cp.days, cells: cp.cells, scale, label: label() }));
    charts.render(profChart, charts.spotProfileOption(T, { weekday: prof.weekday, weekend: prof.weekend, label: label() }));
  }

  renderRangeRow();
  syncNav();
  // nacheinander, damit der Dienst nicht viele Abfragen gleichzeitig bekommt
  loadDay().then(() => (body.isConnected ? loadPattern() : null)).then(() => (body.isConnected ? loadZones() : null));
}
