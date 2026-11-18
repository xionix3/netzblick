// Erinnerung an Rabatt- oder Bindungsende: Zeitpunkt und Kalendereintrag

/** Kalendereintrag (.ics) für die Erinnerung */
export function reminderIcs({ at, end, title, text }) {
  const d8 = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const esc = (t) => String(t).replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const next = new Date(at.getFullYear(), at.getMonth(), at.getDate() + 1);
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//geister-it//Netzblick//DE', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:netzblick-${d8(end)}-${Date.now()}@netzblick`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${d8(at)}`,
    `DTEND;VALUE=DATE:${d8(next)}`,
    `SUMMARY:${esc(title)}`,
    `DESCRIPTION:${esc(text)}`,
    'BEGIN:VALARM', 'TRIGGER:PT9H', 'ACTION:DISPLAY', `DESCRIPTION:${esc(title)}`, 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR', '',
  ].join('\r\n');
}

/** Zeitpunkt der Erinnerung: x Tage vor Ende um 9 Uhr; liegt das schon zurück, morgen um 9 Uhr */
export function reminderTime(endIso, days, now = new Date()) {
  const end = new Date(endIso + 'T00:00:00');
  if (isNaN(end)) return null;
  let at = new Date(end.getFullYear(), end.getMonth(), end.getDate() - days, 9, 0);
  if (at <= now) {
    if (end < new Date(now.getFullYear(), now.getMonth(), now.getDate())) return null;
    at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0);
  }
  return { at, end };
}

