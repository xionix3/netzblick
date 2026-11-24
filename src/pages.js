// Seiten neben der Verbrauchsansicht: Anlagen, Abrechnung, Konto, Info
import { h, icon, toast, row, brandMark, spinBrand, fillIcons } from './ui.js';
import { meterLabel, firstDataDate } from './model.js';
import { parseBillingPeriod } from './kundenportal.js';
import { billingYearStatus, consumptionFor } from './billing.js';
import { yearCost, meterCost, sumCosts, supplierFor, forYear, powerCharge, tariffClassOf } from './costs.js';
import { GRID, LEVIES, METERING, VAT, STAND, PRICE_SOURCES, TARIFF_CALCULATOR, OUTAGE, CONTACT, POWER_TARIFF, DYNAMIC_PROVIDERS, PRIVACY_URL, OFFICIAL_SOURCES, GOV_DISCLAIMER, ecTypeLabel, DONATE } from './netzdaten.js';
import { dynamicPrice, SPOT_SOURCE } from './spot.js';
import { currentFactor } from './kundenportal.js';
import { reminderIcs, reminderTime } from './reminder.js';
import { makePeriod, addDays, startOfDay, daysBetween } from './time.js';
import { num, kwh, kw, euro, pct, dateNum, dateLong, time, MONTHS_LONG, MONTHS_SHORT } from './format.js';
import { costParts, costTotal, costTable, costNotes } from './costview.js';
import * as charts from './charts.js';
import { secure, saveSettings, scheduleReminder, cancelReminder, reminderPending, shareFile, openExternal, isNative, isDesktop } from './platform.js';
import { cacheClear } from './cache.js';
import { ApiError } from './api.js';

/* ------------------------------------------------------------ Bausteine */
const section = (title, sub, ...kids) => h('section', { class: 'panel' },
  title ? h('div', { class: 'panel-head' }, h('h2', { text: title })) : null,
  sub ? h('p', { class: 'panel-sub', text: sub }) : null,
  ...kids);
