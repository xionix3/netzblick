fn main() {
    // Öffentlicher Schlüssel für Updates im Programm (src-tauri/updater.pub, erzeugt mit `tauri signer generate`).
    // Fehlt die Datei, baut das Programm ohne Updater und verlinkt stattdessen die Download-Seite.
    println!("cargo:rerun-if-changed=updater.pub");
    if let Ok(key) = std::fs::read_to_string("updater.pub") {
        let key = key.trim();
        if !key.is_empty() {
            println!("cargo:rustc-env=NETZBLICK_UPDATER_PUBKEY={key}");
        }
    }
    tauri_build::build()
}
