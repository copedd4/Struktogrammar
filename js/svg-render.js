// @ts-nocheck
// ── SVG rendering ─────────────────────────────────────────────────────────────
// Converts layout records (from layout.js) into live SVG/DOM nodes.
// All DOM creation happens here; layout.js stays DOM-free.

import { SVG_NS, XHTML_NS, H, BLOCK_LIBRARY } from './constants.js';
import { tr } from './i18n.js';
import { findBlock, createContainerRef, resolveContainer, layoutStack } from './layout.js';
import { createBlock, uid, isDescendantOf } from './state.js';

// ── SVG primitive helpers ─────────────────────────────────────────────────────

export function svgRect(x, y, w, h, cls) {
  const r = document.createElementNS(SVG_NS, 'rect');
  r.setAttribute('x', x); r.setAttribute('y', y);
  r.setAttribute('width', w); r.setAttribute('height', h);
  r.setAttribute('class', cls);
  return r;
}

/** Transparent hit rect for block selection — covers only the header band. */
export function svgHit(x, y, w, h, blockId) {
  const r = svgRect(x, y, w, h, 'svg-hit');
  r.dataset.blockId = blockId;
  return r;
}

/**
 * Create a drag-move handle as a foreignObject containing a draggable div.
 * SVG elements themselves are not draggable in the HTML5 DnD API, but a
 * <div draggable> inside a <foreignObject> is. This matches the sidebar pattern.
 *
 * The handle is a thin full-width strip at the top of the block (same area as
 * the hit rect). It is visually transparent — the hit rect below it handles
 * click-selection; this handle only fires drag events.
 */
export function makeDragHandle(x, y, w, h, blockId, store) {
  const fo = document.createElementNS(SVG_NS, 'foreignObject');
  fo.setAttribute('x', x);
  fo.setAttribute('y', y);
  fo.setAttribute('width', w);
  fo.setAttribute('height', h);
  fo.setAttribute('class', 'block-drag-fo');

  const div = document.createElementNS(XHTML_NS, 'div');
  div.setAttribute('xmlns', XHTML_NS);
  div.className = 'block-drag-handle';
  div.draggable = true;

  div.addEventListener('dragstart', (e) => {
    store.dragMoveId    = blockId;
    store.dragBlockType = null;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', blockId);
    // Mark the parent SVG group as being dragged for visual feedback.
    const grp = fo.closest('.svg-block');
    if (grp) {grp.classList.add('block-dragging');}
  });
  div.addEventListener('dragend', () => {
    store.dragMoveId = null;
    const grp = fo.closest('.svg-block');
    if (grp) {grp.classList.remove('block-dragging');}
  });
  // Prevent dragstart from bubbling and triggering click/selection.
  div.addEventListener('mousedown', (e) => { e.stopPropagation(); });

  fo.append(div);
  return fo;
}

export function svgLine(x1, y1, x2, y2, cls) {
  const l = document.createElementNS(SVG_NS, 'line');
  l.setAttribute('x1', x1); l.setAttribute('y1', y1);
  l.setAttribute('x2', x2); l.setAttribute('y2', y2);
  l.setAttribute('class', cls);
  return l;
}

export function svgText(x, y, text, cls) {
  const t = document.createElementNS(SVG_NS, 'text');
  t.setAttribute('x', x); t.setAttribute('y', y);
  t.setAttribute('class', cls);
  t.textContent = text || '';
  return t;
}

export function svgGroup(cls) {
  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('class', cls);
  return g;
}

// ── foreignObject helpers ─────────────────────────────────────────────────────

/**
 * Generic single-field inline input inside an SVG foreignObject.
 *
 * @param {import('./state.js').Block} block
 * @param {string}  field      - Property name on the block to bind.
 * @param {number}  x
 * @param {number}  y
 * @param {number}  w
 * @param {number}  h
 * @param {boolean} multiline  - Use textarea instead of input.
 * @param {import('./store.js').Store} store
 * @returns {SVGForeignObjectElement}
 */
