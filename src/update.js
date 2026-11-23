// Hinweis auf neue Versionen im Desktop-Programm (die Android-App aktualisiert der Play Store)
export const RELEASES_API = 'https://api.github.com/repos/xionix3/netzblick/releases/latest';
export const RELEASES_PAGE = 'https://github.com/xionix3/netzblick/releases/latest';

const parts = (v) => String(v || '').replace(/^v/, '').split('.').map((n) => parseInt(n, 10));

/** Ist `latest` neuer als `current`? Beide in der Form X.Y.Z (mit oder ohne „v“). */
export function isNewer(latest, current) {
  const a = parts(latest);
  const b = parts(current);
  if (a.length !== 3 || b.length !== 3 || [...a, ...b].some(Number.isNaN)) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

/** Neueste veröffentlichte Version von GitHub, oder null (offline, Limit erreicht, Vorabversion) */
export async function latestRelease(http) {
  const r = await http({ method: 'GET', url: RELEASES_API, headers: { Accept: 'application/vnd.github+json' } });
  if (r.status !== 200 || !r.data || typeof r.data !== 'object' || r.data.draft || r.data.prerelease) return null;
  const version = String(r.data.tag_name || '').replace(/^v/, '');
  if (!/^\d+\.\d+\.\d+$/.test(version)) return null;
  return { version, url: r.data.html_url || RELEASES_PAGE };
}

/** Höchstens einmal am Tag nachsehen */
export function dueForCheck(lastCheck, now = Date.now()) {
  const t = Number(lastCheck);
  return !Number.isFinite(t) || now - t > 20 * 3600 * 1000;
}
