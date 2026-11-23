// Gibt den Abschnitt einer Version aus CHANGELOG.md aus (für die GitHub-Release-Notizen).
//   node scripts/release-notes.mjs 1.0.0 [release|debug]
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const [version, signing = 'release'] = process.argv.slice(2);
if (!version) {
  console.error('Aufruf: node scripts/release-notes.mjs <version> [release|debug]');
  process.exit(1);
}
const changelog = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../CHANGELOG.md'), 'utf8');
const lines = changelog.split(/\r?\n/);
const start = lines.findIndex((l) => l.startsWith(`## [${version}]`));
let body = '';
if (start >= 0) {
  const end = lines.findIndex((l, i) => i > start && l.startsWith('## ['));
  body = lines.slice(start + 1, end < 0 ? undefined : end)
    .filter((l) => !/^\[[^\]]+\]:\s*https?:/.test(l)) // Link-Definitionen am Dateiende weglassen
    .join('\n').trim();
} else {
  body = `Version ${version}. Für diese Version gibt es keinen Eintrag im CHANGELOG.`;
}

const parts = [body, '', '### Android', '',
  `1. \`netzblick-${version}.apk\` unten herunterladen und am Handy öffnen.`,
  '2. Android fragt einmalig, ob Apps aus dieser Quelle installiert werden dürfen.',
  '3. Ein Update installierst du einfach über die vorhandene App.',
  '', '`netzblick-' + version + '.aab` ist das App-Bundle für den Play Store.',
  '', '### Windows, macOS, Linux', '',
  '| System | Datei |', '|---|---|',
  `| Windows 10/11 | \`Netzblick-${version}-Windows-Setup.exe\` |`,
  `| macOS (Apple Silicon und Intel) | \`Netzblick-${version}-macOS.dmg\` |`,
  `| Linux | \`Netzblick-${version}-Linux-x86_64.AppImage\` oder \`netzblick_${version}_amd64.deb\` |`,
  '', 'Die Desktop-Dateien kommen einige Minuten nach dem Release dazu. Sie sind nicht von Microsoft oder Apple beglaubigt, deshalb warnt das System beim ersten Start. '
    + 'So startest du trotzdem: [Anleitung](https://github.com/xionix3/netzblick#desktop-programm).',
  '', '`SHA256SUMS.txt` enthält die Prüfsummen aller Dateien. Herkunft prüfen: `gh attestation verify <Datei> --repo xionix3/netzblick`.'];
if (signing === 'debug') {
  parts.push('', '> **Vorabversion:** mit dem Entwicklungsschlüssel signiert, weil noch kein Release-Schlüssel hinterlegt ist. Spätere, richtig signierte Versionen lassen sich nicht darüber installieren; vorher deinstallieren.');
}
console.log(parts.join('\n'));
