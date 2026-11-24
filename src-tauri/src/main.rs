// Netzblick für Windows, macOS und Linux.
// Die Oberfläche ist dieselbe wie in der Android-App (www/). Dieses Programm stellt ihr bereit:
//   - Anfragen an die Portale direkt vom Programm aus (kein Umweg über einen Server, keine Browser-Sperre)
//   - Ablage der Zugangsdaten im Schlüsselbund des Systems
//   - Speichern von Dateien und Öffnen von Links im Standardprogramm
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::collections::HashMap;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

/// Nur diese Server darf die Oberfläche ansprechen.
const ALLOWED_HOSTS: &[&str] = &[
    "smartmeter.netzburgenland.at", // Smart-Meter-Portal
    "api.portal.netzburgenland.at", // Kundenportal
    "api.energy-charts.info",       // Börsenpreise
    "api.github.com",               // Prüfung auf neue Versionen
];

/// Name im Schlüsselbund
const KEYRING_SERVICE: &str = "at.xionix.netzblick";

fn host_allowed(url: &reqwest::Url) -> bool {
    url.scheme() == "https" && url.host_str().is_some_and(|h| ALLOWED_HOSTS.contains(&h))
}

/* ------------------------------------------------------------------ HTTP */

struct Http(reqwest::Client);

#[derive(Deserialize)]
struct HttpRequest {
    method: String,
    url: String,
    #[serde(default)]
    headers: HashMap<String, String>,
    body: Option<String>,
}

#[derive(Serialize)]
struct HttpResponse {
    status: u16,
    headers: HashMap<String, String>,
    body: String,
}

#[tauri::command]
async fn http_request(http: tauri::State<'_, Http>, req: HttpRequest) -> Result<HttpResponse, String> {
    let url = reqwest::Url::parse(&req.url).map_err(|e| e.to_string())?;
    if !host_allowed(&url) {
        return Err(format!("Adresse nicht erlaubt: {}", url.host_str().unwrap_or("?")));
    }
    let method = reqwest::Method::from_bytes(req.method.to_uppercase().as_bytes()).map_err(|e| e.to_string())?;
    let mut rb = http.0.request(method, url);
    for (k, v) in &req.headers {
        rb = rb.header(k.as_str(), v.as_str());
    }
    if let Some(body) = req.body {
        rb = rb.body(body);
    }
    let res = rb.send().await.map_err(|e| e.to_string())?;
    let status = res.status().as_u16();
    let mut headers = HashMap::new();
    for (k, v) in res.headers() {
        if let Ok(s) = v.to_str() {
            headers.insert(k.as_str().to_ascii_lowercase(), s.to_string());
        }
    }
    let body = res.text().await.map_err(|e| e.to_string())?;
    Ok(HttpResponse { status, headers, body })
}

/* ------------------------------------------------------------------ Schlüsselbund */

fn entry(key: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, key).map_err(|e| e.to_string())
}

#[tauri::command]
fn secret_get(key: String) -> Result<Option<String>, String> {
    match entry(&key)?.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn secret_set(key: String, value: String) -> Result<(), String> {
    entry(&key)?.set_password(&value).map_err(|e| e.to_string())
}

#[tauri::command]
fn secret_remove(key: String) -> Result<(), String> {
    match entry(&key)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

/* ------------------------------------------------------------------ Dateien und Links */

/// Fragt nach dem Speicherort und schreibt die Textdatei. Ergebnis: false, wenn abgebrochen.
#[tauri::command]
async fn save_text_file(app: tauri::AppHandle, name: String, text: String) -> Result<bool, String> {
    let mut dialog = app.dialog().file().set_file_name(&name);
    if let Some(ext) = name.rsplit_once('.').map(|(_, e)| e.to_ascii_lowercase()) {
        dialog = dialog.add_filter(ext.to_uppercase(), &[ext.as_str()]);
    }
    match dialog.blocking_save_file() {
        Some(path) => {
            let path = path.into_path().map_err(|e| e.to_string())?;
            std::fs::write(path, text).map_err(|e| e.to_string())?;
            Ok(true)
        }
        None => Ok(false),
    }
}

fn external_allowed(url: &str) -> bool {
    ["https://", "http://", "mailto:", "tel:"].iter().any(|p| url.starts_with(p))
}

/// Webseiten, E-Mail und Telefon im Standardprogramm öffnen
#[tauri::command]
fn open_external(app: tauri::AppHandle, url: String) -> Result<(), String> {
    if !external_allowed(&url) {
        return Err("Adresse nicht erlaubt".into());
    }
    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
}

/// Gehört die Adresse zur Oberfläche selbst? (tauri://localhost bzw. http://tauri.localhost unter Windows)
fn is_internal(url: &tauri::Url) -> bool {
    matches!(url.scheme(), "tauri" | "about" | "data" | "blob")
        || matches!(url.host_str(), Some("tauri.localhost") | Some("ipc.localhost"))
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let version = app.package_info().version.to_string();
            let client = reqwest::Client::builder()
                .user_agent(format!("Netzblick/{version} ({})", std::env::consts::OS))
                .connect_timeout(Duration::from_secs(20))
                .timeout(Duration::from_secs(60))
                .cookie_store(true)
                // Weiterleitungen nur zu erlaubten Servern
                .redirect(reqwest::redirect::Policy::custom(|attempt| {
                    if attempt.previous().len() < 5 && host_allowed(attempt.url()) {
                        attempt.follow()
                    } else {
                        attempt.stop()
                    }
                }))
                .build()?;
            app.manage(Http(client));

            // Fenstergröße passend zum Bildschirm: auf kleinen Bildschirmen maximiert, sonst groß und mittig.
            // Eine gespeicherte Größe vom letzten Mal (window-state) hat Vorrang.
            let screen = app.handle().primary_monitor().ok().flatten().map(|m| {
                let s = m.scale_factor();
                (m.size().width as f64 / s, m.size().height as f64 / s)
            });
            let (w, h, maximized) = match screen {
                Some((sw, sh)) if sw < 1400.0 || sh < 900.0 => (sw.min(1280.0), (sh - 80.0).max(560.0), true),
                Some((sw, sh)) => ((sw * 0.85).min(1480.0), ((sh - 80.0) * 0.9).min(1000.0), false),
                None => (1180.0, 760.0, false),
            };

            let handle = app.handle().clone();
            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("Netzblick")
                .inner_size(w, h)
                .min_inner_size(380.0, 520.0)
                .maximized(maximized)
                .center()
                .focused(true)
                // Strg + Plus/Minus/0 und Strg + Mausrad vergrößern die ganze Oberfläche
                .zoom_hotkeys_enabled(true)
                // Fremde Adressen nicht im Programmfenster laden, sondern im Browser öffnen
                .on_navigation(move |url| {
                    if is_internal(url) {
                        return true;
                    }
                    if external_allowed(url.as_str()) {
                        let _ = handle.opener().open_url(url.as_str(), None::<&str>);
                    }
                    false
                })
                .build()?
                // Fokus gleich ins Fenster, damit Mausrad und Tastatur sofort scrollen
                .set_focus()?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            http_request,
            secret_get,
            secret_set,
            secret_remove,
            save_text_file,
            open_external
        ])
        .run(tauri::generate_context!())
        .expect("Netzblick konnte nicht gestartet werden");
}
