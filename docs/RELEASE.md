# Releases

Netzblick verwendet [semantische Versionsnummern](https://semver.org/lang/de/) (`MAJOR.MINOR.PATCH`).
Ein Git-Tag `vX.Y.Z` löst den [Release-Workflow](../.github/workflows/release.yml) aus. Er:

1. leitet aus dem Tag `versionName` (`X.Y.Z`) und `versionCode` (`X·10000 + Y·100 + Z`) ab,
2. führt die Unit-Tests aus,
3. baut die signierte **APK** (zum Installieren) und das **App-Bundle (AAB)** für den Play Store,
4. legt beide samt `SHA256SUMS.txt` als GitHub-Release ab, mit dem passenden Abschnitt aus `CHANGELOG.md` als Beschreibung.

## Neue Version veröffentlichen

1. In `CHANGELOG.md` einen Abschnitt `## [X.Y.Z] – JJJJ-MM-TT` anlegen.
2. In `package.json` die `version` anpassen (für lokale Builds).
3. Committen und pushen, warten, bis die CI grün ist.
4. Tag setzen und pushen:
   ```bash
   git tag v1.1.0
   git push origin v1.1.0
   ```
5. Nach etwa 5 Minuten steht das Release unter **Releases**.

Ein fehlerhaftes Release löschst du unter *Releases → … → Delete* und entfernst den Tag:
`git push --delete origin v1.1.0 && git tag -d v1.1.0`

## Release-Schlüssel einrichten (einmalig)

Ohne eigenen Schlüssel signiert der Workflow mit dem Debug-Schlüssel aus dem Projekt und markiert das Release als **Vorabversion**.
Für echte Releases einen eigenen Schlüssel anlegen.

> **Wichtig:** Den Schlüssel und die Passwörter sicher aufbewahren, z. B. im Passwortmanager plus Backup.
> Geht der Schlüssel verloren, lassen sich keine Updates mehr über installierte Versionen spielen.
> Die Schlüsseldatei **niemals** ins Repository einchecken.

### 1. Schlüssel erzeugen (Windows, PowerShell)

`keytool` ist im JDK von Android Studio enthalten:

```powershell
& "C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe" -genkeypair -v `
  -keystore netzblick-release.jks -alias netzblick `
  -keyalg RSA -keysize 4096 -validity 10000
```

Das Tool fragt nach zwei Passwörtern (Keystore und Schlüssel; beide dürfen gleich sein) und nach Namen und Ort.

### 2. Schlüssel für GitHub kodieren

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("netzblick-release.jks")) | Set-Clipboard
```

### 3. Secrets anlegen

Auf GitHub: **Settings → Secrets and variables → Actions → New repository secret**

| Name | Inhalt |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | Inhalt der Zwischenablage aus Schritt 2 |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore-Passwort |
| `ANDROID_KEY_ALIAS` | `netzblick` |
| `ANDROID_KEY_PASSWORD` | Schlüssel-Passwort |

Ab dem nächsten Tag sind die Releases richtig signiert.

### Lokal signiert bauen (optional)

```powershell
$env:ANDROID_KEYSTORE_FILE = "D:\sicher\netzblick-release.jks"
$env:ANDROID_KEYSTORE_PASSWORD = "…"
$env:ANDROID_KEY_ALIAS = "netzblick"
$env:ANDROID_KEY_PASSWORD = "…"
cd android
.\gradlew.bat assembleRelease bundleRelease -PappVersionName=1.1.0 -PappVersionCode=10100
```

## Signaturen im Überblick

| Build | Signiert mit | Verwendung |
|---|---|---|
| Debug (Android Studio, CI) | `android/app/debug.keystore` aus dem Projekt | Entwicklung und Tests. Gleiche Signatur überall, daher übereinander installierbar. |
| Release ohne Secrets | ebenfalls Debug-Schlüssel | Vorabversion |
| Release mit Secrets | dein Release-Schlüssel | GitHub-Releases, Upload-Schlüssel für Google Play |

Apps mit unterschiedlicher Signatur lassen sich nicht übereinander installieren. Beim Wechsel (Debug → Release, GitHub → Play Store) die App vorher deinstallieren.
Google Play signiert ausgelieferte Apps mit einem eigenen Schlüssel (Play App Signing). Dein Release-Schlüssel dient dort nur als Upload-Schlüssel.
