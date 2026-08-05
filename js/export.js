// @ts-nocheck
// ── Export / File I/O ─────────────────────────────────────────────────────────

import { normalizeState } from './state.js';
import { layoutStack, createContainerRef } from './layout.js';
import { SVG_NS } from './constants.js';

/**
 * Trigger a browser download of `blob` with the given filename.
 *
 * @param {Blob}   blob
 * @param {string} filename
 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => { URL.revokeObjectURL(url); }, 1000);
}

// ── Open ──────────────────────────────────────────────────────────────────────

/**
 * Open a .stkg project file.  Uses the File System Access API when available,
 * falls back to a hidden <input type="file">.
 *
 * @param {import('./store.js').Store} store
 * @param {object}  el              - DOM element cache (needs el.fileInput).
 * @param {Function} afterMutationFn
 * @param {Function} showErrorFn    - (msg: string) => void
 */
export async function openProject(store, el, afterMutationFn, showErrorFn) {
  if ('showOpenFilePicker' in window) {
    let handles;
    try {
      handles = await window.showOpenFilePicker({
        types: [{ description: 'Struktogramm Project', accept: { 'application/json': ['.stkg'] } }],
        multiple: false,
      });
    } catch (_) {
      return; // User cancelled.
    }
    let text;
    try {
      const file = await handles[0].getFile();
      text = await file.text();
    } catch (err) {
      showErrorFn && showErrorFn(`Could not read file: ${err.message}`);
      return;
    }
    let parsed;
    try {
      parsed = normalizeState(JSON.parse(text));
    } catch (_) {
      showErrorFn && showErrorFn('The selected file is not a valid .stkg project (JSON parse error).');
      return;
    }
    store.snapshot();
    store.dispatch(() => parsed);
    store.fileHandle = handles[0];
    store.expandedFnBlocks = new Set();
    store.selectedId = null;
    afterMutationFn();
    return;
  }
  el.fileInput.click();
}

/**
 * Handle the fallback <input type="file"> change event.
 *
 * @param {Event} event
 * @param {import('./store.js').Store} store
 * @param {Function} afterMutationFn
 * @param {Function} showErrorFn
 */
export async function openFromFileInput(event, store, afterMutationFn, showErrorFn) {
  const file = event.target.files && event.target.files[0];
  if (!file) {return;}
  let text;
  try {
    text = await file.text();
  } catch (err) {
    showErrorFn && showErrorFn(`Could not read file: ${err.message}`);
    return;
  }
  let parsed;
  try {
    parsed = normalizeState(JSON.parse(text));
  } catch (_) {
    showErrorFn && showErrorFn('The selected file is not a valid .stkg project (JSON parse error).');
    return;
  }
  store.snapshot();
  store.dispatch(() => parsed);
  store.expandedFnBlocks = new Set();
  store.selectedId = null;
  afterMutationFn();
}

// ── Save ──────────────────────────────────────────────────────────────────────

/**
 * Save the current project to a .stkg file.
 * Uses the File System Access API when available and not forceSaveAs on a
 * previously-opened handle; otherwise falls back to a plain download.
 *
 * @param {boolean} forceSaveAs
 * @param {import('./store.js').Store} store
 * @param {object}  el
 * @param {Function} persistFn
 */
export async function saveProject(forceSaveAs, store, el, persistFn) {
  const payload = JSON.stringify(store.getState(), null, 2);
  const blob    = new Blob([payload], { type: 'application/json' });

  // ── File System Access API path ────────────────────────────────────────────
  if ('showSaveFilePicker' in window) {
    // Re-use an existing handle only when not forcing Save-As.
    if (store.fileHandle && !forceSaveAs) {
      try {
        const w = await store.fileHandle.createWritable();
        await w.write(payload);
        await w.close();
        persistFn();
        return;
      } catch (_) {
        // Handle became invalid (file moved/deleted) — fall through to picker.
        store.fileHandle = null;
      }
    }
    // Show the save picker.
    try {
      store.fileHandle = await window.showSaveFilePicker({
        suggestedName: 'diagram.stkg',
        types: [{ description: 'Struktogramm Project', accept: { 'application/json': ['.stkg'] } }],
      });
      const w = await store.fileHandle.createWritable();
      await w.write(payload);
      await w.close();
      persistFn();
      return;
    } catch (_) {
      // User cancelled the picker — fall through to download fallback.
    }
  }

  // ── Fallback: plain download ───────────────────────────────────────────────
  downloadBlob(blob, 'diagram.stkg');
  persistFn();
}