export function foInput(block, field, x, y, w, h, multiline, store) {
  const fo = document.createElementNS(SVG_NS, 'foreignObject');
  fo.setAttribute('x', x); fo.setAttribute('y', y);
  fo.setAttribute('width', w); fo.setAttribute('height', h);

  const inp = document.createElementNS(XHTML_NS, multiline ? 'textarea' : 'input');
  inp.setAttribute('xmlns', XHTML_NS);
  inp.className = 'block-input';
  inp.dataset.fieldBlock = block.id;
  inp.dataset.fieldName  = field;
  inp.value = block[field] || '';
  if (multiline) {inp.style.resize = 'none';}

  inp.addEventListener('input', () => {
    const state = store.getState();
    const found = findBlock(block.id, state);
    if (!found) {return;}
    found.block[field] = inp.value;
    if (found.block.type === 'functionCall' && field === 'functionName') {
      ensureFunctionDefinition(found.block, store);
    }
    store.persist(true);
  });
  inp.addEventListener('change', () => { store.snapshot(); store.persist(true); });
  inp.addEventListener('click',     (e) => { e.stopPropagation(); });
  inp.addEventListener('mousedown', (e) => { e.stopPropagation(); });

  fo.append(inp);
  return fo;
}

/** Terminator: kind select + optional return-value input. */
export function foTerminator(block, x, y, w, h, store) {
  const fo = document.createElementNS(SVG_NS, 'foreignObject');
  fo.setAttribute('x', x); fo.setAttribute('y', y);
  fo.setAttribute('width', w); fo.setAttribute('height', h);

  const wrap = document.createElementNS(XHTML_NS, 'div');
  wrap.setAttribute('xmlns', XHTML_NS);
  wrap.className = 'block-term-wrap';

  const sel = document.createElementNS(XHTML_NS, 'select');
  sel.setAttribute('xmlns', XHTML_NS);
  sel.className = 'block-input block-select';
  sel.dataset.fieldBlock = block.id;
  sel.dataset.fieldName  = 'kind';

  ['break', 'return', 'continue'].forEach((k) => {
    const opt = document.createElementNS(XHTML_NS, 'option');
    opt.setAttribute('xmlns', XHTML_NS);
    opt.value = k; opt.textContent = k;
    if ((block.kind || 'break') === k) {opt.selected = true;}
    sel.append(opt);
  });
  sel.addEventListener('change', () => {
    const found = findBlock(block.id, store.getState());
    if (found) { store.snapshot(); found.block.kind = sel.value; }
  });
  sel.addEventListener('click', (e) => { e.stopPropagation(); });
  wrap.append(sel);

  if ((block.kind || 'break') === 'return') {
    const val = document.createElementNS(XHTML_NS, 'input');
    val.setAttribute('xmlns', XHTML_NS);
    val.className = 'block-input';
    val.dataset.fieldBlock = block.id;
    val.dataset.fieldName  = 'value';
    val.value = block.value || '';
    val.addEventListener('input', () => {
      const found = findBlock(block.id, store.getState());
      if (found) { found.block.value = val.value; store.persist(true); }
    });
    val.addEventListener('change',    () => { store.snapshot(); store.persist(true); });
    val.addEventListener('click',     (e) => { e.stopPropagation(); });
    val.addEventListener('mousedown', (e) => { e.stopPropagation(); });
    wrap.append(val);
  }

  fo.append(wrap);
  return fo;
}

/** Editable case-label input for switchCase columns. */
export function foCaseLabel(parentBlock, caseItem, x, y, w, h, store) {
  const fo = document.createElementNS(SVG_NS, 'foreignObject');
  fo.setAttribute('x', x); fo.setAttribute('y', y);
  fo.setAttribute('width', w); fo.setAttribute('height', h);

  const inp = document.createElementNS(XHTML_NS, 'input');
  inp.setAttribute('xmlns', XHTML_NS);
  inp.className = 'block-input block-case-label';
  inp.dataset.caseName    = caseItem.id;
  inp.dataset.parentBlock = parentBlock.id;
  inp.value = caseItem.name;

  inp.addEventListener('input', () => {
    const pFound = findBlock(parentBlock.id, store.getState());
    if (!pFound) {return;}
    const ci = pFound.block.cases.find((c) => c.id === caseItem.id);
    if (ci) { ci.name = inp.value; store.persist(true); }
  });
  inp.addEventListener('change',    () => { store.snapshot(); store.persist(true); });
  inp.addEventListener('click',     (e) => { e.stopPropagation(); });
  inp.addEventListener('mousedown', (e) => { e.stopPropagation(); });

  fo.append(inp);
  return fo;
}

