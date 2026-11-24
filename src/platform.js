// Plattform-Schicht: nativer HTTP-Zugriff (kein CORS), sicherer Speicher, Teilen, Zurück-Taste
// Android: Capacitor. Windows, macOS, Linux: Tauri (src-tauri/src/main.rs). Sonst: Browser (nur Demo).
import { Capacitor, CapacitorHttp, SystemBars, SystemBarsStyle, registerPlugin } from '@capacitor/core';
import { invoke } from '@tauri-apps/api/core';
import { App } from '@capacitor/app';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { LocalNotifications } from '@capacitor/local-notifications';

/** Android-App */
export const isNative = Capacitor.isNativePlatform();
/** Desktop-Programm (Windows, macOS, Linux) */
export const isDesktop = typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__;
/** App oder Desktop-Programm: echte Anmeldung möglich */
export const isApp = isNative || isDesktop;

/** Tauri-Befehl aufrufen; Fehler kommen als Text und werden zu Error */
async function call(cmd, args) {
  try { return await invoke(cmd, args); } catch (e) { throw e instanceof Error ? e : new Error(String(e)); }
}

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
    const hs = {};
    for (const [k, v] of Object.entries(r.headers || {})) hs[k.toLowerCase()] = v;
    return { status: r.status, data: d, headers: hs };
  }
  if (isDesktop) {
    const body = data === undefined ? undefined : typeof data === 'string' ? data : JSON.stringify(data);
    const r = await call('http_request', { req: { method, url, headers, body } });
    let d = r.body;
    try { d = JSON.parse(d); } catch { /* Text belassen */ }
    return { status: r.status, data: d, headers: r.headers || {} };
  }
  const r = await fetch(url, { method, headers, body: data !== undefined ? JSON.stringify(data) : undefined });
  const t = await r.text();
  let d = t;
  try { d = JSON.parse(t); } catch { /* Text */ }
  const hs = {};
  r.headers.forEach((v, k) => { hs[k.toLowerCase()] = v; });
  return { status: r.status, data: d, headers: hs };
}

/* ------------------------------------------------------------ Sicherer Speicher */
// Android: eigenes natives Plugin (SecureStorePlugin.java), AES-GCM mit Schlüssel im Android Keystore.
// Desktop: Schlüsselbund des Systems (Windows-Anmeldeinformationen, macOS-Schlüsselbund, Linux Secret Service).
const SecureStore = registerPlugin('SecureStore');

export const secure = {
  async get(key) {
    if (isDesktop) return call('secret_get', { key });
    if (!isNative) return sessionStorage.getItem('nb.secure.' + key);
    const r = await SecureStore.get({ key });
    return r && r.value != null ? r.value : null;
  },
  async set(key, value) {
    if (isDesktop) return call('secret_set', { key, value });
    if (!isNative) return sessionStorage.setItem('nb.secure.' + key, value);
    await SecureStore.set({ key, value });
  },
  async remove(key) {
    if (isDesktop) return call('secret_remove', { key });
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
  return shareFile(filename, '\ufeff' + csv, 'text/csv;charset=utf-8', 'Werte teilen');
}

/** Textdatei teilen (App), speichern (Desktop) bzw. herunterladen (Browser) */
export async function shareFile(filename, text, mime, dialogTitle = 'Teilen') {
  if (isDesktop) {
    await call('save_text_file', { name: filename, text });
    return;
  }
  if (isNative) {
    const res = await Filesystem.writeFile({ path: filename, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
    await Share.share({ title: filename, url: res.uri, dialogTitle });
    return;
  }
  const blob = new Blob([text], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

/* ------------------------------------------------------------ Erinnerungen (lokale Benachrichtigung) */
export const REMINDER_ID = 4711;

/** Erinnerung planen. Ergebnis: 'ok' | 'denied' | 'unsupported' */
export async function scheduleReminder({ id = REMINDER_ID, at, title, body }) {
  if (!isNative) return 'unsupported';
  let perm = await LocalNotifications.checkPermissions();
  if (perm.display !== 'granted') perm = await LocalNotifications.requestPermissions();
  if (perm.display !== 'granted') return 'denied';
  await LocalNotifications.cancel({ notifications: [{ id }] }).catch(() => {});
  // ungenaue Weckzeit genügt (keine Sonderberechtigung für exakte Alarme nötig)
  await LocalNotifications.schedule({
    notifications: [{ id, title, body, schedule: { at, allowWhileIdle: true }, isExactNotification: false, smallIcon: 'ic_stat_netzblick', iconColor: '#2A78D6' }],
  });
  return 'ok';
}

export async function cancelReminder(id = REMINDER_ID) {
  if (!isNative) return;
  await LocalNotifications.cancel({ notifications: [{ id }] }).catch(() => {});
}

/** Ist die Erinnerung noch eingeplant? (null = unbekannt, z. B. im Browser) */
export async function reminderPending(id = REMINDER_ID) {
  if (!isNative) return null;
  try {
    const { notifications } = await LocalNotifications.getPending();
    return notifications.some((n) => n.id === id);
  } catch { return null; }
}

/** Externe Adresse öffnen (Telefon, E-Mail, Karte, Webseite) */
export function openExternal(url) {
  if (isDesktop) {
    call('open_external', { url }).catch(() => {});
    return;
  }
  const a = document.createElement('a');
  a.href = url;
  // In der App öffnet Capacitor fremde Adressen im Browser bzw. in der passenden App (Telefon, Mail, Karten)
  if (!isNative && /^https?:/.test(url)) { a.target = '_blank'; a.rel = 'noopener'; }
  document.body.appendChild(a);
  a.click();
  a.remove();
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

/* ------------------------------------------------------------ Desktop: Updates im Programm */
// supported: false → das Programm kann sich nicht selbst aktualisieren (kein Schlüssel, .deb-Paket): Download-Link zeigen
export const updater = {
  async check() {
    if (!isDesktop) return { supported: false };
    try {
      return { supported: true, update: await call('update_check') };
    } catch (e) {
      if (/unsupported/.test(e.message)) return { supported: false };
      throw e;
    }
  },
  /** Lädt, prüft die Signatur, installiert und startet neu (kehrt bei Erfolg nicht zurück) */
  install: () => call('update_install'),
};

/* ------------------------------------------------------------ Desktop: Links im Browser öffnen */
// Links mit fremder Adresse nicht im Programmfenster laden (das Programm blockiert es ohnehin), sondern im Standardprogramm öffnen
if (isDesktop) {
  document.addEventListener('click', (e) => {
    const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    const href = a.getAttribute('href') || '';
    if (/^(https?:|mailto:|tel:)/i.test(href)) { e.preventDefault(); openExternal(href); }
  }, true);
}