// ── SVG serialization ─────────────────────────────────────────────────────────

/**
 * Build a standalone SVG string by walking the layout tree directly and
 * emitting static SVG primitives — no DOM rendering, no foreignObject,
 * no CSS class dependencies.
 *
 * @param {import('./store.js').Store} store
 * @param {number} [canvasWidth=1040]
 * @returns {string}
 */
export function buildExportSvgString(store, canvasWidth = 1040) {
  const state  = store.getState();
  const diagId = state.rootDiagramId;
  const blocks = state.diagrams[diagId].blocks;
  const cRef   = createContainerRef({ diagramId: diagId, kind: 'diagram' });
  const layout = layoutStack(blocks, cRef, 0, 0, canvasWidth, store);

  const W = layout.width;
  const H = layout.height;

  // Colours (light-theme hardcoded — suitable for printing/sharing).
  const C = {
    bg:      '#ffffff',
    stroke:  '#111111',
    title:   '#0f7c90',
    cond:    '#1f9bb3',
    termBg:  '#fff8e1',
    fnBg:    '#e8f5e9',
    cmtBg:   '#f3f0ff',
    font:    'Arial, Helvetica, sans-serif',
  };

  const lines = [];
  lines.push(`<svg xmlns="${SVG_NS}" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`);

  // Background
  lines.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="${C.bg}" stroke="${C.stroke}" stroke-width="2"/>`);

  // Walk layout items recursively
  _renderLayoutItems(layout.items, lines, C);

  lines.push('</svg>');
  return lines.join('\n');
}

/** Escape XML special characters for text content. */
function _esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Render a text label, wrapping long lines. */
function _text(x, y, text, fill, fontSize, anchor, bold) {
  const fw = bold ? 'bold' : 'normal';
  const ta = anchor || 'middle';
  return `<text x="${x}" y="${y}" font-family="Arial,sans-serif" font-size="${fontSize}" font-weight="${fw}" text-anchor="${ta}" dominant-baseline="middle" fill="${fill}">${_esc(text)}</text>`;
}

function _rect(x, y, w, h, fill, stroke, sw, dash) {
  const dashAttr = dash ? ` stroke-dasharray="${dash}"` : '';
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${dashAttr}/>`;
}

function _line(x1, y1, x2, y2, stroke, sw) {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${sw}" fill="none"/>`;
}

/**
 * Import H constants inline to avoid a circular import.
 * These must stay in sync with js/constants.js.
 */
const EXPORT_H = {
  leaf: 52, term: 40, fn: 62, ifTop: 58,
  loopHead: 26, loopCond: 28, swHead: 56, swLabel: 26,
};

function _renderLayoutItems(items, lines, C) {
  items.forEach((item) => {
    if (item.kind === 'insert') {return;} // skip drop zones
    _renderItem(item, lines, C);
  });
}