/**
 * "+" badge that appears on hover over a switch-case column divider.
 *
 * @param {import('./state.js').Block} parentBlock
 * @param {string} insertBeforeCaseId
 * @param {number} x
 * @param {number} y
 * @param {import('./store.js').Store} store
 * @param {Function} afterMutationFn
 * @returns {SVGForeignObjectElement}
 */
export function makeCaseInsertBadge(parentBlock, insertBeforeCaseId, x, y, store, afterMutationFn) {
  const fo = document.createElementNS(SVG_NS, 'foreignObject');
  fo.setAttribute('x', x); fo.setAttribute('y', y);
  fo.setAttribute('width', 22); fo.setAttribute('height', 22);
  fo.setAttribute('class', 'sw-badge-fo');

  const btn = document.createElementNS(XHTML_NS, 'button');
  btn.setAttribute('xmlns', XHTML_NS);
  btn.className = 'sw-insert-btn';
  btn.textContent = '+';
  btn.title = tr(store.getState().settings.language).addCase;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    addCaseBefore(parentBlock.id, insertBeforeCaseId, store, afterMutationFn);
  });
  btn.addEventListener('mousedown', (e) => { e.stopPropagation(); });

  fo.append(btn);
  return fo;
}

// ── Insert target ─────────────────────────────────────────────────────────────

function renderInsertTarget(item, store, afterMutationFn) {
  const g = svgGroup('svg-insert-target');
  const ref = JSON.parse(JSON.stringify(item.ref)); // deep-copy ref for closure

  // ── Accent line centred on the boundary ──────────────────────────────────
  // Rendered at y + height/2 so it sits exactly on the block border.
  // Invisible by default; CSS makes it appear on hover.
  const midY = item.height > 0 ? item.y + item.height / 2 : item.y;
  g.append(svgLine(item.x, midY, item.x + item.width, midY, 'svg-insert-line'));

  // ── Drop zone + badge: a foreignObject <div> ─────────────────────────────
  // HTML elements inside foreignObject receive HTML5 drag events reliably.
  // The div covers the full insert zone and acts as both the hover trigger
  // and the DnD drop target.
  const hitH = Math.max(item.height, 24);
  const dropFo = document.createElementNS(SVG_NS, 'foreignObject');
  dropFo.setAttribute('x', item.x);
  dropFo.setAttribute('y', item.height > 0 ? item.y : item.y - hitH / 2);
  dropFo.setAttribute('width', item.width);
  dropFo.setAttribute('height', hitH);
  dropFo.setAttribute('class', 'insert-drop-fo');

  const dropDiv = document.createElementNS(XHTML_NS, 'div');
  dropDiv.setAttribute('xmlns', XHTML_NS);
  dropDiv.className = 'insert-drop-div';

  // ── "+" badge button ─────────────────────────────────────────────────────
  const btn = document.createElementNS(XHTML_NS, 'button');
  btn.setAttribute('xmlns', XHTML_NS);
  btn.className = 'sw-insert-btn insert-zone-btn';
  btn.textContent = '+';
  btn.title = 'Insert block here';

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (store.dragMoveId) {return;} // ignore click during drag
    showInsertMenu(e, ref, store, afterMutationFn);
  });
  btn.addEventListener('mousedown', (e) => { e.stopPropagation(); });

  dropDiv.append(btn);

  // ── Drag-and-drop on the HTML div ────────────────────────────────────────
  dropDiv.addEventListener('dragover', (e) => {
    if (!store.dragBlockType && !store.dragMoveId) {return;}
    e.preventDefault();
    e.dataTransfer.dropEffect = store.dragMoveId ? 'move' : 'copy';
    dropDiv.classList.add('drag-over-div');
    g.classList.add('drag-over');
  });
  dropDiv.addEventListener('dragleave', () => {
    dropDiv.classList.remove('drag-over-div');
    g.classList.remove('drag-over');
  });
  dropDiv.addEventListener('drop', (e) => {
    e.preventDefault(); e.stopPropagation();
    dropDiv.classList.remove('drag-over-div');
    g.classList.remove('drag-over');
    if (store.dragMoveId) {
      const id = store.dragMoveId;
      store.dragMoveId = null;
      moveBlockToRef(id, ref, store, afterMutationFn);
    } else {
      const type = store.dragBlockType || e.dataTransfer.getData('text/plain');
      if (!type) {return;}
      insertBlockAtRef(type, ref, store, afterMutationFn);
    }
  });

  dropFo.append(dropDiv);
  g.append(dropFo);
  return g;
}

