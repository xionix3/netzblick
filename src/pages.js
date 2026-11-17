// Seiten neben der Verbrauchsansicht: Anlagen, Abrechnung, Konto, Info
import { h, icon, toast, row, brandMark, spinBrand, fillIcons } from './ui.js';
import { meterLabel, firstDataDate } from './model.js';
import { parseBillingPeriod } from './kundenportal.js';
import { billingYearStatus, consumptionFor } from './billing.js';
import { makePeriod, addDays, startOfDay, daysBetween } from './time.js';
import { num, kwh, euro, pct, dateNum, dateLong, time, MONTHS_LONG } from './format.js';
import * as charts from './charts.js';
import { secure } from './platform.js';
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
    const ec = pod && pod.energyCommunity;

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
        pod && pod.gridLevel != null ? row('Netzebene', `${pod.gridLevel}${GRID_LEVELS[pod.gridLevel] ? ` (${GRID_LEVELS[pod.gridLevel]})` : ''}`) : null,
        row('Lastprofil', pod && pod.loadProfile),
        row('Lieferant', pod && pod.supplier),
        pod && pod.contractFrom && !isNaN(pod.contractFrom) ? row('Vertrag seit', dateNum(pod.contractFrom)) : null,
        row('Letzte Abrechnung', pod && pod.lastBillingPeriod),
        ec ? row('Energiegemeinschaft', [ec.type || 'Teilnahme', ec.share != null ? `Anteil ${num(ec.share, 0)} %` : null, ec.since && !isNaN(ec.since) ? `seit ${dateNum(ec.since)}` : null].filter(Boolean).join(', ')) : null,
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
    billingYearStatus(state.store, mp, last).then((st) => {
      box.textContent = '';
      if (!st || st.sum == null) { box.append(h('p', { class: 'empty', text: 'Für das laufende Abrechnungsjahr liegen noch keine Messwerte vor.' })); return; }
      const price = state.settings.pricePerKwh;
      const fee = state.settings.feePerMonth || 0;
      const endLabel = dateLong(addDays(st.curEnd, -1));
      const compareBase = st.prevTotal || billedKwh;
      const change = st.projection && compareBase ? (st.projection - compareBase) / compareBase : null;
      box.append(
        h('div', { class: 'big-figure' }, h('span', { class: 'big-value', text: num(st.sum, 0) }), h('span', { class: 'big-unit', text: 'kWh' })),
        h('p', { class: 'big-label', text: `verbraucht seit ${dateNum(st.curStart)}, Messwerte bis ${dateNum(addDays(st.upto, -1))}` }),
        dl(
          row('Hochrechnung', st.projection ? `${kwh(st.projection)} bis ${endLabel}` : `ab 14 Tagen mit Messwerten (jetzt ${st.covered})`),
          st.projection ? row('Rechenweg', st.method === 'vorjahr' ? 'mit dem Verlauf des letzten Abrechnungsjahres (Winter zählt mehr als Sommer)' : 'gleichmäßig weitergerechnet (kein Vorjahr zum Vergleich)') : null,
          change != null ? row('Gegenüber letztem Jahr', `${change >= 0 ? '+' : '−'}${pct(Math.abs(change), 1)}${change > 0.02 ? ', mehr als zuletzt' : change < -0.02 ? ', weniger als zuletzt' : ', etwa gleich'}`) : null,
          row('Letztes Jahr gemessen', st.prevTotal ? kwh(st.prevTotal) : null),
          row('Letztes Jahr abgerechnet', billedKwh != null ? kwh(billedKwh) : null),
        ),
      );
      // Kosten gegen Teilbeträge
      if (price != null && st.projection) {
        const cost = st.projection * price + fee * 12;
        const plan = billingEntry && billingEntry.partPayments && !billingEntry.partPayments.external ? billingEntry.partPayments.installments : [];
        const inYear = plan.filter((x) => x.due && x.due >= st.curStart && x.due < st.curEnd);
        const paid = inYear.reduce((a, x) => a + (x.amount || 0), 0);
        box.append(dl(
          row('Kosten hochgerechnet', `${euro(cost)} bei ${num(price * 100, 2)} ct/kWh${fee ? ` und ${euro(fee)} im Monat` : ''}`),
          inYear.length ? row('Teilbeträge im Jahr', `${euro(paid)} (${inYear.length} × ${euro(inYear[0].amount)})`) : null,
          inYear.length ? row(cost > paid ? 'Nachzahlung ca.' : 'Guthaben ca.', euro(Math.abs(cost - paid))) : null,
        ));
      } else if (price == null) {
        box.append(h('button', { class: 'pill pill--link', type: 'button', onclick: ctx.openSettings }, 'Strompreis eintragen, um die Kosten hochzurechnen'));
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
    h('p', { class: 'info-ver', text: `Version ${ctx.APP_VERSION}` }));
  body.append(hero);
  requestAnimationFrame(() => requestAnimationFrame(() => spinBrand(mark, ['1', '8', '0'])));

  const list = (...items) => h('ul', { class: 'plain-list' }, ...items.map((x) => h('li', {}, x)));
  body.append(
    section('Von', null,
      h('p', { class: 'panel-text' }, 'Patrick Schlögl, geister-it'),
      h('p', { class: 'panel-text' }, h('a', { href: 'mailto:patrick-schloegl@gmx.at', class: 'link' }, 'patrick-schloegl@gmx.at'))),
    section('Woher die Daten kommen', null, list(
      'Messwerte und Zählerstände: Smart-Meter-Portal von Netz Burgenland (smartmeter.netzburgenland.at)',
      'Anlagen, Verträge und Abrechnungen: Kundenportal von Netz Burgenland (portal.netzburgenland.at)',
    )),
    section('Datenschutz', null, list(
      'Zugangsdaten werden verschlüsselt im Android-Schlüsselspeicher dieses Geräts abgelegt.',
      'Netzblick schickt Daten nur an die beiden Portale von Netz Burgenland. Es gibt keinen eigenen Server, keine Werbung und keine Analyse.',
      'Abmelden löscht Zugangsdaten und zwischengespeicherte Messwerte.',
    )),
    section('Hinweis', null, h('p', { class: 'panel-text', text: 'Netzblick ist eine inoffizielle App und steht in keiner Verbindung zu Netz Burgenland oder den Herstellern der Portale. Kosten und Hochrechnungen sind Schätzungen; maßgeblich ist deine Rechnung.' })),
    section('Verwendete Bausteine', null, list(
      'Apache ECharts, Apache-Lizenz 2.0',
      'Capacitor, MIT-Lizenz',
      'Schrift Barlow, SIL Open Font License 1.1',
    )),
    h('p', { class: 'fineprint fineprint--page', text: '© 2026 Patrick Schlögl (geister-it). Netzblick steht unter der MIT-Lizenz.' }),
  );
}
