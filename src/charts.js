// Diagramme (ECharts, nur benötigte Module → kleines Bundle)
import * as echarts from 'echarts/core';
import { BarChart, LineChart, HeatmapChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, VisualMapComponent, CalendarComponent, MarkPointComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { num, time, dateLong, dateShort, WEEKDAYS_SHORT, MONTHS_SHORT, MONTHS_LONG, isoDate } from './format.js';
import { STATUS_LABEL } from './model.js';

echarts.use([BarChart, LineChart, HeatmapChart, GridComponent, TooltipComponent, VisualMapComponent, CalendarComponent, MarkPointComponent, CanvasRenderer]);

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Farb- und Schrift-Tokens aus dem CSS lesen (hell/dunkel) */
export function tokens() {
  const cs = getComputedStyle(document.documentElement);
  const v = (n) => cs.getPropertyValue(n).trim();
  return {
    surface: v('--surface'), ink: v('--ink'), ink2: v('--ink-2'), muted: v('--muted'), line: v('--line'), axis: v('--axis'),
    s: [v('--series-1'), v('--series-2'), v('--series-3')],
    compare: v('--compare'), older: v('--older'),
    seq: v('--seq').split(',').map((x) => x.trim()),
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
    return {
      interval: (i) => {
        const d = axis[i];
        if (!d) return false;
        if (multiDay) return d.getHours() === 0 && d.getMinutes() === 0;
        return d.getMinutes() === 0 && d.getHours() % 6 === 0;
      },
      formatter: (_, i) => {
        const d = axis[i];
        return multiDay ? WEEKDAYS_SHORT[(d.getDay() + 6) % 7] : time(d);
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

/**
 * Hauptdiagramm.
 * cfg: {bucket, axis:[Date], days, series:[{name, color, data:[{v,s}]}], compare:{name, data:[number|null], axis:[Date]}|null}
 */
export function mainOption(T, cfg) {
  const { bucket, axis, series, compare } = cfg;
  const isLine = bucket === 'quarter';
  const factor = isLine ? 4 : 1; // kWh je Viertelstunde → kW
  const unit = isLine ? 'kW' : 'kWh';
  const stacked = series.length > 1;
  // Blass nur bei Tages-/Viertelstundenwerten; ein Ersatzwert soll keinen ganzen Monat einfärben
  const est = (s) => (bucket === 'day' || bucket === 'quarter') && s && s !== 'W';
  const out = [];

  if (compare) {
    out.push({
      name: compare.name,
      type: 'line',
      data: compare.data.map((v) => (v == null ? null : v * factor)),
      step: isLine ? false : 'middle',
      showSymbol: false,
      lineStyle: { color: T.compare, width: 1.5 },
      itemStyle: { color: T.compare },
      z: 1,
      silent: true,
      animation: false,
    });
  }
  series.forEach((s, si) => {
    if (isLine) {
      out.push({
        name: s.name,
        type: 'line',
        stack: stacked ? 'sum' : undefined,
        data: s.data.map((p) => (p.v == null ? null : p.v * factor)),
        showSymbol: false,
        symbolSize: 8,
        lineStyle: { color: s.color, width: 2, join: 'round', cap: 'round' },
        itemStyle: { color: s.color, borderColor: T.surface, borderWidth: 2 },
        areaStyle: { color: s.color, opacity: stacked ? 0.28 : 0.1 },
        emphasis: { disabled: true },
        z: 3,
        connectNulls: false,
      });
    } else {
      out.push({
        name: s.name,
        type: 'bar',
        stack: stacked ? 'sum' : undefined,
        barMaxWidth: 24,
        barCategoryGap: axis.length > 20 ? '28%' : '40%',
        data: s.data.map((p) => ({
          value: p.v,
          itemStyle: {
            color: s.color,
            opacity: est(p.s) ? 0.45 : 1,
            borderRadius: stacked ? (si === series.length - 1 ? [4, 4, 0, 0] : 0) : [4, 4, 0, 0],
            borderColor: stacked ? T.surface : undefined,
            borderWidth: stacked ? 1 : 0,
          },
        })),
        emphasis: { itemStyle: { opacity: 0.85 } },
        z: 3,
      });
    }
  });

  const fmtVal = (v) => (v == null ? '–' : `${num(v, isLine && v < 10 ? 2 : undefined)} ${unit}`);
  return {
    animationDuration: 450,
    animationEasing: 'cubicOut',
    textStyle: { fontFamily: T.font },
    grid: { left: 6, right: 10, top: 30, bottom: 6, containLabel: true },
    tooltip: baseTooltip(T, {
      axisPointer: isLine
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
        if (stacked && any) html += row('transparent', fmtVal(sum * factor), 'zusammen');
        if (isLine && any) html += `<div class="tt-sub">${num(sum, 3)} kWh in 15 Minuten</div>`;
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
      boundaryGap: !isLine,
      axisLine: { lineStyle: { color: T.axis } },
      axisTick: { show: false },
      axisLabel: { color: T.muted, fontFamily: T.font, fontSize: 11, hideOverlap: true, ...axisLabelFor(bucket, axis, cfg.days) },
    },
    yAxis: yAxis(T, unit),
    series: out,
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