/** Show a small floating menu of block types at the insert point. */
function showInsertMenu(event, ref, store, afterMutationFn) {
  document.querySelectorAll('.insert-type-menu').forEach((n) => n.remove());
  const lang   = store.getState().settings.language;
  const labels = tr(lang).blockTypes;

  const menu = document.createElement('div');
  menu.className = 'insert-type-menu context-menu';
  menu.style.left = `${event.pageX}px`;
  menu.style.top  = `${event.pageY}px`;

  BLOCK_LIBRARY.forEach(({ type }) => {
    const btn = document.createElement('button');
    btn.textContent = labels[type] || type;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.remove();
      insertBlockAtRef(type, ref, store, afterMutationFn);
    });
    menu.append(btn);
  });

  document.body.append(menu);
  setTimeout(() => {
    document.addEventListener('click', () => menu.remove(), { once: true });
  }, 0);
}

// ── Per-block SVG rendering ───────────────────────────────────────────────────

function renderSvgBlock(svg, item, store, afterMutationFn) {
  const lang     = store.getState().settings.language;
  const t        = tr(lang);
  const selected = store.selectedId === item.block.id;
  const g        = svgGroup(selected ? 'svg-block selected' : 'svg-block');
  g.dataset.blockId = item.block.id;

  /** Create a transparent hit rect (selection) + a drag handle on top of it. */
  const hit = (x, y, w, h) => {
    const r = svgHit(x, y, w, h, item.block.id);
    return r;
  };
  /** Append both a hit rect and a drag handle for the given header band. */
  const hitAndDrag = (x, y, w, h) => {
    g.append(hit(x, y, w, h));
    g.append(makeDragHandle(x, y, w, h, item.block.id, store));
  };

  switch (item.kind) {

    case 'statement':
      g.append(svgRect(item.x, item.y, item.width, item.height, 'svg-fill'));
      g.append(svgText(item.x + 6, item.y + 11, t.blockTypes.statement, 'svg-title-sm'));
      g.append(foInput(item.block, 'text', item.x + 6, item.y + 20, item.width - 12, item.height - 24, false, store));
      hitAndDrag(item.x, item.y, item.width, 20);
      break;

    case 'comment':
      g.append(svgRect(item.x, item.y, item.width, item.height, 'svg-fill-comment'));
      g.append(svgText(item.x + 6, item.y + 11, t.blockTypes.comment, 'svg-title-sm'));
      g.append(foInput(item.block, 'text', item.x + 6, item.y + 20, item.width - 12, item.height - 24, false, store));
      hitAndDrag(item.x, item.y, item.width, 20);
      break;

    case 'terminator':
      g.append(svgRect(item.x, item.y, item.width, item.height, 'svg-fill-term'));
      g.append(svgLine(item.x, item.y + 4, item.x + item.width, item.y + 4, 'svg-line'));
      g.append(svgLine(item.x, item.y + item.height - 4, item.x + item.width, item.y + item.height - 4, 'svg-line'));
      g.append(foTerminator(item.block, item.x + 4, item.y + 6, item.width - 8, item.height - 12, store));
      hitAndDrag(item.x, item.y, item.width, 8);
      break;

    case 'functionCall': {
      const { fnExpanded, fnDef, fnBlocks } = item;
      g.append(svgRect(item.x, item.y, item.width, H.fn, 'svg-fill-fn'));
      g.append(svgLine(item.x + 8, item.y, item.x + 8, item.y + H.fn, 'svg-line'));
      g.append(svgLine(item.x + item.width - 8, item.y, item.x + item.width - 8, item.y + H.fn, 'svg-line'));
      g.append(svgText(item.x + 14, item.y + 11, t.blockTypes.functionCall, 'svg-title-sm'));
      g.append(foInput(item.block, 'functionName', item.x + 14, item.y + 22, item.width - 56, H.fn - 28, false, store));
      const tFo = document.createElementNS(SVG_NS, 'foreignObject');
      tFo.setAttribute('x', item.x + item.width - 36);
      tFo.setAttribute('y', item.y + 4);
      tFo.setAttribute('width', 30);
      tFo.setAttribute('height', 22);
      const tBtn = document.createElementNS(XHTML_NS, 'button');
      tBtn.setAttribute('xmlns', XHTML_NS);
      tBtn.className   = 'fn-toggle-btn';
      tBtn.textContent = fnExpanded ? '\u25b2' : '\u25bc';
      tBtn.title       = fnExpanded ? t.close : t.openFunction;
      const bid = item.block.id;
      tBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (store.expandedFnBlocks.has(bid)) {
          store.expandedFnBlocks.delete(bid);
        } else {
          const found = findBlock(bid, store.getState());
          if (found) {ensureFunctionDefinition(found.block, store);}
          store.expandedFnBlocks.add(bid);
        }
        afterMutationFn(false);
      });
      tBtn.addEventListener('mousedown', (e) => { e.stopPropagation(); });
      tFo.append(tBtn);
      g.append(tFo);
      if (fnExpanded && fnDef) {
        const fnDiagId = fnDef.diagramId;
        const fnLayout = layoutStack(
          fnBlocks,
          createContainerRef({ diagramId: fnDiagId, kind: 'diagram' }),
          item.x, item.y + H.fn, item.width, store,
        );
        g.append(svgRect(item.x, item.y + H.fn, item.width, fnLayout.height, 'svg-fn-body'));
        g.append(svgLine(item.x + 8, item.y + H.fn, item.x + 8, item.y + H.fn + fnLayout.height, 'svg-line'));
        g.append(svgLine(item.x + item.width - 8, item.y + H.fn, item.x + item.width - 8, item.y + H.fn + fnLayout.height, 'svg-line'));
        renderLayoutToSvg(g, fnLayout, store, afterMutationFn);
      }
      hitAndDrag(item.x, item.y, item.width, 20);
      break;
    }

    case 'ifElse': {
      const top = H.ifTop;
      const t2  = tr(lang);
      const divX = item.dividerX;
      g.append(svgRect(item.x, item.y, item.width, item.height, 'svg-fill'));
      g.append(svgLine(item.x, item.y + top, item.x + item.width, item.y + top, 'svg-line'));
      g.append(svgLine(divX, item.y + top, divX, item.y + item.height, 'svg-line'));
      g.append(svgLine(item.x, item.y + 26, divX, item.y + top, 'svg-line'));
      g.append(svgLine(item.x + item.width, item.y + 26, divX, item.y + top, 'svg-line'));
      // Title centred in the header, condition input below it
      g.append(svgText(item.x + item.width / 2, item.y + 11, t2.blockTypes.ifElse, 'svg-title-sm svg-title-center'));
      g.append(foInput(item.block, 'condition', item.x + item.width * 0.2, item.y + 20, item.width * 0.6, 22, false, store));
      const leftMid  = item.x + (divX - item.x) / 2;
      const rightMid = divX + (item.x + item.width - divX) / 2;
      g.append(svgText(leftMid,  item.y + top - 7, t2.thenBranch, 'svg-label'));
      g.append(svgText(rightMid, item.y + top - 7, t2.elseBranch, 'svg-label'));
      hitAndDrag(item.x, item.y, item.width, 20);
      renderLayoutToSvg(g, item.left,  store, afterMutationFn);
      renderLayoutToSvg(g, item.right, store, afterMutationFn);
      break;
    }

    case 'whileDo': {
      // Compact header: title row (wH) + condition row (wC), no dividing line.
      const { head: wH, cond: wC } = item;
      const hdrH = wH + wC;
      g.append(svgRect(item.x, item.y, item.width, item.height, 'svg-fill'));
      // Bottom border of combined header
      g.append(svgLine(item.x, item.y + hdrH, item.x + item.width, item.y + hdrH, 'svg-line'));
      // Left indent stripe for body
      g.append(svgLine(item.x + 18, item.y + hdrH, item.x + 18, item.y + item.height, 'svg-line'));
      g.append(svgText(item.x + 6, item.y + 11, tr(lang).blockTypes.whileDo, 'svg-title-sm'));
      // Condition input sits in the lower half of the header (below title row).
      g.append(foInput(item.block, 'condition', item.x + 6, item.y + wH + 2, item.width - 12, wC - 4, false, store));
      // Drag handle covers the title row and the left indent stripe.
      hitAndDrag(item.x, item.y, item.width, wH);
      hitAndDrag(item.x, item.y + wH, 18, item.height - wH);
      renderLayoutToSvg(g, item.body, store, afterMutationFn);
      break;
    }

    case 'doWhile': {
      // Layout fields: body (stack), cond = H.loopCond, foot = H.loopHead
      // Body at top; compact footer (title row + condition row) at bottom.
      const dC = item.cond;  // condition row height (H.loopCond)
      const dF = item.foot;  // title row height    (H.loopHead)
      g.append(svgRect(item.x, item.y, item.width, item.height, 'svg-fill'));
      // Left indent stripe alongside the body (matches layout x+18 offset)
      g.append(svgLine(item.x + 18, item.y, item.x + 18, item.y + item.body.height, 'svg-line'));
      // Line separating body from footer
      g.append(svgLine(item.x, item.y + item.body.height, item.x + item.width, item.y + item.body.height, 'svg-line'));
      // Footer: title in the upper row, condition input in the lower row
      g.append(svgText(item.x + 6, item.y + item.body.height + dF / 2 + 4, tr(lang).blockTypes.doWhile, 'svg-title-sm'));
      g.append(foInput(item.block, 'condition', item.x + 6, item.y + item.body.height + dF + 2, item.width - 12, dC - 4, false, store));
      // Drag handle covers the title row and the left indent stripe.
      hitAndDrag(item.x, item.y + item.body.height, item.width, dF);
      hitAndDrag(item.x, item.y, 18, item.body.height);
      renderLayoutToSvg(g, item.body, store, afterMutationFn);
      break;
    }

    case 'forLoop': {
      const { head: fH, grid: fG } = item;
      const cw3 = item.width / 3;
      g.append(svgRect(item.x, item.y, item.width, item.height, 'svg-fill'));
      g.append(svgLine(item.x, item.y + fH, item.x + item.width, item.y + fH, 'svg-line'));
      g.append(svgLine(item.x, item.y + fH + fG, item.x + item.width, item.y + fH + fG, 'svg-line'));
      g.append(svgLine(item.x + cw3,     item.y + fH, item.x + cw3,     item.y + fH + fG, 'svg-line'));
      g.append(svgLine(item.x + cw3 * 2, item.y + fH, item.x + cw3 * 2, item.y + fH + fG, 'svg-line'));
      g.append(svgLine(item.x + 14, item.y + fH + fG, item.x + 14, item.y + item.height, 'svg-line'));
      g.append(svgText(item.x + 6, item.y + 11, tr(lang).blockTypes.forLoop, 'svg-title-sm'));
      g.append(foInput(item.block, 'init',      item.x + 2,           item.y + fH + 3, cw3 - 4, fG - 6, false, store));
      g.append(foInput(item.block, 'condition', item.x + cw3 + 2,     item.y + fH + 3, cw3 - 4, fG - 6, false, store));
      g.append(foInput(item.block, 'step',      item.x + cw3 * 2 + 2, item.y + fH + 3, cw3 - 4, fG - 6, false, store));
      // Drag handle covers the title row and the left indent stripe.
      hitAndDrag(item.x, item.y, item.width, fH);
      hitAndDrag(item.x, item.y + fH + fG, 14, item.height - (fH + fG));
      renderLayoutToSvg(g, item.body, store, afterMutationFn);
      break;
    }

    case 'switchCase': {
      const sH = item.head;
      g.append(svgRect(item.x, item.y, item.width, item.height, 'svg-fill'));
      g.append(svgLine(item.x, item.y + sH, item.x + item.width, item.y + sH, 'svg-line'));
      g.append(svgLine(item.x + item.width * 0.66, item.y + 26, item.x + item.width, item.y + sH, 'svg-line'));
      g.append(svgText(item.x + 6, item.y + 11, tr(lang).blockTypes.switchCase, 'svg-title-sm'));
      g.append(foInput(item.block, 'expression', item.x + item.width * 0.08, item.y + 22, item.width * 0.55, sH - 26, false, store));

      item.cases.forEach((c, idx) => {
        if (idx > 0) {
          g.append(svgLine(c.x, item.y + sH, c.x, item.y + item.height, 'svg-line'));
          const divHit = svgRect(c.x - 8, item.y + sH, 16, item.height - sH, 'sw-divider-hit');
          divHit.dataset.swInsertBefore = c.caseItem.id;
          divHit.dataset.swBlockId      = item.block.id;
          const badgeX = c.x - 11;
          const badgeY = item.y + sH + (item.height - sH) / 2 - 11;
          const badge  = makeCaseInsertBadge(item.block, c.caseItem.id, badgeX, badgeY, store, afterMutationFn);
          divHit.addEventListener('mouseenter', () => { badge.classList.add('sw-badge-visible'); });
          divHit.addEventListener('mouseleave', () => { badge.classList.remove('sw-badge-visible'); });
          badge.addEventListener('mouseenter',  () => { badge.classList.add('sw-badge-visible'); });
          badge.addEventListener('mouseleave',  () => { badge.classList.remove('sw-badge-visible'); });
          g.append(divHit);
          g.append(badge);
        }

        const isLastNonDefault = !c.caseItem.isDefault
          && idx === item.cases.length - 2
          && item.cases[item.cases.length - 1].isDefault;
        if (isLastNonDefault) {
          const edgeX       = c.x + c.width;
          const edgeHit     = svgRect(edgeX - 8, item.y + sH, 16, item.height - sH, 'sw-divider-hit');
          const defaultCase = item.cases[item.cases.length - 1];
          edgeHit.dataset.swInsertBefore = defaultCase.caseItem.id;
          const edgeBadgeX = edgeX - 11;
          const edgeBadgeY = item.y + sH + (item.height - sH) / 2 - 11;
          const edgeBadge  = makeCaseInsertBadge(item.block, defaultCase.caseItem.id, edgeBadgeX, edgeBadgeY, store, afterMutationFn);
          edgeHit.addEventListener('mouseenter', () => { edgeBadge.classList.add('sw-badge-visible'); });
          edgeHit.addEventListener('mouseleave', () => { edgeBadge.classList.remove('sw-badge-visible'); });
          edgeBadge.addEventListener('mouseenter', () => { edgeBadge.classList.add('sw-badge-visible'); });
          edgeBadge.addEventListener('mouseleave', () => { edgeBadge.classList.remove('sw-badge-visible'); });
          g.append(edgeHit);
          g.append(edgeBadge);
        }

        g.append(svgLine(c.x, item.y + sH + H.swLabel, c.x + c.width, item.y + sH + H.swLabel, 'svg-line'));
        g.append(foCaseLabel(item.block, c.caseItem, c.x + 2, item.y + sH + 2, c.width - 4, H.swLabel - 4, store));
        renderLayoutToSvg(g, c.stack, store, afterMutationFn);
      });

      hitAndDrag(item.x, item.y, item.width, 24);
      break;
    }
  }

  svg.append(g);
}