function _renderItem(item, lines, C) {
  const { block, x, y, width: w, height: h } = item;
  const sw = 2;

  switch (item.kind) {

    case 'statement':
    case 'comment': {
      const fill = item.kind === 'comment' ? C.cmtBg : C.bg;
      const dash = item.kind === 'comment' ? '5 3' : null;
      lines.push(_rect(x, y, w, h, fill, C.stroke, sw, dash));
      const label = item.kind === 'comment' ? 'Comment' : 'Statement';
      lines.push(_text(x + 6, y + 10, label, C.title, 9, 'start', true));
      if (block.text) {
        lines.push(_text(x + w / 2, y + h / 2 + 6, block.text, C.stroke, 12, 'middle', false));
      }
      break;
    }

    case 'terminator': {
      lines.push(_rect(x, y, w, h, C.termBg, C.stroke, sw, null));
      lines.push(_line(x, y + 4, x + w, y + 4, C.stroke, sw));
      lines.push(_line(x, y + h - 4, x + w, y + h - 4, C.stroke, sw));
      const kind = block.kind || 'break';
      const val  = kind === 'return' && block.value ? ` ${block.value}` : '';
      lines.push(_text(x + w / 2, y + h / 2, `${kind}${val}`, C.stroke, 12, 'middle', false));
      break;
    }

    case 'functionCall': {
      const fh = EXPORT_H.fn;
      lines.push(_rect(x, y, w, fh, C.fnBg, C.stroke, sw, null));
      lines.push(_line(x + 8, y, x + 8, y + fh, C.stroke, sw));
      lines.push(_line(x + w - 8, y, x + w - 8, y + fh, C.stroke, sw));
      lines.push(_text(x + 14, y + 10, 'Function', C.title, 9, 'start', true));
      if (block.functionName) {
        lines.push(_text(x + w / 2, y + fh / 2 + 6, block.functionName, C.stroke, 12, 'middle', false));
      }
      // If expanded, render the function body below
      if (item.fnExpanded && item.fnDef) {
        const bodyH = h - fh;
        lines.push(_rect(x, y + fh, w, bodyH, C.fnBg, C.stroke, 1.5, '5 3'));
        lines.push(_line(x + 8, y + fh, x + 8, y + h, C.stroke, sw));
        lines.push(_line(x + w - 8, y + fh, x + w - 8, y + h, C.stroke, sw));
        if (item.fnBlocks && item.fnBlocks.length === 0) {
          lines.push(_text(x + w / 2, y + fh + bodyH / 2, '(empty)', C.cond, 11, 'middle', false));
        } else {
          _renderLayoutItems((item.fnLayout || { items: [] }).items, lines, C);
        }
      }
      break;
    }

    case 'ifElse': {
      const top  = EXPORT_H.ifTop;
      const divX = item.dividerX;
      lines.push(_rect(x, y, w, h, C.bg, C.stroke, sw, null));
      lines.push(_line(x, y + top, x + w, y + top, C.stroke, sw));
      lines.push(_line(divX, y + top, divX, y + h, C.stroke, sw));
      // Chevron lines
      lines.push(_line(x, y + 26, divX, y + top, C.stroke, sw));
      lines.push(_line(x + w, y + 26, divX, y + top, C.stroke, sw));
      lines.push(_text(x + w / 2, y + 12, 'If / Else', C.title, 9, 'middle', true));
      if (block.condition) {
        lines.push(_text(x + w / 2, y + 38, block.condition, C.stroke, 12, 'middle', false));
      }
      const leftMid  = x + (divX - x) / 2;
      const rightMid = divX + (x + w - divX) / 2;
      lines.push(_text(leftMid,  y + top - 7, 'true',  C.cond, 11, 'middle', true));
      lines.push(_text(rightMid, y + top - 7, 'false', C.cond, 11, 'middle', true));
      _renderLayoutItems(item.left.items,  lines, C);
      _renderLayoutItems(item.right.items, lines, C);
      break;
    }

    case 'whileDo': {
      const wH = item.head, wC = item.cond;
      const hdrH = wH + wC;
      lines.push(_rect(x, y, w, h, C.bg, C.stroke, sw, null));
      lines.push(_line(x, y + hdrH, x + w, y + hdrH, C.stroke, sw));
      lines.push(_line(x + 18, y + hdrH, x + 18, y + h, C.stroke, sw));
      lines.push(_text(x + 6, y + wH / 2, 'While-Do', C.title, 9, 'start', true));
      if (block.condition) {
        lines.push(_text(x + w / 2, y + wH + wC / 2, block.condition, C.stroke, 12, 'middle', false));
      }
      _renderLayoutItems(item.body.items, lines, C);
      break;
    }

    case 'doWhile': {
      const dC = item.cond, dF = item.foot;
      lines.push(_rect(x, y, w, h, C.bg, C.stroke, sw, null));
      lines.push(_line(x + 18, y, x + 18, y + item.body.height, C.stroke, sw));
      lines.push(_line(x, y + item.body.height, x + w, y + item.body.height, C.stroke, sw));
      lines.push(_text(x + 6, y + item.body.height + dF / 2, 'Do-While', C.title, 9, 'start', true));
      if (block.condition) {
        lines.push(_text(x + w / 2, y + item.body.height + dF + dC / 2, block.condition, C.stroke, 12, 'middle', false));
      }
      _renderLayoutItems(item.body.items, lines, C);
      break;
    }

    case 'forLoop': {
      const fH = item.head, fG = item.grid;
      const cw3 = w / 3;
      lines.push(_rect(x, y, w, h, C.bg, C.stroke, sw, null));
      lines.push(_line(x, y + fH, x + w, y + fH, C.stroke, sw));
      lines.push(_line(x, y + fH + fG, x + w, y + fH + fG, C.stroke, sw));
      lines.push(_line(x + cw3,     y + fH, x + cw3,     y + fH + fG, C.stroke, sw));
      lines.push(_line(x + cw3 * 2, y + fH, x + cw3 * 2, y + fH + fG, C.stroke, sw));
      lines.push(_line(x + 14, y + fH + fG, x + 14, y + h, C.stroke, sw));
      lines.push(_text(x + 6, y + fH / 2, 'For-loop', C.title, 9, 'start', true));
      const midG = y + fH + fG / 2;
      if (block.init)      {lines.push(_text(x + cw3 / 2,       midG, block.init,      C.stroke, 11, 'middle', false));}
      if (block.condition) {lines.push(_text(x + cw3 + cw3 / 2, midG, block.condition, C.stroke, 11, 'middle', false));}
      if (block.step)      {lines.push(_text(x + cw3 * 2 + cw3 / 2, midG, block.step, C.stroke, 11, 'middle', false));}
      _renderLayoutItems(item.body.items, lines, C);
      break;
    }

    case 'switchCase': {
      const sH = item.head;
      lines.push(_rect(x, y, w, h, C.bg, C.stroke, sw, null));
      lines.push(_line(x, y + sH, x + w, y + sH, C.stroke, sw));
      lines.push(_line(x + w * 0.66, y + 26, x + w, y + sH, C.stroke, sw));
      lines.push(_text(x + 6, y + 12, 'Switch-Case', C.title, 9, 'start', true));
      if (block.expression) {
        lines.push(_text(x + w * 0.35, y + sH / 2 + 8, block.expression, C.stroke, 12, 'middle', false));
      }
      item.cases.forEach((c, idx) => {
        if (idx > 0) {
          lines.push(_line(c.x, y + sH, c.x, y + h, C.stroke, sw));
        }
        lines.push(_line(c.x, y + sH + EXPORT_H.swLabel, c.x + c.width, y + sH + EXPORT_H.swLabel, C.stroke, sw));
        lines.push(_text(c.x + c.width / 2, y + sH + EXPORT_H.swLabel / 2, c.caseItem.name, C.stroke, 11, 'middle', false));
        _renderLayoutItems(c.stack.items, lines, C);
      });
      break;
    }

    default:
      // Unknown block type — draw a plain rect with the type name.
      lines.push(_rect(x, y, w, h, C.bg, C.stroke, sw, null));
      lines.push(_text(x + w / 2, y + h / 2, block.type || '?', C.stroke, 12, 'middle', false));
      break;
  }
}

