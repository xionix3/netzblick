// Diagramme (ECharts, nur benötigte Module → kleines Bundle)
import * as echarts from 'echarts/core';
import { BarChart, LineChart, HeatmapChart, PieChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, VisualMapComponent, CalendarComponent, MarkPointComponent, MarkLineComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { num, time, dateLong, dateShort, dateNum, WEEKDAYS_SHORT, MONTHS_SHORT, MONTHS_LONG, isoDate } from './format.js';
import { STATUS_LABEL } from './model.js';

echarts.use([BarChart, LineChart, HeatmapChart, PieChart, GridComponent, TooltipComponent, VisualMapComponent, CalendarComponent, MarkPointComponent, MarkLineComponent, CanvasRenderer]);

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Farb- und Schrift-Tokens aus dem CSS lesen (hell/dunkel) */
export function tokens() {
  const cs = getComputedStyle(document.documentElement);
  const v = (n) => cs.getPropertyValue(n).trim();
  return {
    surface: v('--surface'), ink: v('--ink'), ink2: v('--ink-2'), muted: v('--muted'), line: v('--line'), axis: v('--axis'),
    s: [v('--series-1'), v('--series-2'), v('--series-3'), v('--series-4')],
    compare: v('--compare'), older: v('--older'),
    seq: v('--seq').split(',').map((x) => x.trim()),
    div: v('--div').split(',').map((x) => x.trim()),
    divBar: v('--div-bar').split(',').map((x) => x.trim()),
    font: v('--font-ui') || 'sans-serif',
  };
}

const hosts = new WeakMap();
const ro = typeof ResizeObserver !== 'undefined'
  ? new ResizeObserver((entries) => entries.forEach((e) => { const c = hosts.get(e.target); if (c) c.resize(); }))
  : null;

export function render(el, option) {
  let c = hosts.get(el);
  if (!c) {
    c = echarts.init(el, null, { renderer: 'canvas' });
    hosts.set(el, c);
    if (ro) ro.observe(el);
  }
  c.setOption(option, true);
  return c;
}

export function dispose(el) {
  const c = hosts.get(el);
  if (c) { c.dispose(); hosts.delete(el); if (ro) ro.unobserve(el); }
}

function baseTooltip(T, extra = {}) {
  return {
    trigger: 'axis',
    confine: true,
    backgroundColor: T.surface,
    borderColor: T.line,
    borderWidth: 1,
    padding: [8, 10],
    textStyle: { color: T.ink, fontFamily: T.font, fontSize: 13 },
    extraCssText: 'box-shadow:0 6px 24px rgba(0,0,0,.14);border-radius:10px;',
    ...extra,
  };
}

const row = (color, value, label, dashed) =>
  `<div class="tt-row"><span class="tt-key${dashed ? ' tt-key--cmp' : ''}" style="background:${color}"></span><b>${esc(value)}</b><span>${esc(label)}</span></div>`;

function yAxis(T, unit) {
  return {
    type: 'value',
    name: unit,
    nameLocation: 'end',
    nameGap: 10,
    nameTextStyle: { color: T.muted, fontFamily: T.font, fontSize: 11, align: 'left', padding: [0, 0, 0, -28] },
    splitNumber: 4,
    axisLine: { show: false },
    axisTick: { show: false },
    splitLine: { lineStyle: { color: T.line, width: 1 } },
    axisLabel: { color: T.muted, fontFamily: T.font, fontSize: 11, formatter: (x) => num(x, x === 0 || x >= 10 ? 0 : x < 1 ? 2 : 1) },
  };
}

/** Beschriftung einer Kategorie-Achse je nach Bucket */
function axisLabelFor(bucket, axis, days) {
  if (bucket === 'quarter') {
    const multiDay = days > 1;
    const long = days > 7; // Monat in Viertelstunden: jede Woche ein Datum
    return {
      interval: (i) => {
        const d = axis[i];
        if (!d) return false;
        if (long) return d.getHours() === 0 && d.getMinutes() === 0 && (d.getDate() - 1) % 7 === 0;
        if (multiDay) return d.getHours() === 0 && d.getMinutes() === 0;
        return d.getMinutes() === 0 && d.getHours() % 6 === 0;
      },
      formatter: (_, i) => {
        const d = axis[i];
        return long ? `${d.getDate()}.${d.getMonth() + 1}.` : multiDay ? WEEKDAYS_SHORT[(d.getDay() + 6) % 7] : time(d);
      },
    };
  }
  if (bucket === 'day') {
    const step = axis.length > 40 ? 14 : axis.length > 14 ? 7 : 1;
    return {
      interval: (i) => (axis.length <= 14 ? true : (i % step === 0)),
      formatter: (_, i) => (axis.length <= 7 ? WEEKDAYS_SHORT[(axis[i].getDay() + 6) % 7] : axis.length <= 31 ? String(axis[i].getDate()) : dateShort(axis[i])),
    };
  }
  if (bucket === 'month') {
    return { interval: (i) => axis.length <= 12 || i % 3 === 0, formatter: (_, i) => (axis.length <= 12 ? MONTHS_SHORT[axis[i].getMonth()] : `${MONTHS_SHORT[axis[i].getMonth()]} ${String(axis[i].getFullYear()).slice(2)}`) };
  }
  return { interval: 0, formatter: (_, i) => (axis.length > 6 ? `’${String(axis[i].getFullYear()).slice(2)}` : String(axis[i].getFullYear())) };
}

export function bucketLabel(bucket, d) {
  if (bucket === 'quarter') return `${dateLong(d)}, ${time(d)}–${time(new Date(d.getTime() + 900000))}`;
  if (bucket === 'hour') return `${dateLong(d)}, ${time(d)}–${time(new Date(d.getTime() + 3600000))}`;
  if (bucket === 'day') return dateLong(d);
  if (bucket === 'month') return `${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
  return String(d.getFullYear());
}

/** Welche Darstellung „automatisch“ bedeutet */
export function autoChartType(bucket) {
  return bucket === 'quarter' ? 'area' : 'bar';
}

/**
 * Hauptdiagramm.
 * cfg: {bucket, axis:[Date], days, type:'bar'|'line'|'area',
 *       series:[{name, color, data:[{v,s}]}], compare:{name, data:[number|null], axis:[Date]}|null}
 * Balken und Flächen stapeln mehrere Zählpunkte (Summe), Linien zeigen sie einzeln (Vergleich).
 */
export function mainOption(T, cfg) {
  const { bucket, axis, series, compare } = cfg;
  const type = cfg.type || autoChartType(bucket);
  const power = bucket === 'quarter';
  const factor = power ? 4 : 1; // kWh je Viertelstunde → kW
  const unit = power ? 'kW' : 'kWh';
  const multi = series.length > 1;
  const stacked = multi && type !== 'line';
  const continuous = type !== 'bar';
  // Blass nur bei Tages-/Viertelstundenwerten; ein Ersatzwert soll keinen ganzen Monat einfärben
  const est = (s) => (bucket === 'day' || bucket === 'quarter') && s && s !== 'W';
  const fewPoints = axis.length <= 31;
  const out = [];

  if (compare) {
    out.push({
      name: compare.name,
      type: 'line',
      data: compare.data.map((v) => (v == null ? null : v * factor)),
      step: continuous ? false : 'middle',
      showSymbol: false,
      lineStyle: { color: T.compare, width: 1.5, type: continuous ? [4, 3] : 'solid' },
      itemStyle: { color: T.compare },
      z: 1,
      silent: true,
      animation: false,
    });
  }
  series.forEach((s, si) => {
    if (continuous) {
      out.push({
        name: s.name,
        type: 'line',
        stack: stacked ? 'sum' : undefined,
        data: s.data.map((p) => (p.v == null ? null : p.v * factor)),
        showSymbol: !power && fewPoints,
        symbol: 'circle',
        symbolSize: 8,
        smooth: power ? false : 0.2,
        lineStyle: { color: s.color, width: 2, join: 'round', cap: 'round' },
        itemStyle: { color: s.color, borderColor: T.surface, borderWidth: 2 },
        areaStyle: type === 'area' ? { color: s.color, opacity: stacked ? 0.3 : 0.14 } : undefined,
        emphasis: { disabled: true },
        z: 3 + si,
        connectNulls: false,
      });
    } else {
      out.push({
        name: s.name,
        type: 'bar',
        stack: stacked ? 'sum' : undefined,
        barMaxWidth: 24,
        barCategoryGap: axis.length > 60 ? '12%' : axis.length > 20 ? '28%' : '40%',
        data: s.data.map((p) => ({
          value: p.v == null ? null : p.v * factor,
          itemStyle: {
            color: s.color,
            opacity: est(p.s) ? 0.45 : 1,
            borderRadius: axis.length > 120 ? 0 : stacked ? (si === series.length - 1 ? [4, 4, 0, 0] : 0) : [4, 4, 0, 0],
            borderColor: stacked ? T.surface : undefined,
            borderWidth: stacked ? 1 : 0,
          },
        })),
        emphasis: { itemStyle: { opacity: 0.85 } },
        z: 3,
      });
    }
  });

  const fmtVal = (v) => (v == null ? '–' : `${num(v, power && v < 10 ? 2 : undefined)} ${unit}`);
  return {
    animationDuration: 450,
    animationEasing: 'cubicOut',
    textStyle: { fontFamily: T.font },
    grid: { left: 6, right: 10, top: 30, bottom: 6, containLabel: true },
    tooltip: baseTooltip(T, {
      axisPointer: continuous
        ? { type: 'line', lineStyle: { color: T.axis, width: 1 }, snap: true }
        : { type: 'shadow', shadowStyle: { color: T.line, opacity: 0.5 } },
      formatter: (params) => {
        const i = params[0].dataIndex;
        const d = axis[i];
        let html = `<div class="tt-title">${esc(bucketLabel(bucket, d))}</div>`;
        let sum = 0, any = false;
        series.forEach((s) => {
          const p = s.data[i];
          if (p.v != null) { sum += p.v; any = true; }
          html += row(s.color, fmtVal(p.v == null ? null : p.v * factor), s.name + (est(p.s) ? ` (${STATUS_LABEL[p.s]})` : ''));
        });
        if (multi && any) html += row('transparent', fmtVal(sum * factor), 'zusammen');
        if (power && any) html += `<div class="tt-sub">${num(sum, 3)} kWh in 15 Minuten</div>`;
        if (compare) {
          const cv = compare.data[i];
          const cd = compare.axis[i];
          html += row(T.compare, fmtVal(cv == null ? null : cv * factor), cd ? bucketLabel(bucket, cd) : compare.name, true);
        }
        return html;
      },
    }),
    xAxis: {
      type: 'category',
      data: axis.map((d) => d.getTime()),
      boundaryGap: !continuous,
      axisLine: { lineStyle: { color: T.axis } },
      axisTick: { show: false },
      axisLabel: { color: T.muted, fontFamily: T.font, fontSize: 11, hideOverlap: true, ...axisLabelFor(bucket, axis, cfg.days) },
    },
    yAxis: yAxis(T, unit),
    series: out,
  };
}

/**
 * Leistungsansicht: Viertelstunden-Leistung (bucket 'quarter') oder Monatsspitzen (bucket 'month') in kW,
 * je Zählpunkt einzeln (der Leistungspreis gilt je Zählpunkt), mit Grenzlinie und markierter Spitze.
 * cfg: {bucket, axis:[Date], days, series:[{name, color, data:[{v: kW|null, s, t?}]}], limit: kW|null}
 */
export function powerOption(T, cfg) {
  const { bucket, axis, series, limit } = cfg;
  const months = bucket === 'month';
  const single = series.length === 1;
  // Nur die höchste Spitze beschriften, sonst überlappen die Marken mehrerer Zählpunkte
  const maxOf = (s) => s.data.reduce((a, p) => (p.v != null && p.v > a ? p.v : a), -Infinity);
  const top = series.reduce((bi, s, i) => (maxOf(s) > maxOf(series[bi]) ? i : bi), 0);
  const out = series.map((s, si) => {
    const base = {
      name: s.name,
      z: 3 + si,
      data: s.data.map((p) => (p.v == null ? null : p.v)),
      markPoint: {
        symbol: 'circle',
        symbolSize: 9,
        itemStyle: { color: s.color, borderColor: T.surface, borderWidth: 2 },
        label: { show: true, position: 'top', distance: 6, color: T.ink, fontFamily: T.font, fontSize: 12, fontWeight: 600, formatter: (p) => `${num(p.value, 1)} kW` },
        data: si === top ? [{ type: 'max' }] : [],
        animation: false,
      },
    };
    if (months) {
      return {
        ...base,
        type: 'bar',
        barMaxWidth: 18,
        barGap: '12%',
        barCategoryGap: axis.length > 24 ? '20%' : '36%',
        itemStyle: { color: s.color, borderRadius: [4, 4, 0, 0] },
        emphasis: { itemStyle: { opacity: 0.85 } },
      };
    }
    return {
      ...base,
      type: 'line',
      showSymbol: false,
      smooth: false,
      connectNulls: false,
      lineStyle: { color: s.color, width: single ? 1.5 : 1.25, join: 'round' },
      itemStyle: { color: s.color },
      areaStyle: single ? { color: s.color, opacity: 0.14 } : undefined,
      emphasis: { disabled: true },
    };
  });
  if (limit != null && out.length) {
    out[0].markLine = {
      silent: true,
      symbol: 'none',
      animation: false,
      lineStyle: { color: T.ink2, width: 1.5, type: [6, 4] },
      label: { show: true, position: 'insideEndTop', color: T.ink2, fontFamily: T.font, fontSize: 11, fontWeight: 600, formatter: `${num(limit, 0)} kW` },
      data: [{ yAxis: limit }],
    };
  }
  const y = yAxis(T, 'kW');
  if (limit != null) y.max = (v) => Math.ceil(Math.max(v.max, limit) * 1.12);
  return {
    animationDuration: 450,
    animationEasing: 'cubicOut',
    textStyle: { fontFamily: T.font },
    grid: { left: 6, right: 16, top: 30, bottom: 6, containLabel: true },
    tooltip: baseTooltip(T, {
      axisPointer: months
        ? { type: 'shadow', shadowStyle: { color: T.line, opacity: 0.5 } }
        : { type: 'line', lineStyle: { color: T.axis, width: 1 }, snap: true },
      formatter: (params) => {
        const i = params[0].dataIndex;
        let html = `<div class="tt-title">${esc(months ? `Höchste Viertelstunde ${MONTHS_LONG[axis[i].getMonth()]} ${axis[i].getFullYear()}` : bucketLabel('quarter', axis[i]))}</div>`;
        series.forEach((s) => {
          const p = s.data[i];
          const when = months && p.t ? `${dateNum(p.t)}, ${time(p.t)} Uhr` : '';
          html += row(s.color, p.v == null ? '–' : `${num(p.v, 2)} kW`, [single ? '' : s.name, when].filter(Boolean).join(', ') || (months ? '' : 'mittlere Leistung'));
          if (limit != null && p.v != null && p.v > limit) html += `<div class="tt-sub">${esc(single ? '' : s.name + ': ')}${num(p.v - limit, 2)} kW über ${num(limit, 0)} kW</div>`;
        });
        return html;
      },
    }),
    xAxis: {
      type: 'category',
      data: axis.map((d) => d.getTime()),
      boundaryGap: months,
      axisLine: { lineStyle: { color: T.axis } },
      axisTick: { show: false },
      axisLabel: { color: T.muted, fontFamily: T.font, fontSize: 11, hideOverlap: true, ...axisLabelFor(months ? 'month' : 'quarter', axis, cfg.days) },
    },
    yAxis: y,
    series: out,
  };
}

/**
 * Energiepreis im dynamischen Tarif (brutto, Cent/kWh) für heute und morgen als Treppenlinie.
 * cfg: {pts: [{t: Date, v: ct brutto, spot: ct netto}], step (ms), now: Date}
 */
export function spotOption(T, cfg) {
  const { pts, step, now } = cfg;
  const axis = pts.map((p) => p.t);
  const nowIdx = pts.findIndex((p) => p.t <= now && now < new Date(p.t.getTime() + step));
  const dayName = (d) => {
    const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const diff = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - t0) / 86400000);
    return diff === 0 ? 'Heute' : diff === 1 ? 'Morgen' : WEEKDAYS_SHORT[(d.getDay() + 6) % 7];
  };
  return {
    animationDuration: 400,
    textStyle: { fontFamily: T.font },
    grid: { left: 6, right: 12, top: 30, bottom: 6, containLabel: true },
    tooltip: baseTooltip(T, {
      axisPointer: { type: 'line', lineStyle: { color: T.axis, width: 1 } },
      formatter: (params) => {
        const p = pts[params[0].dataIndex];
        const end = new Date(p.t.getTime() + step);
        return `<div class="tt-title">${esc(`${dayName(p.t)}, ${time(p.t)}–${time(end)} Uhr`)}</div>` +
          row(T.s[0], `${num(p.v, 2)} ct/kWh`, 'dein Energiepreis') +
          `<div class="tt-sub">Börse ${num(p.spot, 2)} ct netto</div>`;
      },
    }),
    xAxis: {
      type: 'category',
      data: axis.map((d) => d.getTime()),
      boundaryGap: false,
      axisLine: { lineStyle: { color: T.axis } },
      axisTick: { show: false },
      axisLabel: {
        color: T.muted, fontFamily: T.font, fontSize: 11, hideOverlap: true,
        interval: (i) => { const d = axis[i]; return !!d && d.getMinutes() === 0 && d.getHours() % 6 === 0; },
        formatter: (_, i) => { const d = axis[i]; return d.getHours() === 0 ? dayName(d) : `${d.getHours()} Uhr`; },
      },
    },
    yAxis: yAxis(T, 'ct/kWh'),
    series: [{
      type: 'line',
      step: 'end',
      data: pts.map((p) => p.v),
      showSymbol: false,
      lineStyle: { color: T.s[0], width: 2 },
      areaStyle: { color: T.s[0], opacity: 0.12 },
      emphasis: { disabled: true },
      markPoint: {
        symbol: 'circle', symbolSize: 8,
        itemStyle: { color: T.s[0], borderColor: T.surface, borderWidth: 2 },
        label: { show: true, position: 'top', distance: 6, color: T.ink, fontFamily: T.font, fontSize: 11, fontWeight: 600, formatter: (p) => `${num(p.value, 1)} ct` },
        data: [{ type: 'min' }, { type: 'max' }],
        animation: false,
      },
      markLine: nowIdx >= 0 ? {
        silent: true, symbol: 'none', animation: false,
        lineStyle: { color: T.ink2, width: 1.5, type: [4, 3] },
        label: { show: true, position: 'insideEndTop', color: T.ink2, fontFamily: T.font, fontSize: 11, fontWeight: 600, formatter: 'Jetzt' },
        data: [{ xAxis: nowIdx }],
      } : undefined,
    }],
  };
}

/** Unterschied zum Durchschnitt als Text */
function vsAvg(v, mid) {
  const d = v - mid;
  if (Math.abs(d) < 0.05) return 'wie der Durchschnitt';
  return `${num(Math.abs(d), 2)} ct ${d < 0 ? 'unter' : 'über'} dem Durchschnitt`;
}

/**
 * Börsenpreise eines Tages als Säulen, gefärbt von günstig (blau) über den Tagesschnitt (grau) bis teuer (rot).
 * cfg: {pts: [{t, v, spot}], step (ms), now: Date | null, scale: {mid, lo, hi}, label: 'Börse netto' | 'dein Preis brutto'}
 */
export function spotDayOption(T, cfg) {
  const { pts, step, now, scale, label } = cfg;
  const axis = pts.map((p) => p.t);
  const nowIdx = now ? pts.findIndex((p) => p.t <= now && now < new Date(p.t.getTime() + step)) : -1;
  const wide = pts.length <= 30; // Stundenwerte
  return {
    animationDuration: 350,
    textStyle: { fontFamily: T.font },
    grid: { left: 6, right: 12, top: 32, bottom: 6, containLabel: true },
    tooltip: baseTooltip(T, {
      axisPointer: { type: 'shadow', shadowStyle: { color: T.line, opacity: 0.45 } },
      formatter: (params) => {
        const p = pts[params[0].dataIndex];
        if (p.v == null) return `<div class="tt-title">${esc(`${time(p.t)} Uhr`)}</div><div class="tt-sub">kein Preis</div>`;
        const end = new Date(p.t.getTime() + step);
        const color = p.v <= scale.mid ? T.divBar[0] : T.divBar[2];
        let html = `<div class="tt-title">${esc(`${time(p.t)}–${time(end)} Uhr`)}</div>` + row(color, `${num(p.v, 2)} ct/kWh`, label);
        if (p.spot != null && p.spot !== p.v) html += `<div class="tt-sub">Börse ${num(p.spot, 2)} ct netto</div>`;
        else if (p.spot != null) html += `<div class="tt-sub">${num(p.spot * 10, 2)} €/MWh</div>`;
        html += `<div class="tt-sub">${esc(vsAvg(p.v, scale.mid))}</div>`;
        return html;
      },
    }),
    visualMap: {
      show: false, dimension: 1, seriesIndex: 0, min: scale.lo, max: scale.hi,
      inRange: { color: T.divBar }, calculable: false,
    },
    xAxis: {
      type: 'category',
      data: axis.map((d) => d.getTime()),
      axisLine: { lineStyle: { color: T.axis } },
      axisTick: { show: false },
      axisLabel: {
        color: T.muted, fontFamily: T.font, fontSize: 11, hideOverlap: true,
        interval: (i) => { const d = axis[i]; return !!d && d.getMinutes() === 0 && d.getHours() % 3 === 0; },
        formatter: (_, i) => `${axis[i].getHours()} Uhr`,
      },
    },
    yAxis: yAxis(T, 'ct/kWh'),
    series: [{
      type: 'bar',
      data: pts.map((p, i) => [i, p.v]),
      barCategoryGap: wide ? '18%' : '12%',
      itemStyle: { borderRadius: wide ? [3, 3, 0, 0] : [1, 1, 0, 0] },
      emphasis: { itemStyle: { opacity: 0.85 } },
      markPoint: {
        symbol: 'circle', symbolSize: 7,
        itemStyle: { color: T.ink, borderColor: T.surface, borderWidth: 2 },
        label: { show: true, position: 'top', distance: 5, color: T.ink, fontFamily: T.font, fontSize: 11, fontWeight: 600, formatter: (p) => `${num(p.value, 1)} ct` },
        data: [{ type: 'min', valueDim: 'y' }, { type: 'max', valueDim: 'y' }],
        animation: false,
      },
      markLine: {
        silent: true, symbol: 'none', animation: false,
        data: [
          { yAxis: scale.mid, lineStyle: { color: T.ink2, width: 1, type: [2, 3] }, label: { show: true, position: 'insideStartTop', color: T.ink2, fontFamily: T.font, fontSize: 11, formatter: `Ø ${num(scale.mid, 1)}` } },
          ...(nowIdx >= 0 ? [{ xAxis: nowIdx, lineStyle: { color: T.ink, width: 1.5, type: [4, 3] }, label: { show: true, position: 'insideEndTop', color: T.ink, fontFamily: T.font, fontSize: 11, fontWeight: 600, formatter: 'Jetzt' } }] : []),
        ],
      },
    }],
  };
}

/**
 * Teppich der Börsenpreise: Tage (waagrecht) × Stunden (senkrecht), gefärbt um den Durchschnitt des Zeitraums.
 * cfg: {days: [Date], cells: [[tag, stunde, ct]], scale: {mid, lo, hi}, label}
 */
export function spotCarpetOption(T, cfg) {
  const { days, cells, scale, label } = cfg;
  const n = days.length;
  const labelDay = (i) => {
    const d = days[i];
    if (!d) return false;
    if (n <= 10) return true;
    if (n <= 40) return d.getDay() === 1;
    if (n <= 120) return d.getDate() === 1 || d.getDate() === 15;
    return d.getDate() === 1 && d.getMonth() % 2 === 0;
  };
  return {
    animation: false,
    textStyle: { fontFamily: T.font },
    grid: { left: 4, right: 8, top: 6, bottom: 4, containLabel: true },
    tooltip: {
      ...baseTooltip(T),
      trigger: 'item',
      formatter: (p) => {
        const [di, h, v] = p.data;
        return `<div class="tt-title">${esc(dateLong(days[di]))}, ${String(h).padStart(2, '0')}–${String(h + 1).padStart(2, '0')} Uhr</div>`
          + row(v <= scale.mid ? T.divBar[0] : T.divBar[2], `${num(v, 2)} ct/kWh`, label)
          + `<div class="tt-sub">${esc(vsAvg(v, scale.mid))}</div>`;
      },
    },
    xAxis: {
      type: 'category',
      data: days.map((d) => d.getTime()),
      axisLine: { show: false },
      axisTick: { show: false },
      splitArea: { show: false },
      axisLabel: {
        color: T.muted, fontSize: 11, hideOverlap: true,
        interval: (i) => labelDay(i),
        formatter: (_, i) => {
          const d = days[i];
          if (n <= 10) return `${WEEKDAYS_SHORT[(d.getDay() + 6) % 7]} ${d.getDate()}.`;
          if (n <= 120) return `${d.getDate()}.${d.getMonth() + 1}.`;
          return MONTHS_SHORT[d.getMonth()];
        },
      },
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: Array.from({ length: 24 }, (_, h) => h),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: T.muted, fontSize: 11, interval: 0, formatter: (h) => (Number(h) % 6 === 0 ? `${h} Uhr` : '') },
    },
    visualMap: { show: false, min: scale.lo, max: scale.hi, dimension: 2, inRange: { color: T.div }, calculable: false },
    series: [{
      type: 'heatmap',
      data: cells,
      itemStyle: n <= 45 ? { borderColor: T.surface, borderWidth: 1, borderRadius: 2 } : { borderWidth: 0 },
      emphasis: { itemStyle: { borderColor: T.ink, borderWidth: 1.5 } },
      progressive: 0,
    }],
  };
}

/** Typischer Tagesverlauf der Börsenpreise: Mittel je Stunde für Werktage und Wochenende */
export function spotProfileOption(T, cfg) {
  const { weekday, weekend, label } = cfg;
  const axis = Array.from({ length: 24 }, (_, h) => h);
  const s = [];
  if (weekday) s.push({ name: 'Werktage', color: T.s[0], data: weekday });
  if (weekend) s.push({ name: 'Wochenende', color: T.s[1], data: weekend });
  return {
    animationDuration: 350,
    textStyle: { fontFamily: T.font },
    grid: { left: 6, right: 14, top: 30, bottom: 6, containLabel: true },
    tooltip: baseTooltip(T, {
      axisPointer: { type: 'line', lineStyle: { color: T.axis, width: 1 } },
      formatter: (params) => {
        const h = params[0].dataIndex;
        let html = `<div class="tt-title">${String(h).padStart(2, '0')}–${String(h + 1).padStart(2, '0')} Uhr, Durchschnitt</div>`;
        s.forEach((x) => { html += row(x.color, x.data[h] == null ? '–' : `${num(x.data[h], 2)} ct/kWh`, x.name); });
        return html + `<div class="tt-sub">${esc(label)}</div>`;
      },
    }),
    xAxis: {
      type: 'category', data: axis, boundaryGap: false,
      axisLine: { lineStyle: { color: T.axis } }, axisTick: { show: false },
      axisLabel: { color: T.muted, fontSize: 11, interval: (i) => i % 6 === 0, formatter: (h) => `${h} Uhr` },
    },
    yAxis: yAxis(T, 'ct/kWh'),
    series: s.map((x) => ({
      name: x.name, type: 'line', data: x.data, showSymbol: false, smooth: 0.2,
      lineStyle: { color: x.color, width: 2 }, itemStyle: { color: x.color },
      emphasis: { disabled: true },
    })),
  };
}

/**
 * Tagesmittel der Börsenpreise je Land, günstigstes oben. Österreich in der ersten Reihenfarbe, die anderen grau.
 * cfg: {rows: [{name, avg, min, max, home}]}
 */
export function zonesOption(T, cfg) {
  const rows = cfg.rows;
  const home = rows.find((r) => r.home);
  return {
    animationDuration: 350,
    textStyle: { fontFamily: T.font },
    grid: { left: 6, right: 62, top: 6, bottom: 6, containLabel: true },
    tooltip: baseTooltip(T, {
      axisPointer: { type: 'shadow', shadowStyle: { color: T.line, opacity: 0.45 } },
      formatter: (params) => {
        const r = rows[params[0].dataIndex];
        let html = `<div class="tt-title">${esc(r.name)}</div>` + row(r.home ? T.s[0] : T.compare, `${num(r.avg, 2)} ct/kWh`, 'Tagesschnitt netto');
        html += `<div class="tt-sub">${num(r.min, 2)} bis ${num(r.max, 2)} ct</div>`;
        if (home && !r.home) {
          const d = r.avg - home.avg;
          html += `<div class="tt-sub">${num(Math.abs(d), 2)} ct ${d < 0 ? 'günstiger' : 'teurer'} als Österreich</div>`;
        }
        return html;
      },
    }),
    xAxis: { type: 'value', show: false },
    yAxis: {
      type: 'category', inverse: true,
      data: rows.map((r) => r.name),
      axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { color: T.ink2, fontFamily: T.font, fontSize: 13, fontWeight: 500 },
    },
    series: [{
      type: 'bar',
      barWidth: 14,
      data: rows.map((r) => ({
        value: r.avg,
        itemStyle: { color: r.home ? T.s[0] : T.compare, borderRadius: r.avg < 0 ? [4, 0, 0, 4] : [0, 4, 4, 0] },
        label: { fontWeight: r.home ? 700 : 500 },
      })),
      label: { show: true, position: 'right', distance: 6, color: T.ink, fontFamily: T.font, fontSize: 12, formatter: (p) => `${num(p.value, 2)} ct` },
      emphasis: { itemStyle: { opacity: 0.85 } },
    }],
  };
}

/**
 * Kosten je Monat, gestapelt nach Energie, Netz, Steuern und Abgaben (brutto).
 * cfg: {axis:[Date], parts:[{name, color, data:[€|null]}], kwh:[kWh|null]}
 */
export function costMonthsOption(T, cfg) {
  const { axis, parts, kwh } = cfg;
  const last = parts.length - 1;
  const totals = axis.map((_, i) => parts.reduce((a, p) => (p.data[i] == null ? a : a + p.data[i]), 0));
  return {
    animationDuration: 450,
    animationEasing: 'cubicOut',
    textStyle: { fontFamily: T.font },
    grid: { left: 6, right: 10, top: 26, bottom: 6, containLabel: true },
    tooltip: baseTooltip(T, {
      axisPointer: { type: 'shadow', shadowStyle: { color: T.line, opacity: 0.5 } },
      formatter: (params) => {
        const i = params[0].dataIndex;
        if (kwh[i] == null) return `<div class="tt-title">${esc(`${MONTHS_LONG[axis[i].getMonth()]} ${axis[i].getFullYear()}`)}</div><div class="tt-sub">noch keine Werte</div>`;
        let html = `<div class="tt-title">${esc(`${MONTHS_LONG[axis[i].getMonth()]} ${axis[i].getFullYear()}`)}</div>`;
        for (let k = parts.length - 1; k >= 0; k--) html += row(parts[k].color, `${num(parts[k].data[i], 2)} €`, parts[k].name);
        html += `<div class="tt-sub"><b>${num(totals[i], 2)} €</b> für ${num(kwh[i], 0)} kWh${kwh[i] > 0 ? `, ${num((totals[i] / kwh[i]) * 100, 1)} ct/kWh` : ''}</div>`;
        return html;
      },
    }),
    xAxis: {
      type: 'category',
      data: axis.map((d) => d.getTime()),
      axisLine: { lineStyle: { color: T.axis } },
      axisTick: { show: false },
      axisLabel: { color: T.muted, fontFamily: T.font, fontSize: 11, hideOverlap: true, ...axisLabelFor('month', axis, 400) },
    },
    yAxis: yAxis(T, '€'),
    series: parts.map((p, k) => ({
      name: p.name,
      type: 'bar',
      stack: 'kosten',
      barMaxWidth: 26,
      barCategoryGap: '34%',
      data: p.data,
      itemStyle: { color: p.color, borderColor: T.surface, borderWidth: 1, borderRadius: k === last ? [4, 4, 0, 0] : 0 },
      emphasis: { focus: 'series' },
    })),
  };
}

/**
 * Kreisdiagramm (Ring) für eine Aufteilung. items: [{name, value, color}]
 * Beschriftung außen nur mit Prozent; Namen stehen in der Tabelle darunter.
 */
export function donutOption(T, items, { unit = 'kWh' } = {}) {
  const total = items.reduce((a, x) => a + x.value, 0) || 1;
  return {
    animationDuration: 500,
    animationEasing: 'cubicOut',
    textStyle: { fontFamily: T.font },
    tooltip: {
      ...baseTooltip(T), trigger: 'item',
      formatter: (p) => `<div class="tt-title">${esc(p.name)}</div>` + row(p.color, `${num(p.value)} ${unit}`, `${num((p.value / total) * 100, 0)} %`),
    },
    series: [{
      type: 'pie',
      radius: ['52%', '76%'],
      center: ['50%', '52%'],
      avoidLabelOverlap: true,
      minAngle: 3,
      padAngle: 1.2,
      itemStyle: { borderColor: T.surface, borderWidth: 2, borderRadius: 4 },
      label: {
        show: true, position: 'outside', color: T.ink2, fontFamily: T.font, fontSize: 12, fontWeight: 600,
        formatter: (p) => `${num((p.value / total) * 100, 0)} %`,
      },
      labelLine: { show: true, length: 6, length2: 6, lineStyle: { color: T.axis } },
      emphasis: { scale: true, scaleSize: 4 },
      data: items.map((x) => ({ name: x.name, value: x.value, itemStyle: { color: x.color } })),
    }],
  };
}

/** Lastgang-Teppich: Stunden × Tage */
export function carpetOption(T, cp, filtersHours) {
  const vals = cp.cells.map((c) => c[2]).sort((a, b) => a - b);
  const hi = vals.length ? Math.max(0.2, vals[Math.floor(vals.length * 0.98)] || vals[vals.length - 1]) : 1;
  const days = cp.days;
  return {
    animation: false,
    textStyle: { fontFamily: T.font },
    grid: { left: 4, right: 8, top: 8, bottom: 4, containLabel: true },
    tooltip: {
      ...baseTooltip(T),
      trigger: 'item',
      formatter: (p) => {
        const [h, di, kw] = p.data;
        const d = days[di];
        return `<div class="tt-title">${esc(dateLong(d))}, ${String(h).padStart(2, '0')}–${String(h + 1).padStart(2, '0')} Uhr</div>`
          + row(T.s[0], `${num(kw, 2)} kW`, 'mittlere Leistung')
          + `<div class="tt-sub">${num(kw, 2)} kWh in dieser Stunde</div>`;
      },
    },
    xAxis: {
      type: 'category',
      data: Array.from({ length: 24 }, (_, h) => h),
      axisLine: { show: false },
      axisTick: { show: false },
      splitArea: { show: false },
      axisLabel: { color: T.muted, fontSize: 11, interval: 0, formatter: (h) => (h % 6 === 0 ? `${h} Uhr` : '') },
      position: 'top',
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: days.map((d) => d.getTime()),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: T.muted,
        fontSize: 11,
        interval: (i) => days.length <= 10 || (days[i].getDay() === 1),
        formatter: (_, i) => (days.length <= 10 ? `${WEEKDAYS_SHORT[(days[i].getDay() + 6) % 7]} ${days[i].getDate()}.` : dateShort(days[i])),
      },
    },
    visualMap: { show: false, min: 0, max: hi, inRange: { color: T.seq }, calculable: false },
    series: [{
      type: 'heatmap',
      data: cp.cells,
      itemStyle: { borderColor: T.surface, borderWidth: 1, borderRadius: 2 },
      emphasis: { itemStyle: { borderColor: T.ink, borderWidth: 1.5 } },
      progressive: 0,
    }],
    _max: hi,
  };
}

/** Typischer Tagesverlauf (Werktag vs. Wochenende) */
export function profileOption(T, prof) {
  const axis = Array.from({ length: 96 }, (_, i) => `${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`);
  const s = [];
  if (prof.weekday) s.push({ name: 'Werktage', color: T.s[0], data: prof.weekday });
  if (prof.weekend) s.push({ name: 'Wochenende', color: T.s[1], data: prof.weekend });
  return {
    animationDuration: 400,
    textStyle: { fontFamily: T.font },
    grid: { left: 6, right: 14, top: 30, bottom: 6, containLabel: true },
    tooltip: baseTooltip(T, {
      axisPointer: { type: 'line', lineStyle: { color: T.axis, width: 1 } },
      formatter: (params) => {
        const i = params[0].dataIndex;
        const next = axis[i + 1] || '24:00';
        let html = `<div class="tt-title">${axis[i]}–${next} Uhr, Durchschnitt</div>`;
        s.forEach((x) => { html += row(x.color, x.data[i] == null ? '–' : `${num(x.data[i], 2)} kW`, x.name); });
        return html;
      },
    }),
    xAxis: {
      type: 'category', data: axis, boundaryGap: false,
      axisLine: { lineStyle: { color: T.axis } }, axisTick: { show: false },
      axisLabel: { color: T.muted, fontSize: 11, interval: (i) => i % 24 === 0, formatter: (v) => v },
    },
    yAxis: yAxis(T, 'kW'),
    series: s.map((x) => ({
      name: x.name, type: 'line', data: x.data, showSymbol: false, smooth: 0.25,
      lineStyle: { color: x.color, width: 2 }, itemStyle: { color: x.color },
    })),
  };
}

/** Mittlerer Tagesverbrauch je Wochentag */
export function weekdayOption(T, avgs) {
  const max = Math.max(...avgs.filter((x) => x != null));
  return {
    animationDuration: 400,
    textStyle: { fontFamily: T.font },
    grid: { left: 6, right: 10, top: 30, bottom: 6, containLabel: true },
    tooltip: baseTooltip(T, {
      axisPointer: { type: 'shadow', shadowStyle: { color: T.line, opacity: 0.5 } },
      formatter: (params) => {
        const i = params[0].dataIndex;
        return `<div class="tt-title">${['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'][i]}</div>`
          + row(T.s[0], avgs[i] == null ? '–' : `${num(avgs[i])} kWh`, 'im Schnitt pro Tag');
      },
    }),
    xAxis: { type: 'category', data: WEEKDAYS_SHORT, axisLine: { lineStyle: { color: T.axis } }, axisTick: { show: false }, axisLabel: { color: T.muted, fontSize: 11 } },
    yAxis: yAxis(T, 'kWh'),
    series: [{
      type: 'bar', barMaxWidth: 24,
      itemStyle: { color: T.s[0], borderRadius: [4, 4, 0, 0] },
      label: { show: true, position: 'top', color: T.ink2, fontSize: 11, fontFamily: T.font, formatter: (p) => (p.value === max ? num(p.value) : '') },
      data: avgs,
    }],
  };
}

/** Kalender eines Jahres (Tageswerte), in zwei Halbjahresreihen */
export function calendarOption(T, year, days) {
  const data = days.map((d) => [isoDate(d.t), d.v]);
  const vals = days.map((d) => d.v).sort((a, b) => a - b);
  const hi = vals.length ? vals[Math.floor(vals.length * 0.98)] || vals[vals.length - 1] : 1;
  const cal = (range, top) => ({
    range, top, left: 34, right: 6, cellSize: ['auto', 13], orient: 'horizontal',
    splitLine: { show: false },
    itemStyle: { color: T.surface, borderColor: T.surface, borderWidth: 2 },
    dayLabel: { firstDay: 1, nameMap: ['S', 'M', 'D', 'M', 'D', 'F', 'S'], color: T.muted, fontSize: 9, margin: 6 },
    monthLabel: { nameMap: MONTHS_SHORT, color: T.muted, fontSize: 11, margin: 6 },
    yearLabel: { show: false },
  });
  return {
    animation: false,
    textStyle: { fontFamily: T.font },
    tooltip: {
      ...baseTooltip(T), trigger: 'item',
      formatter: (p) => {
        const d = new Date(p.data[0] + 'T00:00:00');
        return `<div class="tt-title">${esc(dateLong(d))}</div>` + row(T.s[0], `${num(p.data[1])} kWh`, 'Tagesverbrauch');
      },
    },
    visualMap: { show: false, min: 0, max: hi, inRange: { color: T.seq } },
    calendar: [cal([`${year}-01-01`, `${year}-06-30`], 22), cal([`${year}-07-01`, `${year}-12-31`], 150)],
    series: [
      { type: 'heatmap', coordinateSystem: 'calendar', calendarIndex: 0, data: data.filter((x) => x[0] <= `${year}-06-30`) },
      { type: 'heatmap', coordinateSystem: 'calendar', calendarIndex: 1, data: data.filter((x) => x[0] >= `${year}-07-01`) },
    ],
    _max: hi,
  };
}

/** Jahre im Vergleich (Monatssummen je Jahr) – letzte drei Jahre farbig, ältere grau */
export function yearsOption(T, yearsData) {
  const recent = yearsData.slice(-3).reverse(); // neuestes zuerst
  const colorOf = (y) => {
    const i = recent.findIndex((r) => r[0] === y);
    return i >= 0 ? T.s[i] : T.older;
  };
  const series = yearsData.map(([y, months]) => ({
    name: String(y), type: 'line', data: months, showSymbol: false, smooth: 0.2,
    lineStyle: { color: colorOf(y), width: colorOf(y) === T.older ? 1 : 2 },
    itemStyle: { color: colorOf(y) },
    z: colorOf(y) === T.older ? 1 : 3,
  }));
  return {
    animationDuration: 400,
    textStyle: { fontFamily: T.font },
    grid: { left: 6, right: 12, top: 30, bottom: 6, containLabel: true },
    tooltip: baseTooltip(T, {
      axisPointer: { type: 'line', lineStyle: { color: T.axis, width: 1 } },
      formatter: (params) => {
        const i = params[0].dataIndex;
        let html = `<div class="tt-title">${MONTHS_LONG[i]}</div>`;
        [...yearsData].reverse().forEach(([y, m]) => { if (m[i] != null) html += row(colorOf(y), `${num(m[i])} kWh`, String(y)); });
        return html;
      },
    }),
    xAxis: { type: 'category', data: MONTHS_SHORT, boundaryGap: false, axisLine: { lineStyle: { color: T.axis } }, axisTick: { show: false }, axisLabel: { color: T.muted, fontSize: 11, interval: 2 } },
    yAxis: yAxis(T, 'kWh'),
    series,
  };
}

/** Abgerechnete Jahresverbräuche: ein Balken je Abrechnungsjahr, nur der neueste beschriftet */
export function billedYearsOption(T, labels, values) {
  const last = values.length - 1;
  return {
    animationDuration: 400,
    textStyle: { fontFamily: T.font },
    grid: { left: 6, right: 10, top: 30, bottom: 6, containLabel: true },
    tooltip: baseTooltip(T, {
      axisPointer: { type: 'shadow', shadowStyle: { color: T.line, opacity: 0.5 } },
      formatter: (params) => {
        const i = params[0].dataIndex;
        const prev = i > 0 ? values[i - 1] : null;
        const ch = prev ? (values[i] - prev) / prev : null;
        return `<div class="tt-title">${esc(labels[i])}</div>` + row(T.s[0], `${num(values[i])} kWh`, 'abgerechnet')
          + (ch != null ? `<div class="tt-sub">${ch >= 0 ? '+' : '−'}${num(Math.abs(ch) * 100, 1)} % zum Jahr davor</div>` : '');
      },
    }),
    xAxis: {
      type: 'category', data: labels.map((l) => (l.match(/\d{4}/g) || [l]).slice(-1)[0]),
      axisLine: { lineStyle: { color: T.axis } }, axisTick: { show: false }, axisLabel: { color: T.muted, fontSize: 11 },
    },
    yAxis: yAxis(T, 'kWh'),
    series: [{
      type: 'bar', barMaxWidth: 28,
      data: values.map((v, i) => ({ value: v, itemStyle: { color: T.s[0], opacity: i === last ? 1 : 0.55, borderRadius: [4, 4, 0, 0] } })),
      label: { show: true, position: 'top', color: T.ink2, fontSize: 11, fontFamily: T.font, formatter: (p) => (p.dataIndex === last ? num(p.value) : '') },
    }],
  };
}
