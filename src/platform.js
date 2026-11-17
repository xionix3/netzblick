// Plattform-Schicht: nativer HTTP-Zugriff (kein CORS), sicherer Speicher, Teilen, Zurück-Taste
import { Capacitor, CapacitorHttp, SystemBars, SystemBarsStyle, registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export const isNative = Capacitor.isNativePlatform();

/** HTTP über die native Schicht (umgeht CORS); im Browser über fetch */
export async function http({ method = 'GET', url, headers = {}, data }) {
  if (isNative) {
    const r = await CapacitorHttp.request({
      method,
      url,
      headers,
      data,
      responseType: 'text',
      connectTimeout: 20000,
      readTimeout: 60000,
    });
    let d = r.data;
    if (typeof d === 'string') {
      try { d = JSON.parse(d); } catch { /* Text belassen */ }
    }
    return { status: r.status, data: d };
  }
  const r = await fetch(url, { method, headers, body: data !== undefined ? JSON.stringify(data) : undefined });
  const t = await r.text();
  let d = t;
  try { d = JSON.parse(t); } catch { /* Text */ }
  return { status: r.status, data: d };
}

/* ------------------------------------------------------------ Sicherer Speicher */
// Eigenes natives Plugin (SecureStorePlugin.java): AES-GCM mit Schlüssel im Android Keystore
const SecureStore = registerPlugin('SecureStore');

export const secure = {
  async get(key) {
    if (!isNative) return sessionStorage.getItem('nb.secure.' + key);
    const r = await SecureStore.get({ key });
    return r && r.value != null ? r.value : null;
  },
  async set(key, value) {
    if (!isNative) return sessionStorage.setItem('nb.secure.' + key, value);
    await SecureStore.set({ key, value });
  },
  async remove(key) {
    if (!isNative) return sessionStorage.removeItem('nb.secure.' + key);
    await SecureStore.remove({ key });
  },
};

/* ------------------------------------------------------------ Einstellungen */
const SETTINGS_KEY = 'nb.settings';
export const DEFAULT_SETTINGS = {
  pricePerKwh: null, // € je kWh (brutto, Energie + Netz)
  feePerMonth: null, // € je Monat (Grundpauschalen)
  meterNames: {},
  theme: 'system',
  compareMode: 'prev',
  chartTypes: null, // Diagrammart je Auflösung: {quarter|day|month|year: 'bar'|'line'|'area'|'pie'}
  splitBy: 'meter', // Kreisdiagramm: 'meter' | 'daypart' | 'weekpart'
  kundenportal: 'auto', // 'auto' (Anmeldung des Smart-Meter-Portals) | 'own' (eigene Zugangsdaten) | 'off'
  intro: true, // Marken-Animation beim Start
};
export function loadSettings() {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY)) }; } catch { return { ...DEFAULT_SETTINGS }; }
}
export function saveSettings(s) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* */ }
}

/* ------------------------------------------------------------ Teilen / Export */
export async function shareCsv(filename, csv) {
  if (isNative) {
    const res = await Filesystem.writeFile({ path: filename, data: '﻿' + csv, directory: Directory.Cache, encoding: Encoding.UTF8 });
    await Share.share({ title: filename, url: res.uri, dialogTitle: 'Werte teilen' });
    return;
  }
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

/* ------------------------------------------------------------ System */
export function onBack(handler) {
  if (!isNative) return;
  App.addListener('backButton', () => {
    if (!handler()) App.minimizeApp();
  });
}

export function onResume(handler) {
  if (!isNative) return;
  App.addListener('resume', handler);
}

export function setSystemBars(dark) {
  if (!isNative) return;
  SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => {});
}