const stack = (r) => { if (r) r.classList.add('dl-row--stack'); return r; };
const dl = (...rows) => h('dl', { class: 'dl' }, ...rows.filter(Boolean));
const monthYear = (d) => `${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
const GRID_LEVELS = { 7: 'Niederspannung', 6: 'Umspannung Mittel-/Niederspannung', 5: 'Mittelspannung', 4: 'Umspannung Hoch-/Mittelspannung', 3: 'Hochspannung' };

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Kopiert');
  } catch {
    toast('Kopieren nicht möglich');
  }
}

/** Zustand der Kundenportal-Daten als Hinweis (lädt, Fehler, ausgeschaltet) */
function kpNotice(ctx) {
  const { state } = ctx;
  if (state.settings.kundenportal === 'off') {
    return h('div', { class: 'banner banner--info' }, icon('info'),
      h('span', { text: 'Das Kundenportal ist ausgeschaltet. Mit ihm siehst du Zählernummer, Lieferant, Verträge und abgerechnete Verbräuche.' }),
      h('button', { class: 'btn btn--small', type: 'button', onclick: () => { state.settings.kundenportal = 'auto'; ctx.saveSettings(); ctx.ensureKp({ force: true }).catch(() => {}); ctx.renderPage(); } }, 'Einschalten'));
  }
  if (state.kpPromise && !state.kpData) {
    return h('div', { class: 'banner banner--info' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), h('span', { text: 'Lade Daten aus dem Kundenportal …' }));
  }
  if (state.kpError && !state.kpData) {
    return h('div', { class: 'banner' }, icon('warn'),
      h('span', { text: `Kundenportal: ${state.kpError instanceof ApiError ? state.kpError.message : 'Die Daten konnten nicht geladen werden.'}` }),
      h('button', { class: 'btn btn--small', type: 'button', onclick: () => { ctx.ensureKp({ force: true }).catch(() => {}); ctx.renderPage(); } }, 'Erneut versuchen'),
      h('button', { class: 'btn btn--small', type: 'button', onclick: () => ctx.goto('account') }, 'Zugang prüfen'));
  }
  if (state.kpData && state.kpData.errors.length) {
    return h('p', { class: 'note note--page', text: `Nicht alles aus dem Kundenportal ließ sich laden: ${state.kpData.errors.join(' ')}` });
  }
  return null;
}

/* ================================================================ Anlagen */
export function renderPlants(body, ctx) {
  const { state, names } = ctx;
  body.append(h('p', { class: 'page-lead', text: 'Deine Zählpunkte mit den Angaben aus dem Smart-Meter-Portal und dem Kundenportal.' }));
  const notice = kpNotice(ctx);
  if (notice) body.append(notice);

  const pods = state.kpData ? state.kpData.pods : [];
  const ids = [...state.mps.map((m) => m.id), ...pods.map((p) => p.id).filter((id) => !state.mps.some((m) => m.id === id))];
  const grid = h('div', { class: 'cards' });
  body.append(grid);
  for (const id of ids) {
    const mp = state.mps.find((m) => m.id === id) || null;
    const pod = pods.find((p) => p.id === id) || null;
    const title = mp ? meterLabel(mp, names, { compact: !names[id] }) : id;
    const reading = state.readings.get(id);
    const flows = mp ? Object.keys(mp.flows) : [];
    const q15 = mp && mp.flows.consumption && mp.flows.consumption.q15;
    const first = mp ? firstDataDate([mp], 'consumption') : null;
    const a = mp && mp.address;
    const address = pod && pod.address ? pod.address : a && a.street ? `${a.street} ${a.houseNumber || ''}, ${a.postalCode || ''} ${a.city || ''}`.replace(/\s+/g, ' ').trim() : null;

    const card = h('section', { class: 'panel card' },
      h('div', { class: 'card-head' },
        h('span', { class: 'lg-key lg-key--big', style: `background:${mp ? ctx.meterColor(mp) : 'var(--older)'}` }),
        h('h2', { text: title }),
        mp ? h('button', { class: 'btn btn--small', type: 'button', onclick: () => ctx.showUsage([id]) }, icon('chart'), 'Verbrauch') : null),
      dl(
        stack(row('Zählpunktnummer', h('span', { class: 'idline' }, h('span', { class: 'mono', text: id }), h('button', { class: 'icon-btn icon-btn--small', type: 'button', 'aria-label': 'Zählpunktnummer kopieren', onclick: () => copy(id) }, icon('copy'))))),
        names[id] ? row('Eigener Name', names[id]) : null,
        row('Adresse', address),
        row('Zählernummer', pod && pod.meterNr ? h('span', { class: 'mono', text: pod.meterNr }) : null),
        row('Gerät', pod && pod.deviceType),
        reading ? row('Zählerstand', `${num(reading.reading, 1)} kWh, ${dateNum(reading.t)} ${time(reading.t)} Uhr`) : null,
        mp ? row('Messwerte', [q15 ? `Viertelstunden seit ${dateNum(q15.start)}` : null, first ? `Tageswerte seit ${dateNum(first)}` : null].filter(Boolean).join(', ') || null) : row('Smart-Meter-Portal', 'Nicht im Smart-Meter-Portal freigeschaltet'),
        mp ? row('Richtung', flows.includes('feedin') ? 'Bezug und Einspeisung' : 'Bezug') : null,
        pod && pod.tariffClass ? row('Netztarif', String(pod.tariffClass).toUpperCase() === 'U' ? 'unterbrechbar (z. B. Wärmepumpe)' : 'Haushalt, ohne Leistungsmessung') : null,
        pod && pod.gridLevel != null ? row('Netzebene', `${pod.gridLevel}${GRID_LEVELS[pod.gridLevel] ? ` (${GRID_LEVELS[pod.gridLevel]})` : ''}`) : null,
        row('Lastprofil', pod && pod.loadProfile),
        row('Lieferant', pod && pod.supplier),
        pod && pod.contractFrom && !isNaN(pod.contractFrom) ? row('Vertrag seit', dateNum(pod.contractFrom)) : null,
        row('Letzte Abrechnung', pod && pod.lastBillingPeriod),
        pod && pod.communities && pod.communities.length ? row('Energiegemeinschaft', h('span', { class: 'ec-inline' },
          ...pod.communities.map((c) => h('span', {}, `${ecTypeLabel(c.type)}${c.status !== 'aktiv' ? ` (${c.status})` : ''}${currentFactor(pod, c.id) != null ? `, ${num(currentFactor(pod, c.id), 0)} %` : ''}`)),
          h('button', { class: 'link-btn', type: 'button', onclick: () => ctx.goto('community') }, 'Details'))) : null,
      ));
    grid.append(card);
  }
  if (!ids.length) body.append(h('p', { class: 'empty', text: 'Keine Zählpunkte gefunden.' }));
}

/* ================================================================ Abrechnung */
export function renderBilling(body, ctx) {
  const { state, names } = ctx;
  body.append(h('p', { class: 'page-lead', text: 'Abgerechnete Verbräuche aus dem Kundenportal, verbunden mit den Messwerten deines Smart Meters.' }));
  const notice = kpNotice(ctx);
  if (notice) body.append(notice);
  const kp = state.kpData;
  if (!kp) return;
  const T = charts.tokens();

  // 1) Laufendes Abrechnungsjahr je Zählpunkt
  for (const mp of state.mps) {
    const pod = kp.pods.find((p) => p.id === mp.id);
    const last = pod && parseBillingPeriod(pod.lastBillingPeriod);
    if (!last || !mp.flows.consumption) continue;
    const cons = consumptionFor(kp, pod);
    const billedLast = cons ? cons.periods.find((p) => p.label === pod.lastBillingPeriod) || null : null;
    const billedKwh = billedLast ? billedLast.kwh : cons && cons.years.length ? cons.years[cons.years.length - 1].kwh : null;
    const billingEntry = cons ? kp.billing.find((b) => b.contract.nr === cons.contractAccount) : null;
    const box = h('div', { class: 'billing-year' }, h('p', { class: 'hint', text: 'Rechne …' }));
    const panel = section(`Abrechnungsjahr seit ${monthYear(last.to)}`, `${meterLabel(mp, names, { compact: !names[mp.id] })}. Letzte Abrechnung: ${pod.lastBillingPeriod}.`, box);
    body.append(panel);
    billingYearStatus(state.store, mp, last).then(async (st) => {
      // dynamischer Tarif: Hochrechnung mit dem mittleren Börsenpreis der letzten 12 Monate
      let spotFlat = null;
      const sup0 = ctx.costOptions(mp).supplier;
      if (sup0 && sup0.kind === 'dynamic') {
        const t1 = startOfDay(new Date());
        await ctx.ensureSpot(addDays(t1, -365), t1, [mp.id]);
        spotFlat = state.spot ? state.spot.avg(addDays(t1, -365), t1) : null;
      }
      if (!box.isConnected) return;
      box.textContent = '';
      if (!st || st.sum == null) { box.append(h('p', { class: 'empty', text: 'Für das laufende Abrechnungsjahr liegen noch keine Messwerte vor.' })); return; }
      const endLabel = dateLong(addDays(st.curEnd, -1));
      const fullLast = st.lastDays >= 300; // keine Zwischenabrechnung
      const compareBase = st.prevTotal || (fullLast ? billedKwh : null);
      const change = st.projection && compareBase ? (st.projection - compareBase) / compareBase : null;
      box.append(
        h('div', { class: 'big-figure' }, h('span', { class: 'big-value', text: num(st.sum, 0) }), h('span', { class: 'big-unit', text: 'kWh' })),
        h('p', { class: 'big-label', text: `verbraucht seit ${dateNum(st.curStart)}, Messwerte bis ${dateNum(addDays(st.upto, -1))}` }),
        dl(
          row('Hochrechnung', st.projection ? `${kwh(st.projection)} bis ${endLabel}` : `ab 14 Tagen mit Messwerten (jetzt ${st.covered})`),
          st.projection ? row('Rechenweg', st.method === 'vorjahr' ? 'mit dem Verlauf der 12 Monate davor (Winter zählt mehr als Sommer)' : 'gleichmäßig weitergerechnet (kein Vorjahr zum Vergleich)') : null,
          change != null ? row('Gegenüber den 12 Monaten davor', `${change >= 0 ? '+' : '−'}${pct(Math.abs(change), 1)}${change > 0.02 ? ', mehr als zuletzt' : change < -0.02 ? ', weniger als zuletzt' : ', etwa gleich'}`) : null,
          row('12 Monate davor gemessen', st.prevTotal ? kwh(st.prevTotal) : null),
          row(fullLast ? 'Letzte Abrechnung gemessen' : `Letzte Abrechnung (${num(st.lastDays, 0)} Tage) gemessen`, st.lastSum ? kwh(st.lastSum) : null),
          row('Letzte Abrechnung abgerechnet', billedLast ? kwh(billedLast.kwh) : null),
        ),
      );
      // Kosten gegen Teilbeträge
      const opts = ctx.costOptions(mp);
      const legacy = state.settings.pricePerKwh != null && !opts.supplier;
      if (st.projection) {
        const yc = yearCost(st.projection, { year: st.curStart.getFullYear(), ...opts, spotFlat });
        const cost = legacy ? st.projection * state.settings.pricePerKwh + (state.settings.feePerMonth || 0) * 12 : yc.total != null ? yc.total : yc.withoutSupplier;
        const plan = billingEntry && billingEntry.partPayments && !billingEntry.partPayments.external ? billingEntry.partPayments.installments : [];
        const inYear = plan.filter((x) => x.due && x.due >= st.curStart && x.due < st.curEnd);
        const paid = inYear.reduce((a, x) => a + (x.amount || 0), 0);
        box.append(dl(
          row(yc.total != null || legacy ? 'Kosten hochgerechnet' : 'Netz und Abgaben hochgerechnet', `${euro(cost)} für 12 Monate${legacy ? '' : ', mit Netzpreisen von Netz Burgenland, ohne Sommer-Niedertarif'}${spotFlat != null ? `, Energie mit dem mittleren Börsenpreis der letzten 12 Monate (${num(spotFlat, 1)} ct netto)` : ''}`),
          inYear.length && (yc.total != null || legacy) ? row('Teilbeträge im Jahr', `${euro(paid)} (${inYear.length} × ${euro(inYear[0].amount)})`) : null,
          inYear.length && (yc.total != null || legacy) ? row(cost > paid ? 'Nachzahlung ca.' : 'Guthaben ca.', euro(Math.abs(cost - paid))) : null,
        ));
        if (yc.total == null && !legacy) box.append(h('button', { class: 'pill pill--link', type: 'button', onclick: () => ctx.goto('tariff') }, 'Preis deines Lieferanten eintragen, um alle Kosten hochzurechnen'));
      }
      const yesterday = addDays(startOfDay(new Date()), -1);
      box.append(h('div', { class: 'sheet-actions' }, h('button', {
        class: 'btn btn--ghost', type: 'button',
        onclick: () => ctx.showUsage([mp.id], makePeriod('custom', st.curStart, { from: st.curStart, to: yesterday < st.curStart ? st.curStart : yesterday })),
      }, icon('chart'), 'Im Verbrauch ansehen')));
      fillIcons(box);
    }).catch((e) => {
      box.textContent = '';
      box.append(h('p', { class: 'empty', text: e instanceof ApiError ? e.message : 'Messwerte konnten nicht geladen werden.' }));
    });
  }

  // 2) Abgerechnete Jahresverbräuche je Vertragskonto
  for (const c of kp.consumption) {
    const labels = c.periods.length ? c.periods.map((p) => p.label) : c.years.map((y) => String(y.year));
    const values = c.periods.length ? c.periods.map((p) => p.kwh) : c.years.map((y) => y.kwh);
    if (!values.length) continue;
    const chart = h('div', { class: 'chart chart--billed' });
    const rows = labels.map((l, i) => {
      const prev = i > 0 ? values[i - 1] : null;
      const ch = prev ? (values[i] - prev) / prev : null;
      return h('tr', {}, h('td', { text: l }), h('td', { class: 'num', text: num(values[i], 0) }), h('td', { class: 'num', text: ch == null ? '' : `${ch >= 0 ? '+' : '−'}${pct(Math.abs(ch), 1)}` }));
    }).reverse();
    body.append(section('Abgerechnete Jahresverbräuche', `${c.description || 'Vertragskonto'} (Vertragskonto ${c.contractAccount})${c.active === false ? ', beendet' : ''}`,
      chart,
      h('div', { class: 'tbl-scroll' }, h('table', { class: 'tbl' },
        h('thead', {}, h('tr', {}, h('th', { scope: 'col', text: 'Abrechnungsjahr' }), h('th', { scope: 'col', class: 'num', text: 'kWh' }), h('th', { scope: 'col', class: 'num', text: 'Änderung' }))),
        h('tbody', {}, ...rows)))));
    charts.render(chart, charts.billedYearsOption(T, labels, values));
  }

  // 3) Rechnungen und Teilbeträge
  for (const b of kp.billing) {
    const c = b.contract;
    const kids = [];
    if (b.bills.external || c.externalInvoicing) {
      kids.push(h('p', { class: 'panel-text', text: `Die Rechnungen für dieses Vertragskonto stellt ${c.invoicedBy || 'dein Stromlieferant'} aus. Rechnungen und Teilbeträge stehen deshalb nicht im Kundenportal von Netz Burgenland.` }));
    } else {
      const pp = b.partPayments;
      const next = pp && pp.installments.find((x) => x.open > 0 && x.due >= startOfDay(new Date()));
      if (next) kids.push(h('div', { class: 'callout' }, h('span', { text: 'Nächster Teilbetrag' }), h('b', { text: `${euro(next.amount)} am ${dateNum(next.due)}` })));
      if (b.bills.bills.length) {
        kids.push(h('h3', { class: 'sub-h', text: 'Rechnungen' }), h('div', { class: 'tbl-scroll' }, h('table', { class: 'tbl' },
          h('thead', {}, h('tr', {}, h('th', { scope: 'col', text: 'Zeitraum' }), h('th', { scope: 'col', class: 'num', text: 'Betrag' }))),
          h('tbody', {}, ...b.bills.bills.map((x) => h('tr', {},
            h('td', { text: x.from && x.to ? `${dateNum(x.from)} bis ${dateNum(x.to)}` : x.nr || '' }),
            h('td', { class: 'num', text: x.amount == null ? '–' : euro(x.amount) })))))));
      } else if (b.bills.error) kids.push(h('p', { class: 'empty', text: `Rechnungen: ${b.bills.error}` }));
      if (pp && pp.installments.length) {
        kids.push(h('h3', { class: 'sub-h', text: 'Teilbeträge' }), h('div', { class: 'tbl-scroll' }, h('table', { class: 'tbl' },
          h('thead', {}, h('tr', {}, h('th', { scope: 'col', text: 'Fällig am' }), h('th', { scope: 'col', class: 'num', text: 'Betrag' }), h('th', { scope: 'col', text: 'Status' }))),
          h('tbody', {}, ...pp.installments.map((x) => h('tr', { class: x === next ? 'is-max' : '' },
            h('td', { text: x.due ? dateNum(x.due) : '–' }),
            h('td', { class: 'num', text: euro(x.amount) }),
            h('td', { text: x.open > 0 ? 'offen' : 'bezahlt' })))))));
      }
      if (!kids.length) kids.push(h('p', { class: 'empty', text: 'Keine Rechnungen oder Teilbeträge gefunden.' }));
    }
    body.append(section(`Rechnungen, ${c.description || 'Vertragskonto ' + c.nr}`, `Vertragskonto ${c.nr}${c.kinds.length ? `, ${c.kinds.join(', ')}` : ''}`, ...kids));
  }
  if (!kp.consumption.length && !kp.billing.length && !kp.pods.some((p) => p.lastBillingPeriod)) {
    body.append(h('p', { class: 'empty', text: 'Im Kundenportal sind keine Abrechnungsdaten hinterlegt.' }));
  }
}

/* ================================================================ Konto */
export function renderAccount(body, ctx) {
  const { state } = ctx;
  const acc = state.accounts[0];
  const status = (ok, text) => h('p', { class: 'status ' + (ok ? 'is-ok' : 'is-off') }, h('span', { class: 'status-dot', 'aria-hidden': 'true' }), text);

  body.append(section('Smart-Meter-Portal', 'smartmeter.netzburgenland.at, liefert die Messwerte.',
    status(true, state.demo ? 'Demo mit Beispieldaten' : 'Angemeldet'),
    dl(
      row('Konto', acc ? acc.displayName || acc.email : null),
      row('Zählpunkte', String(state.mps.length)),
    ),
    h('div', { class: 'sheet-actions' }, h('button', { class: 'btn btn--ghost', type: 'button', onclick: ctx.logout }, icon('logout'), state.demo ? 'Demo beenden' : 'Abmelden'))));

  // Kundenportal
  const mode = state.settings.kundenportal;
  const kp = state.kp;
  let st;
  if (mode === 'off') st = status(false, 'Ausgeschaltet');
  else if (state.kpPromise && !state.kpData) st = status(false, 'Verbinde …');
  else if (state.kpData) st = status(true, kp && kp.source === 'eigene' ? 'Verbunden mit eigenen Zugangsdaten' : 'Verbunden über die Smart-Meter-Anmeldung');
  else if (state.kpError) st = status(false, `Nicht verbunden: ${state.kpError.message}`);
  else st = status(false, 'Noch nicht verbunden');

  const modeBtns = [['auto', 'Wie Smart Meter'], ['own', 'Eigene Zugangsdaten'], ['off', 'Aus']].map(([id, label]) => h('button', {
    type: 'button', class: mode === id ? 'on' : '', 'aria-pressed': mode === id ? 'true' : 'false',
    onclick: () => {
      state.settings.kundenportal = id;
      ctx.saveSettings();
      state.kpData = null; state.kpError = null; state.kp = null;
      if (id === 'auto') ctx.ensureKp({ force: true }).catch(() => {});
      if (id === 'off') { secure.remove('kpUser').catch(() => {}); secure.remove('kpPass').catch(() => {}); }
      ctx.renderPage();
    },
  }, label));

  const kids = [st, h('div', { class: 'seg seg--small seg--wrap', role: 'group', 'aria-label': 'Zugang zum Kundenportal' }, ...modeBtns)];
  if (mode === 'auto') kids.push(h('p', { class: 'hint', text: 'Beide Portale nutzen dieselbe Anmeldung von Netz Burgenland. Netzblick verwendet dafür den Zugang des Smart-Meter-Portals, ohne zweites Passwort.' }));
  if (mode === 'own') {
    const email = h('input', { class: 'input', type: 'email', autocomplete: 'username', autocapitalize: 'off', spellcheck: 'false', placeholder: 'E-Mail-Adresse' });
    const pass = h('input', { class: 'input', type: 'password', autocomplete: 'current-password', placeholder: 'Passwort' });
    const err = h('p', { class: 'form-error', role: 'alert', hidden: true });
    secure.get('kpUser').then((v) => { if (v && !email.value) email.value = v; }).catch(() => {});
    const form = h('form', {
      class: 'form form--inline', novalidate: true,
      onsubmit: async (e) => {
        e.preventDefault();
        const em = email.value.trim(), pw = pass.value;
        if (!em || !pw) { err.textContent = 'Bitte E-Mail und Passwort eingeben.'; err.hidden = false; return; }
        if (ctx.PREVIEW) { err.textContent = 'In der Web-Vorschau gibt es nur Beispieldaten.'; err.hidden = false; return; }
        const btn = form.querySelector('button[type=submit]');
        btn.disabled = true; btn.textContent = 'Verbinde …'; err.hidden = true;
        state.kpCreds = { email: em, password: pw };
        try {
          state.kp = null;
          await ctx.ensureKp({ force: true });
          if (!state.demo) { await secure.set('kpUser', em).catch(() => {}); await secure.set('kpPass', pw).catch(() => {}); }
          toast('Mit dem Kundenportal verbunden');
        } catch (ex) {
          err.textContent = ex instanceof ApiError ? ex.message : 'Verbindung fehlgeschlagen.';
          err.hidden = false;
          btn.disabled = false; btn.textContent = 'Verbinden';
        }
      },
    },
    h('label', { class: 'field' }, h('span', { text: 'E-Mail für portal.netzburgenland.at' }), email),
    h('label', { class: 'field' }, h('span', { text: 'Passwort' }), pass),
    err,
    h('button', { class: 'btn btn--primary', type: 'submit' }, 'Verbinden'),
    h('p', { class: 'hint', text: 'Die Zugangsdaten werden verschlüsselt auf diesem Gerät gespeichert und nur an api.portal.netzburgenland.at geschickt.' }));
    kids.push(form);
  }
  const p = state.kpData && state.kpData.profile;
  if (p) {
    kids.push(dl(
      row('Name', p.name),
      row('Kundennummer', p.customerNr ? h('span', { class: 'mono', text: p.customerNr }) : null),
      row('E-Mail', p.email),
      row('Adresse', p.address),
      row('Post elektronisch', p.eCorrespondence ? 'ja' : 'nein'),
      state.kpData.linkedCustomers.length ? row('Verknüpfte Kunden', String(state.kpData.linkedCustomers.length)) : null,
      state.kpData.contracts.length ? row('Verträge', `${state.kpData.contracts.filter((c) => c.active).length} aktiv${state.kpData.contracts.some((c) => !c.active) ? `, ${state.kpData.contracts.filter((c) => !c.active).length} beendet` : ''}`) : null,
    ));
  }
  body.append(section('Kundenportal', 'portal.netzburgenland.at, liefert Anlagen, Verträge und Abrechnungen.', ...kids));

  body.append(section('Daten auf diesem Gerät', 'Messwerte werden zwischengespeichert, damit die App schnell startet und offline etwas zeigt.',
    h('div', { class: 'sheet-actions' }, h('button', { class: 'btn btn--ghost', type: 'button', onclick: () => { cacheClear(); toast('Zwischenspeicher geleert'); } }, 'Zwischenspeicher leeren'))));
}

/* ================================================================ Info */
export function renderInfo(body, ctx) {
  const mark = brandMark('lg');
  spinBrand(mark, ['0', '0', '0'], false);
  const hero = h('section', { class: 'info-hero' },
    mark,
    h('h2', { class: 'info-name', text: 'Netzblick' }),
    h('p', { class: 'info-tag', text: 'Deinen Stromverbrauch im Blick' }),
    h('p', { class: 'info-ver', text: `Version ${ctx.APP_VERSION}` }),
    isDesktop && !ctx.PREVIEW ? h('button', { class: 'btn btn--small', type: 'button', onclick: () => ctx.checkForUpdate({ manual: true }) }, 'Nach neuer Version suchen') : null);
  body.append(hero);
  requestAnimationFrame(() => requestAnimationFrame(() => spinBrand(mark, ['1', '8', '0'])));

  const list = (...items) => h('ul', { class: 'plain-list' }, ...items.map((x) => h('li', {}, x)));
  body.append(
    section('Von', null,
      h('div', { class: 'maker' },
        h('img', { class: 'maker-logo maker-logo--sm', src: 'brand/geister-it.webp', alt: 'Logo von geister-it', width: '56', height: '56' }),
        h('div', {},
          h('p', { class: 'panel-text' }, 'geister-it'),
          h('p', { class: 'panel-text' }, h('a', { href: 'mailto:patrick-schloegl@gmx.at', class: 'link' }, 'patrick-schloegl@gmx.at')),
          h('button', { class: 'link-btn', type: 'button', onclick: () => openExternal('https://www.geister-it.at') }, icon('external'), 'www.geister-it.at')))),
    // body.append ist das native append: null würde als Text „null“ erscheinen, darum als Liste einfügen
    ...(isDesktop && DONATE.length ? [section('Netzblick unterstützen', 'Netzblick ist kostenlos, ohne Werbung und ohne Tracking. Wenn es dir hilft, freue ich mich über einen Kaffee.',
      h('div', { class: 'btn-row' }, ...DONATE.map((d) => h('button', { class: 'btn btn--primary', type: 'button', onclick: () => openExternal(d.url) }, icon('coffee'), d.label))))] : []),
    section('Woher die Daten kommen', null, list(
      'Messwerte und Zählerstände: Smart-Meter-Portal von Netz Burgenland (smartmeter.netzburgenland.at)',
      'Anlagen, Verträge und Abrechnungen: Kundenportal von Netz Burgenland (portal.netzburgenland.at)',
      'Börsenpreise: Energy-Charts (Fraunhofer ISE), Daten Bundesnetzagentur | SMARD.de, CC BY 4.0',
    )),
    section('Datenschutz', null, list(
      isDesktop ? 'Zugangsdaten liegen bei „Angemeldet bleiben“ im Schlüsselbund deines Computers.' : 'Zugangsdaten werden verschlüsselt im Android-Schlüsselspeicher dieses Geräts abgelegt.',
      'Deine Zugangsdaten und Messwerte gehen nur an die beiden Portale von Netz Burgenland. Für die Börsenpreise fragt Netzblick bei Energy-Charts nur Preiszone und Zeitraum ab, keine Daten über dich.',
      'Es gibt keinen eigenen Server, keine Werbung und keine Analyse.',
      'Abmelden löscht Zugangsdaten und zwischengespeicherte Messwerte.',
    ),
    h('button', { class: 'link-btn', type: 'button', onclick: () => openExternal(PRIVACY_URL) }, icon('external'), 'Vollständige Datenschutzerklärung')),
    section('Quellen und Hinweis', null,
      h('p', { class: 'panel-text', text: `${GOV_DISCLAIMER} Kosten und Hochrechnungen sind Schätzungen.` }),
      sourceList(OFFICIAL_SOURCES)),
    section('Verwendete Bausteine', null, list(
      'Apache ECharts, Apache-Lizenz 2.0',
      'Capacitor, MIT-Lizenz',
      'Schrift Barlow, SIL Open Font License 1.1',
    )),
    h('p', { class: 'fineprint fineprint--page', text: '© 2026 geister-it. Netzblick steht unter der MIT-Lizenz.' }),
  );
}

/* ================================================================ Strompreis und Erinnerung */
const parseInput = (el) => {
  const x = parseFloat(String(el.value).replace(',', '.'));
  return isFinite(x) && x >= 0 ? x : null;
};
const ct = (x, d = 2) => `${num(x, d)} ct`;
const latestYear = (table) => {
  const now = new Date().getFullYear();
  if (table[now]) return now;
  return Math.max(...Object.keys(table).map(Number));
};

export function renderTariff(body, ctx) {
  const { state, names } = ctx;
  const s = state.settings;
  s.supplier = s.supplier || { all: {}, meters: {} };
  s.supplier.all = s.supplier.all || {};
  s.supplier.meters = s.supplier.meters || {};
  const pods = state.kpData ? state.kpData.pods : [];
  const kpSupplier = (pods.find((p) => p.supplier) || {}).supplier || '';
  body.append(h('p', { class: 'page-lead', text: 'Deine Stromrechnung hat drei Teile: Energie vom Lieferanten, Netzkosten von Netz Burgenland sowie Steuern und Abgaben. Den Energiepreis trägst du ein, den Rest rechnet Netzblick nach den offiziellen Preisen.' }));

  /* ---- 1) Lieferant: Fixpreis oder dynamisch (Börsenpreis + Aufschlag) */
  const numIn = (val, ph) => h('input', { class: 'input', type: 'number', inputmode: 'decimal', step: '0.01', placeholder: ph, value: val != null ? String(val) : '' });
  const contract = s.contract || {};
  const all = s.supplier.all;
  // Vorbelegt mit dem Lieferanten laut Kundenportal, solange du keinen eigenen Namen gespeichert hast
  const nameIn = h('input', { class: 'input', type: 'text', maxlength: '60', placeholder: 'z. B. Burgenland Energie', value: contract.supplier || kpSupplier });
  const apIn = numIn(all.ap, 'z. B. 14,9');
  const gpIn = numIn(all.gp, 'z. B. 3,9');
  let tariffKind = all.kind === 'dynamic' ? 'dynamic' : 'fixed';
  let provider = all.provider || 'awattar';
  let interval = all.interval === 60 ? 60 : all.interval === 15 ? 15 : (DYNAMIC_PROVIDERS.find((p) => p.id === provider) || {}).interval || 15;
  const ctIn = numIn(all.ct, 'z. B. 1,8');
  const pctIn = numIn(all.pct, '0');
  const dgpIn = numIn(all.dgp, 'z. B. 4,58');
  const onceIn = h('input', { type: 'checkbox', checked: all.gpOnce ? true : null });
  const provSel = h('select', { class: 'select' }, ...DYNAMIC_PROVIDERS.map((p) => h('option', { value: p.id, selected: p.id === provider ? true : null }, p.name)));
  const provInfo = h('p', { class: 'hint' });
  const ivBtns = [[15, 'Viertelstunde'], [60, 'Stunde']].map(([id, label]) => h('button', {
    type: 'button', class: interval === id ? 'on' : '', 'aria-pressed': interval === id ? 'true' : 'false',
    onclick: () => setInterval_(id),
  }, label));
  const setInterval_ = (id) => { interval = id; ivBtns.forEach((b, i) => { const on = [15, 60][i] === id; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); }); };
  const showProvInfo = () => {
    const p = DYNAMIC_PROVIDERS.find((x) => x.id === provider) || {};
    provInfo.textContent = p.id === 'other' ? 'Trag die Werte aus deinem Preisblatt ein.' : `${p.info}. Vorlage laut Anbieter (${p.stand}); vergleiche sie mit deinem Vertrag.`;
  };
  provSel.addEventListener('change', () => {
    const prev = DYNAMIC_PROVIDERS.find((x) => x.id === provider);
    provider = provSel.value;
    const p = DYNAMIC_PROVIDERS.find((x) => x.id === provider);
    if (p.id !== 'other') {
      ctIn.value = p.ct != null ? String(p.ct) : '';
      pctIn.value = p.pct ? String(p.pct) : '0';
      dgpIn.value = p.gp != null ? String(p.gp) : '';
      setInterval_(p.interval);
      onceIn.checked = !!p.gpOnce;
      if (!nameIn.value.trim() || (prev && nameIn.value.trim() === prev.name)) nameIn.value = p.name;
    }
    showProvInfo();
  });
  if (all.kind !== 'dynamic' && all.ct == null) { // noch nie dynamisch gespeichert: Vorlage eintragen
    const p = DYNAMIC_PROVIDERS.find((x) => x.id === provider);
    ctIn.value = p.ct != null ? String(p.ct) : '';
    pctIn.value = String(p.pct || 0);
    dgpIn.value = p.gp != null ? String(p.gp) : '';
    onceIn.checked = !!p.gpOnce;
  }
  showProvInfo();

  const fixedBox = h('div', { class: 'field-row' },
    h('label', { class: 'field' }, h('span', { text: 'Arbeitspreis (Cent pro kWh)' }), apIn),
    h('label', { class: 'field' }, h('span', { text: 'Grundpreis (Euro pro Monat)' }), gpIn));
  const dynBox = h('div', { class: 'form-sub' },
    h('label', { class: 'field' }, h('span', { text: 'Anbieter (Vorlage)' }), provSel),
    provInfo,
    h('div', { class: 'field-row' },
      h('label', { class: 'field' }, h('span', { text: 'Aufschlag (Cent pro kWh)' }), ctIn),
      h('label', { class: 'field' }, h('span', { text: 'Aufschlag (% auf den Börsenpreis)' }), pctIn)),
    h('div', { class: 'field-row' },
      h('label', { class: 'field' }, h('span', { text: 'Grundgebühr (Euro pro Monat)' }), dgpIn),
      h('div', { class: 'field' }, h('span', { text: 'Preis gilt je' }), h('div', { class: 'seg seg--small' }, ...ivBtns))),
    state.mps.filter((m) => m.flows.consumption).length > 1 ? h('label', { class: 'check-row' }, onceIn, h('span', { text: 'Grundgebühr nur einmal für die Adresse, nicht je Zählpunkt' })) : null,
    h('p', { class: 'hint', text: 'Energiepreis = (Börsenpreis + Prozent-Aufschlag) + 20 % USt + Cent-Aufschlag. Den Börsenpreis (EPEX Spot Österreich) holt Netzblick selbst. Brauchst du nur einen Aufschlag, lass den anderen auf 0.' }));
  const tariffBtns = [['fixed', 'Fixpreis'], ['dynamic', 'Dynamisch (Börse)']].map(([id, label]) => h('button', {
    type: 'button', class: tariffKind === id ? 'on' : '', 'aria-pressed': tariffKind === id ? 'true' : 'false',
    onclick: () => setTariffKind(id),
  }, label));
  const setTariffKind = (id) => {
    tariffKind = id;
    tariffBtns.forEach((b, i) => { const on = ['fixed', 'dynamic'][i] === id; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    fixedBox.hidden = id !== 'fixed';
    dynBox.hidden = id !== 'dynamic';
  };
  setTariffKind(tariffKind);

  const perMeter = state.mps.length > 1 ? state.mps.map((mp) => {
    const m = s.supplier.meters[mp.id] || {};
    return { mp, ap: numIn(m.ap, 'wie oben'), gp: numIn(m.gp, 'wie oben') };
  }) : [];
  let meterType = s.meterType || 'three';
  const typeBtns = [['three', 'Drehstrom (3 Phasen)'], ['single', 'Wechselstrom (1 Phase)']].map(([id, label]) => h('button', {
    type: 'button', class: meterType === id ? 'on' : '', 'aria-pressed': meterType === id ? 'true' : 'false',
    onclick: (e) => { meterType = id; typeBtns.forEach((b) => { const on = b === e.currentTarget; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); }); },
  }, label));
  const saveSupplier = async () => {
    const next = {
      kind: tariffKind,
      ap: parseInput(apIn), gp: parseInput(gpIn),
      provider, ct: parseInput(ctIn), pct: parseInput(pctIn), dgp: parseInput(dgpIn), interval,
      gpOnce: tariffKind === 'dynamic' && onceIn.checked,
    };
    if (tariffKind === 'fixed' && next.ap == null) { toast('Bitte den Arbeitspreis eintragen.'); return; }
    if (tariffKind === 'dynamic' && next.ct == null && !next.pct) { toast('Bitte den Aufschlag eintragen (Cent oder Prozent).'); return; }
    const meters = {};
    for (const x of perMeter) {
      const a = parseInput(x.ap), g = parseInput(x.gp);
      if (a != null || g != null) meters[x.mp.id] = { ...(a != null ? { ap: a } : {}), ...(g != null ? { gp: g } : {}) };
    }
    s.supplier = { all: next, meters };
    s.contract = { ...(s.contract || {}), supplier: nameIn.value.trim() };
    s.meterType = meterType;
    if (next.ap != null || tariffKind === 'dynamic' || Object.keys(meters).length) { delete s.pricePerKwh; delete s.feePerMonth; }
    ctx.saveSettings();
    toast('Strompreis gespeichert');
    await ctx.refreshUsage();
    ctx.renderPage();
  };
  body.append(section('Dein Stromlieferant', 'Nur der Energiepreis, ohne Netzkosten. Preise brutto, so wie sie im Vertrag oder auf dem Preisblatt stehen.',
    s.pricePerKwh != null ? h('p', { class: 'note note--warn', text: `Bisher war ein Gesamtpreis von ${num(s.pricePerKwh * 100, 2)} ct/kWh eingetragen. Netzblick rechnet die Netzkosten jetzt selbst; trag hier nur noch den Preis deines Lieferanten ein.` }) : null,
    h('div', { class: 'form form--inline' },
      h('div', { class: 'field' }, h('span', { text: 'Tarif' }), h('div', { class: 'seg seg--small' }, ...tariffBtns)),
      h('label', { class: 'field' }, h('span', { text: 'Lieferant (optional)' }), nameIn),
      kpSupplier ? h('p', { class: 'hint', text: contract.supplier && contract.supplier.toLowerCase() !== kpSupplier.toLowerCase()
        ? `Bei Netz Burgenland als Lieferant gemeldet: ${kpSupplier}. Weicht das ab, läuft ein Wechsel oft noch.`
        : 'Aus dem Kundenportal von Netz Burgenland. Hast du gerade gewechselt, trag den neuen Lieferanten ein.' }) : null,
      fixedBox,
      dynBox,
      perMeter.length ? h('details', { class: 'more more--inline' }, h('summary', {}, 'Eigener Fixpreis je Zählpunkt, z. B. für eine Wärmepumpe'),
        ...perMeter.map((x) => h('div', { class: 'field-group' },
          h('p', { class: 'field-title' }, h('span', { class: 'lg-key', style: `background:${ctx.meterColor(x.mp)}` }), ' ', meterLabel(x.mp, names, { compact: !names[x.mp.id] })),
          h('div', { class: 'field-row' },
            h('label', { class: 'field' }, h('span', { text: 'Arbeitspreis (ct/kWh)' }), x.ap),
            h('label', { class: 'field' }, h('span', { text: 'Grundpreis (€/Monat)' }), x.gp))))) : null,
      h('div', { class: 'field' }, h('span', { text: 'Stromanschluss' }), h('div', { class: 'seg seg--small' }, ...typeBtns)),
      h('p', { class: 'hint', text: `Davon hängt nur das Messentgelt von Netz Burgenland ab: Drehstrom ${euro(METERING.three * (1 + VAT))}, Wechselstrom ${euro(METERING.single * (1 + VAT))} im Monat. Fast jedes Haus hat Drehstrom (Starkstrom, z. B. für Herd, Wallbox oder Wärmepumpe). Wechselstrom gibt es meist nur bei kleinen Wohnungen, Gartenhäusern oder Garagen. Weißt du es nicht, lass Drehstrom.` }),
      h('button', { class: 'btn btn--primary', type: 'button', onclick: saveSupplier }, 'Speichern'))));

  /* ---- 1b) Börsenpreis heute und morgen (nur bei dynamischem Tarif) */
  const dynSup = supplierFor(s, (state.mps[0] || {}).id);
  if (all.kind === 'dynamic' && dynSup && dynSup.kind === 'dynamic') {
    const spotBox = h('div', {}, h('p', { class: 'hint' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), ' Lade Börsenpreise …'));
    body.append(section('Dein Strompreis heute und morgen', `Energiepreis mit deinem Aufschlag, brutto, je ${dynSup.interval === 60 ? 'Stunde' : 'Viertelstunde'}. Ohne Netzkosten und Abgaben.`, spotBox));
    renderSpotToday(spotBox, dynSup, ctx);
  }

  /* ---- 2) Erinnerung */
  let kind = contract.kind || 'rabatt';
  const kindBtns = [['rabatt', 'Neukundenrabatt'], ['bindung', 'Vertragsbindung']].map(([id, label]) => h('button', {
    type: 'button', class: kind === id ? 'on' : '', 'aria-pressed': kind === id ? 'true' : 'false',
    onclick: (e) => { kind = id; kindBtns.forEach((b) => { const on = b === e.currentTarget; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); }); },
  }, label));
  const endIn = h('input', { class: 'input', type: 'date', value: contract.end || '' });
  const daysSel = h('select', { class: 'select' }, ...[7, 14, 30, 60, 90].map((d) => h('option', { value: String(d), selected: (contract.days || 30) === d ? true : null }, `${d} Tage vorher`)));
  const status = h('p', { class: 'status-line' });
  const showStatus = async () => {
    const c = state.settings.contract || {};
    if (!c.end) { status.textContent = 'Keine Erinnerung eingestellt.'; return; }
    const pending = await reminderPending();
    const at = c.at ? new Date(c.at) : null;
    if (pending && at) status.textContent = `Benachrichtigung am ${dateNum(at)} um ${time(at)} Uhr. Ab dann steht auch ein Hinweis in der Übersicht.`;
    else if (at && at < new Date()) status.textContent = `Die Erinnerung war am ${dateNum(at)}. Der Hinweis steht bis 30 Tage nach dem ${dateNum(new Date(c.end + 'T00:00:00'))} in der Übersicht.`;
    else status.textContent = `Hinweis in der Übersicht ab ${c.days || 30} Tage vor dem ${dateNum(new Date(c.end + 'T00:00:00'))}.`;
  };
  const what = () => (kind === 'bindung' ? 'Vertragsbindung' : 'Neukundenrabatt');
  const texts = (end) => {
    const sup = nameIn.value.trim();
    return {
      title: `Strom: ${what()}${sup ? ` bei ${sup}` : ''} endet am ${dateNum(end)}`,
      text: `Jetzt Tarife vergleichen und rechtzeitig wechseln oder kündigen: ${TARIFF_CALCULATOR}`,
    };
  };
  const setReminder = async () => {
    const days = Number(daysSel.value);
    const t = endIn.value ? reminderTime(endIn.value, days) : null;
    if (!t) { toast(endIn.value ? 'Das Datum liegt in der Vergangenheit.' : 'Bitte das Datum eintragen.'); return; }
    const { title, text } = texts(t.end);
    const res = await scheduleReminder({ at: t.at, title, body: text.replace(/: https.*/, '.') }).catch(() => 'error');
    state.settings.contract = { supplier: nameIn.value.trim(), kind, end: endIn.value, days, at: res === 'ok' ? t.at.toISOString() : null };
    ctx.saveSettings();
    ctx.refreshUsage();
    if (res === 'ok') toast(`Erinnerung am ${dateNum(t.at)} um 9 Uhr`);
    else if (res === 'denied') toast('Benachrichtigungen sind für Netzblick aus. Erlaube sie in den Android-Einstellungen oder nutze den Kalender.');
    else if (res === 'unsupported') toast('Gespeichert. Benachrichtigungen gibt es nur in der Android-App, der Hinweis erscheint in der Übersicht.');
    else toast('Erinnerung konnte nicht gesetzt werden. Der Hinweis erscheint trotzdem in der Übersicht.');
    showStatus();
  };
  const addCalendar = async () => {
    const days = Number(daysSel.value);
    const t = endIn.value ? reminderTime(endIn.value, days) : null;
    if (!t) { toast('Bitte ein Datum in der Zukunft eintragen.'); return; }
    const { title, text } = texts(t.end);
    await shareFile('netzblick-erinnerung.ics', reminderIcs({ at: t.at, end: t.end, title, text }), 'text/calendar;charset=utf-8', 'In den Kalender').catch((e) => toast('Nicht möglich: ' + (e.message || e)));
  };
  const removeReminder = async () => {
    await cancelReminder();
    state.settings.contract = { supplier: nameIn.value.trim() };
    ctx.saveSettings();
    ctx.refreshUsage();
    endIn.value = '';
    toast('Erinnerung entfernt');
    showStatus();
  };
  body.append(section('Erinnerung vor dem Wechsel', 'Viele Lieferanten geben Neukunden ein Jahr Rabatt oder binden dich für eine Zeit. Netzblick erinnert dich rechtzeitig, damit du vergleichen und wechseln kannst.',
    h('div', { class: 'form form--inline' },
      h('div', { class: 'seg seg--small' }, ...kindBtns),
      h('div', { class: 'field-row' },
        h('label', { class: 'field' }, h('span', { text: 'Endet am' }), endIn),
        h('label', { class: 'field' }, h('span', { text: 'Erinnern' }), daysSel)),
      status,
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn btn--primary', type: 'button', onclick: setReminder }, icon('bell'), 'Erinnerung setzen'),
        h('button', { class: 'btn btn--ghost', type: 'button', onclick: addCalendar }, icon('calendar'), 'In den Kalender'),
        contract.end ? h('button', { class: 'btn btn--quiet', type: 'button', onclick: removeReminder }, 'Entfernen') : null),
      h('button', { class: 'link-btn', type: 'button', onclick: () => openExternal(TARIFF_CALCULATOR) }, icon('external'), 'Tarife vergleichen: Tarifkalkulator der E-Control'))));
  showStatus();

  /* ---- 3) Ein Jahr aus deinen Messwerten */
  const yearBox = h('div', {}, h('p', { class: 'hint', text: 'Rechne …' }));
  body.append(section('Was dich ein Jahr kostet', 'Deine gemessenen Tageswerte der letzten 12 Monate mit den aktuellen Preisen.', yearBox));
  (async () => {
    const today = startOfDay(new Date());
    const from = addDays(today, -365);
    const list = [];
    // Dynamischer Tarif: Börsenpreise derselben 12 Monate. Die Tage werden unten ins laufende Jahr gelegt
    // (für die aktuellen Netzpreise), der Börsenpreis kommt aber vom echten Tag.
    await ctx.ensureSpot(from, addDays(today, 1));
    const realDay = (t) => (t > today ? new Date(t.getFullYear() - 1, t.getMonth(), t.getDate(), t.getHours(), t.getMinutes()) : t);
    for (const mp of state.mps.filter((m) => m.flows.consumption)) {
      const r = await state.store.load(mp, 'consumption', from, today, 'daily');
      const pts = r.points.filter((p) => p.v != null);
      if (!pts.length) continue;
      // Ab 2027: Leistungspreis mit den Monatsspitzen derselben 12 Monate
      let peaks = null;
      if (forYear(GRID, today.getFullYear()).data.nm.lpKw) {
        const mp12 = await state.store.monthlyPeaks(mp, 'consumption', new Date(from.getFullYear(), from.getMonth() + 1, 1), today).catch(() => []);
        peaks = new Map(mp12.filter((m) => m.kw != null).map((m) => [`${today.getFullYear()}-${String(m.start.getMonth() + 1).padStart(2, '0')}`, m.kw]));
      }
      const opts = ctx.costOptions(mp);
      const spotAt = opts.spotAt ? (t, iv) => opts.spotAt(realDay(t), iv) : null;
      list.push(meterCost(pts.map((p) => ({ ...p, t: new Date(today.getFullYear(), p.t.getMonth(), p.t.getDate()) })), { fine: false, peaks, from: new Date(today.getFullYear(), 0, 1), to: new Date(today.getFullYear() + 1, 0, 1), ...opts, spotAt }));
    }
    yearBox.textContent = '';
    if (!list.length) { yearBox.append(h('p', { class: 'empty', text: 'Noch keine Messwerte.' })); return; }
    const c = sumCosts(list);
    const total = c.total != null ? c.total : c.withoutSupplier;
    yearBox.append(
      h('div', { class: 'big-figure' }, h('span', { class: 'big-value', text: euro(total).replace(/\s?€/, '') }), h('span', { class: 'big-unit', text: c.total != null ? '€ im Jahr' : '€ im Jahr für Netz und Abgaben' })),
      h('p', { class: 'big-label', text: `${kwh(c.kwh)} in 12 Monaten, rund ${euro(total / 12)} im Monat` }),
      dl(
        c.supplier ? row('Energie (Lieferant)', euro(c.supplier.total)) : row('Energie (Lieferant)', 'Preis oben eintragen'),
        row('Netz Burgenland', euro(c.gridGross)),
        row('Steuern und Abgaben', euro(c.leviesGross)),
        row('Durchschnitt je kWh', c.total != null && c.kwh ? ct((c.total / c.kwh) * 100, 1) : null)),
      h('p', { class: 'note', text: `Mit den Netzpreisen von ${forYear(GRID, today.getFullYear()).year}, brutto. Aus Tageswerten, daher ohne Niedertarife${c.peakUnknown ? ' und ohne Leistungspreis' : ''}${c.supplier && c.supplier.dynamic ? ', die Energie mit dem Tagesmittel des Börsenpreises' : ''}; genau rechnet die Seite „Kosten“ mit Viertelstundenwerten.${c.supplier && c.supplier.missingKwh > 1 ? ` Für ${num(c.supplier.missingKwh, 0)} kWh fehlen Börsenpreise.` : ''}` }));
  })().catch(() => { yearBox.textContent = ''; yearBox.append(h('p', { class: 'empty', text: 'Messwerte konnten nicht geladen werden.' })); });

  /* ---- 4) Netzpreise */
  const { year: gy, data: g } = forYear(GRID, new Date().getFullYear());
  const both = (a, b, fmt) => [fmt(a), fmt(b)];
  const gross = (x) => x * (1 + VAT);
  const priceRow = (label, vals, sub) => h('tr', {}, h('th', { scope: 'row' }, label, sub ? h('small', { text: sub }) : null), ...vals.map((v) => h('td', { class: 'num', text: v })));
  const assign = state.mps.map((mp) => {
    const pod = pods.find((p) => p.id === mp.id);
    return `${meterLabel(mp, names, { compact: true })}: ${pod && String(pod.tariffClass).toUpperCase() === 'U' ? 'unterbrechbar' : 'Haushalt'}`;
  });
  body.append(section(`Netzpreise Netz Burgenland ${gy}`, 'Netzebene 7, brutto inklusive 20 % USt. Welcher Tarif gilt, kommt aus dem Kundenportal.',
    h('div', { class: 'tbl-scroll' }, h('table', { class: 'tbl tbl--prices' },
      h('thead', {}, h('tr', {}, h('th', { scope: 'col' }), h('th', { scope: 'col', class: 'num', text: 'Haushalt' }), h('th', { scope: 'col', class: 'num', text: 'Unterbrechbar' }))),
      h('tbody', {},
        priceRow('Netznutzung je kWh', both(g.nm.ap, g.u.ap, (x) => ct(gross(x)))),
        g.nm.snap != null ? priceRow('Sommer-Niedertarif je kWh', both(g.nm.snap, g.u.snap, (x) => ct(gross(x))), '1. April bis 30. September, 10–16 Uhr') : null,
        priceRow('Netznutzung Pauschale', both(g.nm.lp, g.u.lp, (x) => (x ? `${euro(gross(x))} / Jahr` : '–'))),
        priceRow('Netzverlust je kWh', both(g.nm.loss, g.u.loss, (x) => ct(gross(x)))),
        priceRow('Messentgelt', [`${euro(gross(g.metering.three))} / Monat`, `${euro(gross(g.metering.three))} / Monat`], `Drehstrom; Wechselstrom ${euro(gross(g.metering.single))}`)))),
    assign.length && pods.length ? h('p', { class: 'hint', text: `Deine Zählpunkte: ${assign.join(', ')}.` }) : null,
    gy < 2027 ? h('div', { class: 'notice notice--quiet' }, icon('gauge'),
      h('div', { class: 'notice-text' }, h('b', { text: 'Ab 2027 kommt der Leistungspreis.' }), h('span', { text: `Die Pauschale fällt weg, dafür zählt die höchste Viertelstunde jedes Monats: bis ${POWER_TARIFF.limitKw} kW ${euro(gross(GRID[2027].nm.lpKw.low))}, darüber ${euro(gross(GRID[2027].nm.lpKw.high))} je kW und Monat (Entwurf).` })),
      h('div', { class: 'notice-actions' }, h('button', { class: 'btn btn--small', type: 'button', onclick: () => ctx.goto('power') }, 'Deine Spitzen ansehen'))) : null));

  /* ---- 5) Steuern und Abgaben */
  const ly = latestYear(LEVIES);
  const l = LEVIES[ly];
  body.append(section(`Steuern und Abgaben ${ly}`, 'Bundesweit gleich, brutto inklusive 20 % USt.',
    dl(
      row('Elektrizitätsabgabe', `${ct(gross(l.eAbgabe.household), 3)} je kWh für Haushalte, sonst ${ct(gross(l.eAbgabe.other), 3)}`),
      row('Erneuerbaren-Förderpauschale', `${euro(gross(l.pauschale))} pro Jahr und Zählpunkt`),
      row('Erneuerbaren-Förderbeitrag', `${euro(gross(l.beitrag.nm.year))} pro Jahr und ${ct(gross(l.beitrag.nm.ap + l.beitrag.nm.loss), 3)} je kWh (Haushalt); unterbrechbar ${ct(gross(l.beitrag.u.ap + l.beitrag.u.loss), 3)} je kWh`),
      row('Umsatzsteuer', '20 % auf Netz und Abgaben; im Preis deines Lieferanten schon enthalten')),
    h('p', { class: 'note', text: `Stand ${STAND}. Neue Preisblätter gelten meist ab 1. Jänner.` }),
    h('ul', { class: 'plain-list' }, ...PRICE_SOURCES.map((src) => h('li', {}, h('button', { class: 'link-btn', type: 'button', onclick: () => openExternal(src.url) }, src.label))))));
}

/** Liste von Quellen als Links */
function sourceList(sources) {
  return h('ul', { class: 'plain-list plain-list--links' }, ...sources.map((src) => h('li', {},
    h('button', { class: 'link-btn', type: 'button', onclick: () => openExternal(src.url) }, icon('external'), src.label))));
}

/* ---- Strompreis heute und morgen (dynamischer Tarif) */
async function renderSpotToday(box, sup, ctx) {
  const { state } = ctx;
  const now = new Date();
  const today = startOfDay(now);
  const tomorrow = addDays(today, 1);
  await ctx.ensureSpot(today, addDays(today, 2));
  if (!box.isConnected) return;
  box.textContent = '';
  const raw = state.spot ? state.spot.series(today, addDays(today, 2)).filter((x) => x.p != null) : [];
  if (!raw.length) {
    box.append(h('p', { class: 'empty', text: state.spotError ? state.spotError.message : 'Für heute gibt es noch keine Börsenpreise.' }));
    return;
  }
  // Preisraster des Tarifs: Stundenmittel oder Viertelstunden
  let step = raw[0].step || 900000;
  let pts = raw.map((x) => ({ t: x.t, spot: x.p }));
  if (sup.interval === 60 && step === 900000) {
    const by = new Map();
    for (const x of pts) {
      const k = new Date(x.t.getFullYear(), x.t.getMonth(), x.t.getDate(), x.t.getHours()).getTime();
      if (!by.has(k)) by.set(k, []);
      by.get(k).push(x.spot);
    }
    pts = [...by].map(([k, a]) => ({ t: new Date(k), spot: a.reduce((x, y) => x + y, 0) / a.length }));
    step = 3600000;
  }
  pts = pts.map((x) => ({ ...x, v: dynamicPrice(x.spot, sup, VAT) }));
  const per = (step === 3600000 ? 'Stunde' : 'Viertelstunde');
  const cur = pts.find((x) => x.t <= now && now < new Date(x.t.getTime() + step));
  const cheapest = (list, hours = 2) => {
    const n = Math.round((hours * 3600000) / step);
    let best = null;
    for (let i = 0; i + n <= list.length; i++) {
      const avg = list.slice(i, i + n).reduce((a, x) => a + x.v, 0) / n;
      if (!best || avg < best.avg) best = { from: list[i].t, to: new Date(list[i + n - 1].t.getTime() + step), avg };
    }
    return best;
  };
  const avg = (list) => list.reduce((a, x) => a + x.v, 0) / list.length;
  const rest = pts.filter((x) => x.t >= (cur ? cur.t : now) && x.t < tomorrow);
  const tom = pts.filter((x) => x.t >= tomorrow);
  const todayAll = pts.filter((x) => x.t < tomorrow);
  const win = (w) => (w ? `${time(w.from)}–${time(w.to)} Uhr, Ø ${ct(w.avg)}` : '–');
  const chart = h('div', { class: 'chart chart--spot' });
  box.append(
    h('div', { class: 'kpis kpis--page' },
      kpiTile('Jetzt', cur ? ct(cur.v) : '–', cur ? `bis ${time(new Date(cur.t.getTime() + step))} Uhr` : `je ${per}`),
      kpiTile('Heute im Schnitt', todayAll.length ? ct(avg(todayAll)) : '–', todayAll.length ? `${ct(Math.min(...todayAll.map((x) => x.v)))} bis ${ct(Math.max(...todayAll.map((x) => x.v)))}` : ''),
      kpiTile('Günstigste 2 Stunden heute', rest.length >= 2 ? win(cheapest(rest)).split(',')[0] : '–', rest.length >= 2 ? `ab jetzt, ${win(cheapest(rest)).split(', ')[1]}` : 'heute nichts mehr'),
      kpiTile('Morgen', tom.length ? ct(avg(tom)) : 'ab etwa 13 Uhr', tom.length ? `günstigste 2 Stunden ${win(cheapest(tom))}` : 'werden die Preise veröffentlicht')),
    chart,
    h('p', { class: 'note', text: `Börsenpreis EPEX Spot Österreich + ${sup.pct ? `${num(sup.pct, 1)} % + ` : ''}${num(sup.ct, 2)} ct Aufschlag, inklusive USt. Quelle der Börsenpreise: ${SPOT_SOURCE.label}.` }),
    h('div', { class: 'panel-actions' }, h('button', { class: 'btn btn--small', type: 'button', onclick: () => ctx.goto('spot') }, icon('spot'), 'Alle Börsenpreise')));
  const T = charts.tokens();
  charts.render(chart, charts.zoomable(charts.spotOption(T, { pts, step, now }), T, pts.length, { min: 96 }));
}

/* ================================================================ Kosten */
/**
 * Kosten Monat für Monat und je Zählpunkt, aus Viertelstundenwerten (Niedertarife genau).
 * Zeitraum: letzte 12 abgeschlossene Monate oder ein Kalenderjahr.
 */
export function renderCostsPage(body, ctx) {
  const { state, names } = ctx;
  const mps = state.mps.filter((m) => m.flows.consumption);
  if (!mps.length) { body.append(h('p', { class: 'empty', text: 'Keine Zählpunkte mit Verbrauch.' })); return; }
  const now = new Date();
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const tomorrow = addDays(startOfDay(now), 1);
  const first = firstDataDate(mps, 'consumption') || new Date(now.getFullYear(), 0, 1);
  const years = [];
  for (let y = now.getFullYear(); y >= first.getFullYear(); y--) years.push(y);
  let range = state.costsRange && (state.costsRange === '12m' || years.includes(Number(state.costsRange))) ? state.costsRange : '12m';

  const rangeOf = (id) => {
    if (id === '12m') {
      const from = new Date(thisMonth.getFullYear(), thisMonth.getMonth() - 12, 1);
      const last = new Date(thisMonth.getFullYear(), thisMonth.getMonth() - 1, 1);
      return { from, to: thisMonth, label: 'der letzten 12 Monate', sub: `${MONTHS_SHORT[from.getMonth()]} ${from.getFullYear()} bis ${MONTHS_SHORT[last.getMonth()]} ${last.getFullYear()}`, running: false };
    }
    const y = Number(id);
    const from = new Date(y, 0, 1);
    const end = new Date(y + 1, 0, 1);
    const running = end > now;
    return { from: from < new Date(first.getFullYear(), first.getMonth(), 1) ? new Date(first.getFullYear(), first.getMonth(), 1) : from, to: running ? tomorrow : end, yearStart: from, label: `${y}${running ? ' bisher' : ''}`, sub: running ? `1. Jänner bis heute` : 'ganzes Jahr', running };
  };

  const pick = h('div', { class: 'chip-row', role: 'group', 'aria-label': 'Zeitraum' });
  const out = h('div', { class: 'costs-out' });
  body.append(pick, out,
    section('Quellen', 'Netzentgelte und Abgaben sind amtlich festgelegt. Hier stehen die Originalquellen.',
      h('p', { class: 'note', text: GOV_DISCLAIMER }),
      sourceList(OFFICIAL_SOURCES)));
  const renderPick = () => {
    pick.textContent = '';
    for (const id of ['12m', ...years.map(String)]) {
      const on = id === range;
      pick.append(h('button', {
        type: 'button', class: 'chip' + (on ? ' chip--active' : ''), 'aria-pressed': on ? 'true' : 'false',
        onclick: () => { if (range === id) return; range = id; state.costsRange = id; renderPick(); load(); },
      }, id === '12m' ? 'Letzte 12 Monate' : id));
    }
  };

  let token = 0;
  const load = async () => {
    const my = ++token;
    const r = rangeOf(range);
    out.textContent = '';
    const progText = h('span', { text: ' Lade Viertelstundenwerte …' });
    out.append(h('p', { class: 'hint' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), progText));
    // Monate des Zeitraums; geladen wird immer der ganze Kalendermonat (teilt den Zwischenspeicher mit der Monatsansicht)
    const months = [];
    for (let m = new Date(r.from.getFullYear(), r.from.getMonth(), 1); m < r.to; m = new Date(m.getFullYear(), m.getMonth() + 1, 1)) {
      const next = new Date(m.getFullYear(), m.getMonth() + 1, 1);
      months.push({ start: m < r.from ? r.from : m, monthStart: m, next, end: next < r.to ? next : r.to });
    }
    await ctx.ensureSpot(r.from, r.to);
    if (my !== token || !body.isConnected) return;
    const per = mps.map((mp) => ({ mp, name: meterLabel(mp, names, { compact: true }), color: ctx.meterColor(mp), months: [] }));
    const total = months.length * per.length;
    let done = 0;
    try {
      for (const x of per) {
        const opts = ctx.costOptions(x.mp);
        for (let i = 0; i < months.length; i += 3) {
          const chunk = months.slice(i, i + 3);
          const res = await Promise.all(chunk.map((m) => state.store.load(x.mp, 'consumption', m.monthStart, m.next, 'original').catch(() => null)));
          if (my !== token || !body.isConnected) return;
          chunk.forEach((m, j) => {
            const rr = res[j];
            const pts = rr ? rr.points.filter((p) => p.t >= m.start && p.t < m.end) : [];
            const c = rr ? meterCost(pts, { fine: rr.fine, from: m.start, to: m.end, ...opts }) : null;
            x.months.push({ ...m, c, fine: rr ? rr.fine : false, kwh: c ? c.kwh : null });
          });
          done += chunk.length;
          progText.textContent = ` Lade Viertelstundenwerte … ${done} von ${total}`;
        }
      }
    } catch (e) {
      if (my !== token) return;
      out.textContent = '';
      out.append(h('p', { class: 'empty', text: e instanceof ApiError ? e.message : 'Die Werte konnten nicht geladen werden.' }));
      return;
    }
    if (my !== token || !body.isConnected) return;
    renderCostResult(out, { r, months, per, ctx });
  };

  renderPick();
  load();
}

function renderCostResult(out, { r, months, per, ctx }) {
  const T = charts.tokens();
  out.textContent = '';
  const allCosts = per.flatMap((x) => x.months.map((m) => m.c).filter(Boolean));
  const sum = sumCosts(allCosts);
  if (!sum.kwh) { out.append(h('p', { class: 'empty', text: 'Für diesen Zeitraum gibt es keine Messwerte.' })); return; }
  const total = costTotal(sum);
  const withData = months.filter((m, i) => per.some((x) => x.months[i] && x.months[i].kwh > 0)).length || 1;
  const parts = costParts(sum, T);
  const anyCoarse = per.some((x) => x.months.some((m) => m.c && !m.fine && m.kwh > 0));

  /* ---- Summe */
  out.append(h('section', { class: 'cost-hero' },
    h('p', { class: 'hero-label', text: `Kosten ${r.label}` }),
    h('p', { class: 'cost-hero-value' }, euro(total)),
    h('p', { class: 'cost-hero-sub', text: `${r.sub} · ${kwh(sum.kwh)}${sum.supplier ? '' : ' · ohne Energie'}` }),
    h('div', { class: 'stackbar', role: 'img', 'aria-label': parts.map((p) => `${p.name} ${pct(p.value / total)}`).join(', ') },
      ...parts.map((p) => h('span', { style: `flex:${Math.max(p.value, 0.0001)};background:${p.color}` }))),
    h('div', { class: 'stackbar-legend' }, ...parts.map((p) => h('span', { class: 'lg' }, h('span', { class: 'lg-key', style: `background:${p.color}` }), `${p.name} ${euro(p.value)}`))),
    !sum.supplier ? h('button', { class: 'pill pill--link', type: 'button', onclick: () => ctx.goto('tariff') }, 'Preis deines Lieferanten eintragen, dann rechnet Netzblick auch die Energie mit') : null));

  out.append(h('div', { class: 'kpis kpis--page' },
    kpiTile('Je kWh', ct((total / sum.kwh) * 100, 1), sum.supplier ? 'alles inklusive' : 'Netz und Abgaben'),
    kpiTile('Pro Monat', euro(total / withData), `Durchschnitt aus ${withData} Monat${withData === 1 ? '' : 'en'}`),
    kpiTile('Pro Tag', euro(total / Math.max(1, Math.round((r.to - r.from) / 86400000))), r.running ? 'bis heute' : 'im Zeitraum'),
    kpiTile('Niedertarif gespart', sum.snapKwh + sum.winapKwh > 0 ? euro(sum.snapSaving + sum.winapSaving) : '–', sum.snapKwh + sum.winapKwh > 0 ? `${kwh(sum.snapKwh + sum.winapKwh)} günstiger` : 'nur April bis September')));

  /* ---- Monat für Monat */
  const axis = r.yearStart ? Array.from({ length: 12 }, (_, i) => new Date(r.yearStart.getFullYear(), i, 1)) : months.map((m) => m.monthStart);
  const monthSum = axis.map((a) => {
    const i = months.findIndex((m) => m.monthStart.getTime() === a.getTime());
    if (i < 0) return null;
    const cs = per.map((x) => x.months[i] && x.months[i].c).filter(Boolean);
    const s = cs.length ? sumCosts(cs) : null;
    return s && s.kwh > 0 ? s : null;
  });
  const chart = h('div', { class: 'chart chart--costs' });
  out.append(section('Monat für Monat', 'Brutto. Fahre über einen Balken für die Aufteilung.',
    h('div', { class: 'legend legend--static' }, ...[...parts].reverse().map((p) => h('span', { class: 'lg' }, h('span', { class: 'lg-key', style: `background:${p.color}` }), p.name))),
    chart));
  charts.render(chart, charts.costMonthsOption(T, {
    axis,
    kwh: monthSum.map((s) => (s ? s.kwh : null)),
    parts: parts.map((p) => ({ name: p.name, color: p.color, data: monthSum.map((s) => (s ? costParts(s, T).find((q) => q.id === p.id).value : null)) })),
  }));

  /* ---- Je Zählpunkt */
  if (per.length > 1) {
    const cards = h('div', { class: 'meter-costs' });
    for (const x of per) {
      const cs = x.months.map((m) => m.c).filter(Boolean);
      if (!cs.length) continue;
      const s = sumCosts(cs);
      const t = costTotal(s);
      const ps = costParts(s, T);
      const cls = tariffClassOf(ctx.podFor(x.mp.id));
      cards.append(h('div', { class: 'meter-cost' },
        h('p', { class: 'meter-cost-name' }, h('span', { class: 'lg-key', style: `background:${x.color}` }), x.name, cls === 'u' ? h('small', { text: ' unterbrechbar' }) : null),
        h('p', { class: 'meter-cost-value', text: euro(t) }),
        h('p', { class: 'meter-cost-sub', text: `${kwh(s.kwh)} · ${s.kwh > 0 ? ct((t / s.kwh) * 100, 1) : '–'} je kWh · ${pct(total ? t / total : 0)} der Kosten` }),
        h('div', { class: 'stackbar stackbar--thin', role: 'img', 'aria-label': ps.map((p) => `${p.name} ${euro(p.value)}`).join(', ') },
          ...ps.map((p) => h('span', { style: `flex:${Math.max(p.value, 0.0001)};background:${p.color}` }))),
        h('p', { class: 'meter-cost-parts', text: ps.map((p) => `${p.name.replace(' (Lieferant)', '')} ${euro(p.value)}`).join(' · ') })));
    }
    out.append(section('Je Zählpunkt', 'Netztarif je Zählpunkt aus dem Kundenportal.', cards));
  }

  /* ---- Aufstellung */
  const community = !!(ctx.state.kpData && ctx.state.kpData.pods.some((p) => p.communities && p.communities.some((x) => x.status === 'aktiv')));
  const notes = costNotes(sum, { community, spotError: ctx.state.spotError });
  if (!anyCoarse) notes.unshift('Gerechnet aus Viertelstundenwerten, die Niedertarife also genau.');
  out.append(section('Aufstellung', null, costTable(sum, T, { meters: per.length }), h('p', { class: 'note', text: notes.join(' ') })));

  /* ---- Alle Monate */
  const rows = [];
  axis.forEach((a, i) => {
    const s = monthSum[i];
    if (!s) return;
    const ps = costParts(s, T);
    const val = (id) => { const p = ps.find((q) => q.id === id); return p ? euro(p.value) : '–'; };
    rows.push(h('tr', {},
      h('td', { text: `${MONTHS_SHORT[a.getMonth()]} ${a.getFullYear()}` }),
      h('td', { class: 'num', text: num(s.kwh, 0) }),
      h('td', { class: 'num', text: val('energy') }),
      h('td', { class: 'num', text: val('grid') }),
      h('td', { class: 'num', text: val('levies') }),
      h('td', { class: 'num' }, h('b', { text: euro(costTotal(s)) }))));
  });
  rows.push(h('tr', { class: 'cost-total' },
    h('th', { scope: 'row', text: 'Summe' }),
    h('td', { class: 'num', text: num(sum.kwh, 0) }),
    h('td', { class: 'num', text: sum.supplier ? euro(sum.supplier.total) : '–' }),
    h('td', { class: 'num', text: euro(sum.gridGross) }),
    h('td', { class: 'num', text: euro(sum.leviesGross) }),
    h('td', { class: 'num', text: euro(total) })));
  const csvBtn = h('button', { class: 'btn btn--small', type: 'button', onclick: () => shareCostsCsv(r, months, per, T) }, icon('share'), 'CSV teilen');
  out.append(h('section', { class: 'panel' },
    h('div', { class: 'panel-head' }, h('h2', { text: 'Alle Monate' }), csvBtn),
    h('p', { class: 'panel-sub', text: 'Brutto, alle Zählpunkte zusammen. Die CSV-Datei enthält jeden Zählpunkt einzeln.' }),
    h('div', { class: 'tbl-scroll' }, h('table', { class: 'tbl tbl--months' },
      h('thead', {}, h('tr', {}, ...['Monat', 'kWh', 'Energie', 'Netz', 'Abgaben', 'Summe'].map((t, i) => h('th', { scope: 'col', class: i ? 'num' : '', text: t })))),
      h('tbody', {}, ...rows)))));
  fillIcons(out);
}

/** CSV je Monat und Zählpunkt (Semikolon, Dezimalkomma, für Excel) */
function shareCostsCsv(r, months, per, T) {
  const n = (x, d = 2) => (x == null ? '' : x.toFixed(d).replace('.', ','));
  const lines = ['Monat;Zählpunkt;kWh;davon Niedertarif kWh;Energie €;Netz €;Steuern und Abgaben €;Summe €'];
  months.forEach((m, i) => {
    for (const x of per) {
      const c = x.months[i] && x.months[i].c;
      if (!c || !c.kwh) continue;
      lines.push([`${m.monthStart.getFullYear()}-${String(m.monthStart.getMonth() + 1).padStart(2, '0')}`, x.mp.id, n(c.kwh, 3), n(c.snapKwh + c.winapKwh, 3), c.supplier ? n(c.supplier.total) : '', n(c.gridGross), n(c.leviesGross), n(costTotal(c))].join(';'));
    }
  });
  const name = `netzblick-kosten-${r.yearStart ? r.yearStart.getFullYear() : '12-monate'}.csv`;
  shareFile(name, '\ufeff' + lines.join('\r\n'), 'text/csv;charset=utf-8', 'Kosten teilen').catch(() => toast('Teilen nicht möglich'));
}

/* ================================================================ Leistung (Leistungspreis ab 2027) */
export function renderPower(body, ctx) {
  const { state, names } = ctx;
  const limit = POWER_TARIFF.limitKw;
  const g27 = GRID[2027];
  const lp = g27.nm.lpKw;
  const gross = (x) => x * (1 + VAT);
  const mps = state.mps.filter((m) => m.flows.consumption);
  body.append(h('p', { class: 'page-lead', text: 'Ab 2027 zahlst du fürs Netz auch nach Leistung. Es zählt die höchste Viertelstunde jedes Monats, für jeden Zählpunkt extra.' }));

  /* ---- 1) Monatsspitzen */
  const peaksBox = h('div', {}, h('p', { class: 'hint' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), ' Lade Monatsspitzen …'));
  body.append(section('Deine Monatsspitzen', `Höchste Viertelstunde je Monat, letzte 13 Monate. Die Linie zeigt ${limit} kW: Darüber kostet jedes kW mehr.`, peaksBox));

  /* ---- 2) Vergleich */
  const cmpBox = h('div', {}, h('p', { class: 'hint', text: 'Rechne …' }));
  body.append(section('Netzkosten: 2026 und ab 2027', 'Deine letzten 12 Monate, einmal mit den Netzpreisen 2026 und einmal mit dem neuen Leistungspreis. Brutto, ohne Niedertarife, Steuern und Abgaben.', cmpBox));

  /* ---- 3) So wird gerechnet */
  const u = g27.u;
  body.append(section('So rechnet Netz Burgenland ab 2027', `Netzebene 7, brutto inklusive 20 % USt. ${POWER_TARIFF.status}.`,
    dl(
      row(`Leistungspreis bis ${limit} kW`, `${euro(gross(lp.low))} je kW und Monat`),
      row(`Anteil über ${limit} kW`, `${euro(gross(lp.high))} je kW und Monat`),
      row('Arbeitspreis Netz', `${ct(gross(g27.nm.ap))} je kWh (2026: ${ct(gross(GRID[2026].nm.ap))})`),
      row('Niedertarife', `${ct(gross(g27.nm.snap))} je kWh im Sommer (1.4.–30.9., 10–16 Uhr), ab Oktober 2027 auch im Winter (1.10.–31.3., 23–5 Uhr)`),
      row('Unterbrechbar (z. B. Wärmepumpe)', `${ct(gross(u.ap))} je kWh, kein Leistungspreis`),
      row('Pauschale und Messentgelt', `entfallen (2026: ${euro(gross(GRID[2026].nm.lp))} und bis zu ${euro(gross(METERING.three * 12))} im Jahr)`),
      stack(row('Beispiel', `Spitze 6 kW: 6 × ${euro(gross(lp.low))} = ${euro(gross(powerCharge(6, lp)))} im Monat. Spitze 12 kW: ${limit} × ${euro(gross(lp.low))} + 2 × ${euro(gross(lp.high))} = ${euro(gross(powerCharge(12, lp)))} im Monat.`))),
    h('p', { class: 'note', text: 'Gezählt wird die mittlere Leistung einer ganzen Viertelstunde, auf zwei Kommastellen gerundet. Kurze Spitzen beim Einschalten fallen kaum ins Gewicht. Die endgültigen Preise legt die E-Control Mitte Dezember 2026 fest; Netz Burgenland kündigt die Umstellung für Jänner 2027 an.' })));

  /* ---- 4) Tipps */
  body.append(section(`So bleibst du unter ${limit} kW`, null,
    h('ul', { class: 'tips' },
      h('li', {}, h('b', { text: 'E-Auto: ' }), `Eine 11-kW-Wallbox liegt allein schon über ${limit} kW. Mit weniger Leistung laden oder dann, wenn sonst wenig läuft.`),
      h('li', {}, h('b', { text: 'Große Geräte nacheinander: ' }), 'Herd und Backofen, Geschirrspüler, Waschmaschine, Trockner, Durchlauferhitzer oder Sauna nicht gleichzeitig.'),
      h('li', {}, h('b', { text: 'Wärmepumpe und Heizstab: ' }), 'Auf einem eigenen, unterbrechbaren Zählpunkt fällt laut Entwurf kein Leistungspreis an.'),
      h('li', {}, h('b', { text: 'Flexible Leistung: ' }), 'Wer dem Netzbetreiber erlaubt, die Leistung zeitweise zu begrenzen, zahlt dafür einen deutlich niedrigeren Leistungspreis.')),
    h('button', { class: 'btn btn--small', type: 'button', onclick: () => ctx.showUsage(null, makePeriod('month', new Date()), { power: true }) }, icon('gauge'), 'Viertelstunden dieses Monats ansehen')));

  body.append(section('Quellen', null,
    h('ul', { class: 'plain-list' }, ...POWER_TARIFF.sources.map((src) => h('li', {}, h('button', { class: 'link-btn', type: 'button', onclick: () => openExternal(src.url) }, icon('external'), src.label))))));

  if (!mps.length) { peaksBox.textContent = ''; peaksBox.append(h('p', { class: 'empty', text: 'Keine Zählpunkte mit Verbrauch.' })); cmpBox.textContent = ''; return; }

  (async () => {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth() - 12, 1);
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const data = [];
    for (const mp of mps) {
      const peaks = await state.store.monthlyPeaks(mp, 'consumption', from, now);
      data.push({ mp, name: meterLabel(mp, names, { compact: true }), color: ctx.meterColor(mp), peaks, interruptible: tariffClassOf(ctx.podFor(mp.id)) === 'u' });
    }
    if (!body.isConnected) return;
    renderPeaks(peaksBox, data, { from, thisMonth, limit, lp, gross });
    const kwhs = [];
    for (const x of data) {
      const r = await state.store.load(x.mp, 'consumption', from, thisMonth, 'daily');
      kwhs.push(r.points.reduce((a, p) => a + (p.v || 0), 0));
    }
    if (!body.isConnected) return;
    renderPowerCompare(cmpBox, data, kwhs, { thisMonth, lp, gross, ctx });
  })().catch((e) => {
    peaksBox.textContent = '';
    peaksBox.append(h('p', { class: 'empty', text: e instanceof ApiError ? e.message : 'Die Monatsspitzen konnten nicht geladen werden.' }));
    cmpBox.textContent = '';
  });
}

function renderPeaks(box, data, { from, thisMonth, limit, lp, gross }) {
  box.textContent = '';
  const axis = [];
  for (let m = new Date(from); m <= thisMonth; m = new Date(m.getFullYear(), m.getMonth() + 1, 1)) axis.push(m);
  const at = (x, m) => x.peaks.find((p) => p.start.getTime() === m.getTime()) || null;
  const chart = h('div', { class: 'chart chart--peaks' });
  const legend = data.length > 1 ? h('div', { class: 'legend' }, ...data.map((x) => h('span', { class: 'lg' }, h('span', { class: 'lg-key lg-key--bar', style: `background:${x.color}` }), x.name))) : null;
  box.append(...[legend, chart].filter(Boolean));

  const cards = h('div', { class: 'peak-cards' });
  for (const x of data) {
    const done = x.peaks.filter((p) => p.start < thisMonth && p.kw != null);
    const cur = x.peaks.find((p) => p.start.getTime() === thisMonth.getTime());
    const best = done.reduce((a, p) => (!a || p.kw > a.kw ? p : a), null);
    const over = done.filter((p) => p.kw > limit).length;
    const yearLp = done.length ? done.reduce((a, p) => a + powerCharge(p.kw, lp), 0) * (12 / done.length) : null;
    const tiles = h('div', { class: 'kpis kpis--page' },
      kpiTile('Höchste Spitze', best ? kw(best.kw) : '–', best && best.t ? `${dateNum(best.t)}, ${time(best.t)} Uhr` : 'letzte 12 Monate'),
      kpiTile(`Über ${limit} kW`, done.length ? (over ? `${over} von ${done.length}` : 'nie') : '–', over ? 'Monaten' : `in ${done.length} Monaten`),
      kpiTile('Dieser Monat bisher', cur && cur.kw != null ? kw(cur.kw) : '–', cur && cur.t ? `${dateNum(cur.t)}, ${time(cur.t)} Uhr` : MONTHS_LONG[thisMonth.getMonth()]),
      kpiTile('Leistungspreis ab 2027', x.interruptible ? 'keiner' : yearLp == null ? '–' : `${euro(gross(yearLp))}`, x.interruptible ? 'unterbrechbarer Zählpunkt' : 'im Jahr mit diesen Spitzen'));
    const rows = [...x.peaks].reverse().map((p) => h('tr', { class: p.kw != null && p.kw > limit ? 'is-over' : '' },
      h('td', { text: monthYear(p.start) }),
      h('td', { class: 'num' }, p.kw != null && p.kw > limit ? h('span', { class: 'over-mark', title: `über ${limit} kW`, 'aria-label': `über ${limit} kW` }, '▲ ') : null, p.kw == null ? '–' : kw(p.kw)),
      h('td', { text: p.t ? `${dateNum(p.t)}, ${time(p.t)}` : '' }),
      h('td', { class: 'num', text: x.interruptible || p.kw == null ? '–' : euro(gross(powerCharge(p.kw, lp))) })));
    cards.append(h('div', { class: 'peak-card' },
      data.length > 1 ? h('h3', { class: 'peak-card-title' }, h('span', { class: 'lg-key', style: `background:${x.color}` }), x.name, x.interruptible ? h('small', { text: ' unterbrechbar' }) : null) : null,
      tiles,
      h('details', { class: 'peak-details' }, h('summary', { text: 'Alle Monate' }),
        h('div', { class: 'tbl-scroll' }, h('table', { class: 'tbl' },
          h('thead', {}, h('tr', {}, h('th', { scope: 'col', text: 'Monat' }), h('th', { scope: 'col', class: 'num', text: 'Spitze' }), h('th', { scope: 'col', text: 'Zeitpunkt' }), h('th', { scope: 'col', class: 'num', text: 'Leistungspreis' }))),
          h('tbody', {}, ...rows))),
        h('p', { class: 'note', text: 'Leistungspreis brutto, mit den Preisen ab 2027 (Entwurf) auf diese Spitzen gerechnet.' }))));
  }
  box.append(cards);
  const T = charts.tokens();
  charts.render(chart, charts.powerOption(T, { bucket: 'month', axis, days: 400, limit, series: data.map((x) => ({ name: x.name, color: x.color, data: axis.map((m) => { const p = at(x, m); return { v: p ? p.kw : null, t: p ? p.t : null }; }) })) }));
  fillIcons(box);
}

function renderPowerCompare(box, data, kwhs, { thisMonth, lp, gross, ctx }) {
  box.textContent = '';
  const rows = [];
  let sumOld = 0, sumNew = 0, partial = false;
  data.forEach((x, i) => {
    const done = x.peaks.filter((p) => p.start < thisMonth);
    const known = done.filter((p) => p.kw != null);
    if (!kwhs[i] || !known.length) return;
    if (known.length < done.length) partial = true;
    const fill = Math.max(...known.map((p) => p.kw)); // fehlende Monate vorsichtig mit der höchsten Spitze
    const peaks = new Map(done.map((p) => [String(p.start.getMonth() + 1).padStart(2, '0'), p.kw != null ? p.kw : fill]));
    const opts = ctx.costOptions(x.mp);
    const old = yearCost(kwhs[i], { year: 2026, ...opts }).gridGross;
    const neu = yearCost(kwhs[i], { year: 2027, peakKw: peaks, ...opts }).gridGross;
    sumOld += old; sumNew += neu;
    rows.push(h('tr', {}, h('th', { scope: 'row' }, data.length > 1 ? h('span', { class: 'lg-key', style: `background:${x.color}` }) : null, data.length > 1 ? ` ${x.name}` : 'Netz', h('small', { text: `${kwh(kwhs[i])}${x.interruptible ? ', unterbrechbar' : ''}` })),
      h('td', { class: 'num', text: euro(old) }), h('td', { class: 'num', text: euro(neu) }), h('td', { class: 'num', text: signedEuro(neu - old) })));
  });
  if (!rows.length) { box.append(h('p', { class: 'empty', text: 'Für den Vergleich fehlen Messwerte.' })); return; }
  if (rows.length > 1) rows.push(h('tr', { class: 'cost-total' }, h('th', { scope: 'row', text: 'Zusammen' }), h('td', { class: 'num', text: euro(sumOld) }), h('td', { class: 'num', text: euro(sumNew) }), h('td', { class: 'num', text: signedEuro(sumNew - sumOld) })));
  const diff = sumNew - sumOld;
  box.append(
    h('p', { class: 'big-label' }, h('b', { text: Math.abs(diff) < 1 ? 'Etwa gleich viel' : `Rund ${euro(Math.abs(diff))} ${diff < 0 ? 'weniger' : 'mehr'}` }), ' im Jahr fürs Netz, wenn deine Spitzen so bleiben.'),
    h('div', { class: 'tbl-scroll' }, h('table', { class: 'tbl tbl--costs' },
      h('thead', {}, h('tr', {}, h('th', { scope: 'col' }), h('th', { scope: 'col', class: 'num', text: '2026' }), h('th', { scope: 'col', class: 'num', text: 'ab 2027' }), h('th', { scope: 'col', class: 'num', text: 'Unterschied' }))),
      h('tbody', {}, ...rows))),
    h('p', { class: 'note', text: `Jedes kW weniger Monatsspitze spart ${euro(gross(lp.low))} im Monat, über ${POWER_TARIFF.limitKw} kW ${euro(gross(lp.high))}.${partial ? ' Für Monate ohne Viertelstundenwerte rechnet Netzblick mit der höchsten bekannten Spitze.' : ''}` }));
}

const signedEuro = (x) => (Math.abs(x) < 0.005 ? euro(0) : `${x > 0 ? '+' : '−'}${euro(Math.abs(x))}`);
const kpiTile = (label, value, sub) => h('div', { class: 'kpi' },
  h('p', { class: 'kpi-label', text: label }),
  h('p', { class: 'kpi-value', text: value }),
  sub ? h('p', { class: 'kpi-sub', text: sub }) : null);

/* ================================================================ Energiegemeinschaft */
export function renderCommunity(body, ctx) {
  const { state, names } = ctx;
  body.append(h('p', { class: 'page-lead', text: 'Deine Teilnahmen an Energiegemeinschaften, wie sie im Kundenportal von Netz Burgenland stehen.' }));
  const notice = kpNotice(ctx);
  if (notice) body.append(notice);
  const kp = state.kpData;
  if (!kp) return;
  const groups = new Map();
  for (const pod of kp.pods) {
    for (const c of pod.communities || []) {
      if (!groups.has(c.id)) groups.set(c.id, { c, members: [] });
      groups.get(c.id).members.push({ pod, c });
    }
  }
  if (!groups.size) {
    body.append(section('Keine Energiegemeinschaft', null,
      h('p', { class: 'panel-text', text: 'Deine Zählpunkte nehmen laut Kundenportal an keiner Energiegemeinschaft teil.' }),
      h('button', { class: 'link-btn', type: 'button', onclick: () => openExternal(CONTACT.topics.find((t) => /Bürgerenergie/.test(t.label)).url) }, icon('external'), 'Bürgerenergie bei Netz Burgenland')));
    return;
  }
  const labelFor = (id) => {
    const mp = state.mps.find((m) => m.id === id);
    return mp ? meterLabel(mp, names, { compact: true }) : `…${id.slice(-8)}`;
  };
  const colorFor = (id) => { const mp = state.mps.find((m) => m.id === id); return mp ? ctx.meterColor(mp) : 'var(--older)'; };
  const statusOrder = { aktiv: 0, beantragt: 1, beendet: 2 };
  const sorted = [...groups.values()].sort((a, b) => statusOrder[a.c.status] - statusOrder[b.c.status]);
  const cards = h('div', { class: 'cards' });
  body.append(cards);
  for (const { c, members } of sorted) {
    cards.append(h('section', { class: 'panel card' },
      h('div', { class: 'card-head' }, icon('community'), h('h2', { text: ecTypeLabel(c.type) }), h('span', { class: `badge badge--${c.status}`, text: c.status })),
      dl(
        stack(row('Gemeinschafts-ID', h('span', { class: 'idline' }, h('span', { class: 'mono', text: c.id }), h('button', { class: 'icon-btn icon-btn--small', type: 'button', 'aria-label': 'Gemeinschafts-ID kopieren', onclick: () => copy(c.id) }, icon('copy'))))),
        row('Marktpartner', c.partner ? h('span', { class: 'mono', text: c.partner }) : null),
        row('Richtung', c.direction),
        row('Aufteilung', c.model === 'dynamisch' ? 'dynamisch, nach dem Verbrauch der Mitglieder' : c.model === 'statisch' ? `statisch${c.share ? `, fester Anteil ${num(c.share, 0)} %` : ''}` : c.model),
        c.status === 'beantragt' && c.requested ? row('Beantragt am', dateNum(c.requested)) : null,
        row(c.status === 'beendet' ? 'Teilnahme' : 'Teilnahme seit', c.since ? `${dateNum(c.since)}${c.until ? ` bis ${dateNum(c.until)}` : ''}` : null),
        row('Zählpunkte', h('span', { class: 'member-list' }, ...members.map(({ pod }) => {
          const f = currentFactor(pod, c.id);
          return h('span', { class: 'member' }, h('span', { class: 'lg-key', style: `background:${colorFor(pod.id)}` }), ` ${labelFor(pod.id)}${f != null ? `: ${num(f, 0)} %` : ''}`);
        })))),
    ));
  }
  // Verlauf der Teilnahmefaktoren
  const short = (id) => { const g = groups.get(id); return g ? `${ecTypeLabel(g.c.type).replace(/ \(.*\)/, '')} …${id.slice(-6)}` : `…${id.slice(-6)}`; };
  const hist = kp.pods.filter((p) => p.participation && p.participation.length);
  if (hist.length) {
    body.append(section('Teilnahmefaktor im Verlauf', 'Ein Zählpunkt kann an mehreren Gemeinschaften teilnehmen. Der Teilnahmefaktor sagt, welcher Anteil auf welche Gemeinschaft entfällt.',
      ...hist.map((pod) => h('div', { class: 'tbl-scroll' },
        h('p', { class: 'field-title' }, h('span', { class: 'lg-key', style: `background:${colorFor(pod.id)}` }), ' ', labelFor(pod.id)),
        h('table', { class: 'tbl' },
          h('thead', {}, h('tr', {}, h('th', { scope: 'col', text: 'Zeitraum' }), h('th', { scope: 'col', text: 'Gemeinschaft' }), h('th', { scope: 'col', class: 'num', text: 'Faktor' }))),
          h('tbody', {}, ...pod.participation.map((x) => h('tr', {},
            h('td', { text: `${dateNum(x.from)} bis ${x.to ? dateNum(x.to) : 'heute'}` }),
            h('td', { text: short(x.community) }),
            h('td', { class: 'num', text: x.factor != null ? `${num(x.factor, 0)} %` : '–' })))))))));
  }
  body.append(section('Gut zu wissen', null,
    h('ul', { class: 'plain-list' },
      h('li', { text: 'Den Strom aus der Gemeinschaft rechnet die Gemeinschaft selbst ab, nicht dein Lieferant.' }),
      h('li', { text: 'Wie viel Strom du aus der Gemeinschaft bekommst, liefern die Portale von Netz Burgenland nicht. Netzblick rechnet die Netzkosten deshalb so, als käme aller Strom aus dem Netz.' }),
      h('li', { text: 'Teilnahmen beantragst und beendest du über die Gemeinschaft; im Kundenportal stimmst du der Datenfreigabe zu.' })),
    h('button', { class: 'link-btn', type: 'button', onclick: () => openExternal(CONTACT.topics.find((t) => /Bürgerenergie/.test(t.label)).url) }, icon('external'), 'Bürgerenergie bei Netz Burgenland')));
}

/* ================================================================ Störung */
const telLink = (tel) => `tel:${tel}`;
const mapLink = (addr) => (isNative ? `geo:0,0?q=${encodeURIComponent(addr)}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`);

function callCard(entry, primary) {
  return h('button', { class: 'callcard' + (primary ? ' callcard--primary' : ''), type: 'button', onclick: () => openExternal(telLink(entry.tel)) },
    icon('phone'),
    h('span', { class: 'callcard-text' }, h('span', { class: 'callcard-label', text: entry.label }), h('span', { class: 'callcard-number', text: entry.number }), entry.note || entry.hours ? h('small', { text: entry.note || entry.hours }) : null),
    h('span', { class: 'callcard-go', text: 'Anrufen' }));
}

export function renderOutage(body) {
  body.append(h('p', { class: 'page-lead', text: 'Kein Strom? Hier erreichst du Netz Burgenland direkt.' }));
  body.append(h('div', { class: 'callcards' }, callCard(OUTAGE.hotline, true), callCard(OUTAGE.emergency, false)));
  body.append(section('Bevor du anrufst', null,
    h('ul', { class: 'plain-list' },
      h('li', { text: 'Ist nur dein Haus ohne Strom? Dann prüfe zuerst Sicherungen und FI-Schutzschalter.' }),
      h('li', { text: 'Ruf zuerst deinen Elektriker an. Ist er nicht erreichbar, schickt der Störungsdienst einen Betrieb aus dem TOP-NETZ-Partner-Netz.' }),
      h('li', { text: 'Liegt der Fehler in deiner eigenen Anlage und nicht im Netz, zahlst du den Einsatz des Elektrikers.' }))));
  body.append(section('Störungskarte', 'Aktuelle (rot) und geplante (blau) Unterbrechungen im Hoch- und Mittelspannungsnetz. Störungen im Niederspannungsnetz, also in der Straße, zeigt die Karte nicht. Sie wird nicht automatisch aktualisiert.',
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn btn--ghost', type: 'button', onclick: () => openExternal(OUTAGE.map) }, icon('pin'), 'Störungskarte öffnen'),
      h('button', { class: 'btn btn--ghost', type: 'button', onclick: () => openExternal(OUTAGE.report) }, icon('external'), 'Störung online melden'),
      h('button', { class: 'btn btn--ghost', type: 'button', onclick: () => openExternal(OUTAGE.safety) }, icon('external'), 'Sicherheitshinweise'))));
  body.append(h('p', { class: 'fineprint fineprint--page', text: `Angaben von netzburgenland.at, Stand ${STAND}. Netzblick ist eine inoffizielle App.` }));
}

/* ================================================================ Kontakt */
export function renderContact(body) {
  const C = CONTACT;
  body.append(h('p', { class: 'page-lead', text: 'Fragen zu Anschluss, Zähler, Smart Meter oder Rechnung des Netzbetreibers.' }));
  body.append(h('div', { class: 'callcards' }, callCard(C.phone, true)));
  body.append(section(C.company, null,
    dl(
      row('Adresse', h('button', { class: 'link-btn', type: 'button', onclick: () => openExternal(mapLink(C.address)) }, icon('pin'), C.address)),
      row('E-Mail', h('button', { class: 'link-btn', type: 'button', onclick: () => openExternal(`mailto:${C.email}`) }, icon('mail'), C.email)),
      row('Kontaktformular', h('button', { class: 'link-btn', type: 'button', onclick: () => openExternal(C.form) }, icon('external'), 'Online schreiben (laut Netz Burgenland der schnellste Weg)')))));
  body.append(section('Servicezentren', `${C.centers.hours}, Telefon ${C.centers.phone.number}`,
    h('ul', { class: 'center-list', role: 'list' }, ...C.centers.list.map((x) => h('li', {},
      h('div', { class: 'center-text' }, h('b', { text: x.name }), h('span', { text: x.address })),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': `${x.name} auf der Karte`, onclick: () => openExternal(mapLink(x.address)) }, icon('pin'))))),
    h('button', { class: 'btn btn--ghost', type: 'button', onclick: () => openExternal(telLink(C.centers.phone.tel)) }, icon('phone'), `${C.centers.phone.number} anrufen`)));
  body.append(section('Themen', null,
    h('ul', { class: 'plain-list plain-list--links' }, ...C.topics.map((t) => h('li', {}, h('button', { class: 'link-btn', type: 'button', onclick: () => openExternal(t.url) }, icon('external'), t.label))))));
  body.append(section('Fragen zur App', 'Netzblick ist nicht von Netz Burgenland. Für Fragen und Fehler in der App:',
    h('button', { class: 'link-btn', type: 'button', onclick: () => openExternal('mailto:patrick-schloegl@gmx.at') }, icon('mail'), 'patrick-schloegl@gmx.at')));
  body.append(h('p', { class: 'fineprint fineprint--page', text: `Angaben von netzburgenland.at, Stand ${STAND}.` }));
}
