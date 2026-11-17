// Inline-Icons (24px Raster, 2px Strich)
const svg = (d, extra = '') => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;

export const icons = {
  prev: svg('<path d="M15 18l-6-6 6-6"/>'),
  next: svg('<path d="M9 18l6-6-6-6"/>'),
  down: svg('<path d="M6 9l6 6 6-6"/>', 'width="18" height="18"'),
  refresh: svg('<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>'),
  settings: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  filter: svg('<path d="M4 5h16M7 12h10M10 19h4"/>', 'width="18" height="18"'),
  compare: svg('<path d="M4 17l5-5 4 3 7-8"/><path d="M4 20h16" stroke-dasharray="2 3"/>', 'width="18" height="18"'),
  close: svg('<path d="M18 6L6 18M6 6l12 12"/>', 'width="16" height="16"'),
  check: svg('<path d="M5 12l5 5 9-10"/>', 'width="18" height="18" stroke-width="2.6"'),
  warn: svg('<path d="M12 3l9.5 17H2.5z"/><path d="M12 10v4M12 17.5v.01"/>', 'width="16" height="16"'),
  up: svg('<path d="M12 19V5M5 12l7-7 7 7"/>', 'width="16" height="16"'),
  downArrow: svg('<path d="M12 5v14M5 12l7 7 7-7"/>', 'width="16" height="16"'),
  share: svg('<path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/>', 'width="18" height="18"'),
  calendar: svg('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>', 'width="18" height="18"'),
  meter: svg('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h3"/>', 'width="18" height="18"'),
};
