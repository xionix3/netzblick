fn main() {
    // Updates im Programm: öffentlicher Schlüssel aus tauri.conf.json (plugins.updater.pubkey, erzeugt mit
    // `tauri signer generate`). Ist er leer, baut das Programm ohne Updater und verlinkt die Download-Seite.
    println!("cargo:rerun-if-changed=tauri.conf.json");
    let key = std::fs::read_to_string("tauri.conf.json")
        .ok()
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
        .and_then(|v| v.pointer("/plugins/updater/pubkey").and_then(|k| k.as_str()).map(|k| k.trim().to_string()))
        .unwrap_or_default();
    if !key.is_empty() {
        println!("cargo:rustc-env=NETZBLICK_UPDATER_PUBKEY={key}");
    }
    tauri_build::build()
}
