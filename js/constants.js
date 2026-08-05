// ── Constants ─────────────────────────────────────────────────────────────────
// Shared immutable values used across all modules.

export const STORAGE_KEY  = 'struktogramm-editor-state-v5';
export const RECOVERY_KEY = 'struktogramm-editor-recovery-v5';

export const SVG_NS   = 'http://www.w3.org/2000/svg';
export const XHTML_NS = 'http://www.w3.org/1999/xhtml';

export const THEMES = [
  { id: 'light',    label: 'Light' },
  { id: 'dark',     label: 'Dark' },
  { id: 'eggshell', label: 'Eggshell White' },
  { id: 'navy',     label: 'Navy Blue Dark' },
  { id: 'siemens',  label: 'Siemens' },
];

export const LANGUAGES = [
  { id: 'en', label: 'English' },
  { id: 'de', label: 'Deutsch' },
];

export const BLOCK_LIBRARY = [
  { type: 'statement',    shortcut: '1' },
  { type: 'ifElse',       shortcut: '2' },
  { type: 'whileDo',      shortcut: '3' },
  { type: 'doWhile',      shortcut: '4' },
  { type: 'forLoop',      shortcut: '5' },
  { type: 'functionCall', shortcut: '6' },
  { type: 'switchCase',   shortcut: '7' },
  { type: 'terminator',   shortcut: '8' },
  { type: 'comment',      shortcut: '9' },
];

/**
 * Fixed pixel heights for each block region.
 * Used by layoutBlock to compute block heights without measuring the DOM.
 *
 * @type {{ leaf: number, term: number, fn: number, ifTop: number,
 *          loopHead: number, loopCond: number, swHead: number, swLabel: number,
 *          minCaseW: number }}
 */
export const H = {
  leaf:     52,   // statement / comment  (was 72)
  term:     40,   // terminator           (was 56)
  fn:       62,   // function call header (was 90)
  ifTop:    58,   // if/else header band  (was 82)
  loopHead: 26,   // while/for title row  (was 36)
  loopCond: 28,   // while/for cond row   (was 34)
  swHead:   56,   // switch header        (was 80)
  swLabel:  26,   // case label row       (was 34)
  /** Minimum pixel width for a single switch-case column. */
  minCaseW: 200,
};
