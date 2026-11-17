// Gemeinsame Oberflächen-Bausteine: DOM-Helfer, Icons, Bottom-Sheet, Hinweise, Rollenzählwerk
import { icons } from './icons.js';
import { num } from './format.js';

export const $ = (id) => document.getElementById(id);

/** Element bauen. Texte immer über text/Kinder (kein innerHTML für fremde Inhalte). */
export function h(tag, attrs = {}, ...kids) {
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

export const icon = (name) => h('span', { class: 'ic', html: icons[name] || '' });

export function fillIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) => {
    if (!el.dataset.iconDone) {
      el.insertAdjacentHTML('afterbegin', icons[el.dataset.icon] || '');
      el.dataset.iconDone = '1';
    }
  });
}

export const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ------------------------------------------------------------ Rollenzählwerk */
export function setCounter(el, value, { digits = 6, decimals = 1, animate = true, chars: fixed = null } = {}) {
  let chars;
  if (fixed) chars = fixed;
  else {
    const v = Math.max(0, value || 0);
    const intStr = Math.floor(v).toString().padStart(digits, '0');
    chars = decimals ? [...intStr, String(Math.floor((v * 10) % 10))] : [...intStr];
    el.setAttribute('aria-label', `Zählerstand ${num(v, 1)} Kilowattstunden`);
  }
  if (el.children.length !== chars.length) {
    el.textContent = '';
    chars.forEach((_, i) => {
      const last = decimals && i === chars.length - 1;
      el.append(h('span', { class: 'roll' + (last ? ' roll--dec' : '') },
        h('span', { class: 'strip' }, ...Array.from({ length: 10 }, (__, n) => h('span', { text: String(n) })))));
    });
  }
  chars.forEach((c, i) => {
    const strip = el.children[i].firstChild;
    strip.style.transition = animate && !reduceMotion() ? `transform ${900 + i * 140}ms cubic-bezier(.2,.8,.2,1)` : 'none';
    strip.style.transform = `translateY(-${Number(c) * 10}%)`;
  });
}

/** Zahl sanft hochzählen lassen (Summe oben) */
const counters = new WeakMap();
export function countUp(el, to, format, ms = 650) {
  const from = counters.get(el);
  counters.set(el, to);
  if (to == null || !isFinite(to)) { el.textContent = '–'; return; }
  if (from == null || !isFinite(from) || reduceMotion() || from === to) { el.textContent = format(to); return; }
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / ms);
    const e = 1 - Math.pow(1 - k, 3);
    el.textContent = format(from + (to - from) * e);
    if (k < 1 && counters.get(el) === to) requestAnimationFrame(step);
    else if (counters.get(el) === to) el.textContent = format(to);
  };
  requestAnimationFrame(step);
}

/* ------------------------------------------------------------ Bottom-Sheet */
let sheetOnClose = null;
export function openSheet(title, body, onClose) {
  $('sheetTitle').textContent = title;
  const b = $('sheetBody');
  b.textContent = '';
  b.append(body);
  fillIcons(b);
  $('scrim').hidden = false;
  $('sheet').hidden = false;
  requestAnimationFrame(() => { $('sheet').classList.add('open'); $('scrim').classList.add('open'); });
  sheetOnClose = onClose || null;
}
export function closeSheet() {
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
export function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.classList.remove('show'); setTimeout(() => (t.hidden = true), 250); }, 2600);
}

/** Beschriftete Zeile in einer Detail-Liste */
export const row = (label, value) => (value == null || value === '' ? null : h('div', { class: 'dl-row' }, h('dt', { text: label }), h('dd', {}, value)));

/** Kleine Markenzeichen-Grafik (drei Rollen „1 8 0“) */
export function brandMark(size = 'sm') {
  const el = h('span', { class: `brandmark brandmark--${size}`, 'aria-hidden': 'true' });
  ['1', '8', '0'].forEach((c, i) => el.append(h('span', { class: 'bm-roll' + (i === 2 ? ' bm-roll--red' : '') },
    h('span', { class: 'strip' }, ...Array.from({ length: 10 }, (__, n) => h('span', { text: String(n) }))))));
  return el;
}
export function spinBrand(el, digits = ['1', '8', '0'], animate = true) {
  [...el.children].forEach((roll, i) => {
    const strip = roll.firstChild;
    strip.style.transition = animate && !reduceMotion() ? `transform ${800 + i * 220}ms cubic-bezier(.2,.8,.2,1) ${i * 60}ms` : 'none';
    strip.style.transform = `translateY(-${Number(digits[i]) * 10}%)`;
  });
}