// ── Main render entry point ───────────────────────────────────────────────────

/**
 * Walk a layout record produced by layoutStack / layoutBlock and append the
 * corresponding SVG elements to `svg`.
 *
 * @param {SVGElement | SVGGElement}     svg            - Parent SVG or group element to append into.
 * @param {{ items: import('./layout.js').LayoutItem[] }} layout - Layout record from layoutStack.
 * @param {import('./store.js').Store}   store          - Application store (for selection state, language, etc.).
 * @param {Function}                     afterMutationFn - Callback to re-render after an inline mutation.
 * @returns {void}
 */
export function renderLayoutToSvg(svg, layout, store, afterMutationFn) {
  layout.items.forEach((item) => {
    if (item.kind === 'insert') {
      svg.append(renderInsertTarget(item, store, afterMutationFn));
    } else {
      renderSvgBlock(svg, item, store, afterMutationFn);
    }
  });
}

// ── Mutation helpers (called from svg-render event handlers) ──────────────────

export function insertBlockAtRef(type, ref, store, afterMutationFn) {
  store.snapshot();
  const state     = store.getState();
  const container = resolveContainer(ref, state);
  const block     = createBlock(type, state);
  if (!container) {
    state.diagrams[state.rootDiagramId].blocks.push(block);
  } else {
    container.blocks.splice(ref.index, 0, block);
  }
  afterMutationFn();
}