// ── Export entry points ───────────────────────────────────────────────────────

/**
 * Export the current diagram as an SVG file.
 *
 * @param {import('./store.js').Store} store
 * @param {number} [canvasWidth=1040]
 */
export function exportSvg(store, canvasWidth = 1040) {
  const svgStr = buildExportSvgString(store, canvasWidth);
  downloadBlob(new Blob([svgStr], { type: 'image/svg+xml' }), 'diagram.svg');
}

/**
 * Export the current diagram as a PNG file by rasterizing the SVG via a canvas.
 *
 * @param {import('./store.js').Store} store
 * @param {number} [canvasWidth=1040]
 * @param {number} [scale=2]
 */
export function exportPng(store, canvasWidth = 1040, scale = 2) {
  const svgStr = buildExportSvgString(store, canvasWidth);

  const parser  = new DOMParser();
  const svgDoc  = parser.parseFromString(svgStr, 'image/svg+xml');
  const svgNode = svgDoc.documentElement;
  const w = parseFloat(svgNode.getAttribute('width'))  || canvasWidth;
  const h = parseFloat(svgNode.getAttribute('height')) || 600;

  const canvas  = document.createElement('canvas');
  canvas.width  = w * scale;
  canvas.height = h * scale;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);

  const img  = new Image();
  const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
  const url  = URL.createObjectURL(blob);

  img.onload = () => {
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    canvas.toBlob((pngBlob) => {
      if (pngBlob) {downloadBlob(pngBlob, 'diagram.png');}
    }, 'image/png');
  };
  img.onerror = () => { URL.revokeObjectURL(url); };
  img.src = url;
}

/**
 * Export the current diagram as a PDF via the browser's print dialog.
 *
 * @param {import('./store.js').Store} store
 * @param {number} [canvasWidth=1040]
 */
export function exportPdf(store, canvasWidth = 1040) {
  const svgStr = buildExportSvgString(store, canvasWidth);
  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) {return;}
  win.document.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Struktogramm Export</title>
<style>
  @page { margin: 10mm; }
  body  { margin: 0; display: flex; justify-content: center; }
  svg   { max-width: 100%; height: auto; }
  @media print { body { margin: 0; } }
</style>
</head>
<body>${svgStr}</body>
</html>`);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 400);
}

/**
 * Legacy alias kept for backward compatibility.
 * @param {import('./store.js').Store} store
 * @param {number} [canvasWidth]
 */
export function exportProject(store, canvasWidth) {
  exportSvg(store, canvasWidth);
}
