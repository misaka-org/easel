// ---------------------------------------------------------------------------
// SVG icon constants
//
// Each export is a complete <svg> HTML string suitable for innerHTML or
// the ContextMenuItem.icon property.  All icons use viewBox="0 0 24 24"
// with standard stroke attributes so they work inside the context menu's
// CSS cascade (which supplies width/height via .easel-context-menu-item-icon svg).
//
// Naming follows the Lucide icon set convention where applicable.
// ---------------------------------------------------------------------------

const A =
  'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

function svg(paths: string): string {
  return `<svg viewBox="0 0 24 24" ${A}>${paths}</svg>`;
}

// ---- Basic shapes --------------------------------------------------------
export const ICON_PLUS = svg(
  `<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>`,
);
export const ICON_MINUS = svg(`<line x1="5" y1="12" x2="19" y2="12"/>`);
export const ICON_X = svg(
  `<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>`,
);

// ---- Navigation / Viewport ------------------------------------------------
export const ICON_CHEVRON_RIGHT = svg(`<polyline points="9 18 15 12 9 6"/>`);

export const ICON_MAXIMIZE = svg(
  `<polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>`,
);

export const ICON_FULLSCREEN = svg(
  `<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>`,
);

export const ICON_SEARCH = svg(
  `<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>`,
);

export const ICON_SEARCH_PLUS = svg(
  `<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>`,
);

export const ICON_SEARCH_MINUS = svg(
  `<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/>`,
);

// ---- Layout / Grid --------------------------------------------------------
export const ICON_TABLE = svg(
  `<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/>`,
);

export const ICON_GRID = svg(
  `<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>`,
);

// ---- Media / Player -------------------------------------------------------
export const ICON_PLAY = svg(`<polygon points="5 3 19 12 5 21 5 3"/>`);
export const ICON_STOP = svg(
  `<rect x="4" y="4" width="16" height="16" rx="2" ry="2"/>`,
);
export const ICON_STEP = svg(
  `<line x1="6" y1="4" x2="6" y2="20"/><polygon points="10 4 20 12 10 20 10 4"/>`,
);
export const ICON_CHECK = svg(`<polyline points="20 6 9 17 4 12"/>`);

// ---- Status / Activity ----------------------------------------------------
export const ICON_CLOCK = svg(
  `<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>`,
);
export const ICON_ACTIVITY = svg(
  `<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>`,
);

// ---- Actions --------------------------------------------------------------
export const ICON_UNDO = svg(
  `<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>`,
);
export const ICON_REDO = svg(
  `<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>`,
);
export const ICON_REFRESH = svg(
  `<polyline points="18,15 21,12 18,9"/><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>`,
);
export const ICON_TRASH = svg(
  `<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>`,
);