/**
 * Move an existing block (and all its children) to a new position.
 * Removes the block from its current container and inserts it at ref.
 */
export function moveBlockToRef(blockId, ref, store, afterMutationFn) {
  const state = store.getState();
  const found = findBlock(blockId, state);
  if (!found) {return;}
  // Prevent dropping a block into itself or its own descendants.
  if (ref.parentBlockId && isDescendantOf(found.block, ref.parentBlockId)) {return;}

  const destContainer = resolveContainer(ref, state);
  if (!destContainer) {return;}
  store.snapshot();
  // Re-find after snapshot (state is now the same reference, snapshot cloned it).
  const src = findBlock(blockId, store.getState());
  if (!src) {return;}
  const block = src.block;
  // Remove from source.
  resolveContainer(src.containerRef, store.getState()).blocks.splice(src.index, 1);
  // Recalculate destination after removal (index may have shifted if same container).
  const destCont = resolveContainer(ref, store.getState());
  if (!destCont) { afterMutationFn(); return; }
  const insertIdx = Math.min(ref.index, destCont.blocks.length);
  destCont.blocks.splice(insertIdx, 0, block);
  store.selectedId = blockId;
  afterMutationFn();
}

export function addCaseBefore(blockId, beforeCaseId, store, afterMutationFn) {
  const found = findBlock(blockId, store.getState());
  if (!found) {return;}
  const block = found.block;
  let idx = block.cases.findIndex((c) => c.id === beforeCaseId);
  if (idx === -1) {idx = block.cases.length - 1;}
  store.snapshot();
  block.cases.splice(idx, 0, { id: uid('case'), name: 'Case', blocks: [], isDefault: false });
  afterMutationFn();
}

// ── Function definition helpers ───────────────────────────────────────────────

export function ensureFunctionDefinition(block, store) {
  const state = store.getState();
  if (!block.functionId || !state.functions[block.functionId]) {
    const fnId = block.functionId || uid('fn');
    const dId  = uid('diagram');
    state.diagrams[dId]   = { id: dId,  name: block.functionName || 'Function', blocks: [] };
    state.functions[fnId] = { id: fnId, diagramId: dId, name: block.functionName || 'Function' };
    block.functionId = fnId;
  }
  if (block.functionName) {
    state.functions[block.functionId].name = block.functionName;
  }
}


