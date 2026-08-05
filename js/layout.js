// ── Layout engine ─────────────────────────────────────────────────────────────
// Pure geometry: no DOM, no SVG creation.  Returns plain data objects consumed
// by svg-render.js.

import { H } from './constants.js';

// ── Container references ──────────────────────────────────────────────────────

/**
 * Build a container reference descriptor used to locate the block list that
 * owns a particular position in the tree.
 *
 * @param {{ diagramId: string,
 *           parentBlockId?: string|null,
 *           kind: string,
 *           branch?: string|null,
 *           caseId?: string|null }} opts
 * @returns {ContainerRef}
 */
export function createContainerRef(opts) {
  return {
    diagramId:     opts.diagramId,
    parentBlockId: opts.parentBlockId  || null,
    kind:          opts.kind,
    branch:        opts.branch         || null,
    caseId:        opts.caseId         || null,
  };
}

/**
 * Resolve a ContainerRef to the actual `{ blocks }` array it points to,
 * given the current application state.
 *
 * @param {ContainerRef}                          ref
 * @param {import('./state.js').AppState}         state
 * @returns {{ blocks: import('./state.js').Block[] } | null}
 */
export function resolveContainer(ref, state) {
  if (!ref) {return null;}
  if (ref.kind === 'diagram') {
    const d = state.diagrams[ref.diagramId];
    return d ? { blocks: d.blocks } : null;
  }
  const found = findBlock(ref.parentBlockId, state);
  const parent = found ? found.block : null;
  if (!parent) {return null;}
  if (ref.kind === 'ifElse') {return { blocks: parent[ref.branch] };}
  if (ref.kind === 'whileDo' || ref.kind === 'doWhile' || ref.kind === 'forLoop') {
    return { blocks: parent.body };
  }
  if (ref.kind === 'switchCase') {
    const ci = parent.cases.find((c) => c.id === ref.caseId);
    return ci ? { blocks: ci.blocks } : null;
  }
  return null;
}

// ── Block search ──────────────────────────────────────────────────────────────

/**
 * Find a block by ID anywhere in the diagram tree.
 *
 * @param {string}                        blockId
 * @param {import('./state.js').AppState} state
 * @param {import('./state.js').Block[]}  [blocks]       - Internal: current search scope.
 * @param {import('./state.js').Block|null} [parent]     - Internal: parent block.
 * @param {ContainerRef}                  [containerRef] - Internal: ref for current scope.
 * @returns {{ block: import('./state.js').Block,
 *             parent: import('./state.js').Block|null,
 *             index: number,
 *             containerRef: ContainerRef } | null}
 */
export function findBlock(blockId, state, blocks, parent, containerRef) {
  if (blocks === undefined) {
    const diagrams = Object.values(state.diagrams);
    for (const d of diagrams) {
      const found = findBlock(
        blockId, state, d.blocks, null,
        createContainerRef({ diagramId: d.id, kind: 'diagram' }),
      );
      if (found) {return found;}
    }
    return null;
  }

  for (let idx = 0; idx < blocks.length; idx++) {
    const block = blocks[idx];
    if (block.id === blockId) {
      return { block, parent, index: idx, containerRef };
    }
    if (block.type === 'ifElse') {
      const a = findBlock(blockId, state, block.thenBlocks, block,
        createContainerRef({ diagramId: containerRef.diagramId, parentBlockId: block.id, kind: 'ifElse', branch: 'thenBlocks' }));
      if (a) {return a;}
      const b = findBlock(blockId, state, block.elseBlocks, block,
        createContainerRef({ diagramId: containerRef.diagramId, parentBlockId: block.id, kind: 'ifElse', branch: 'elseBlocks' }));
      if (b) {return b;}
    }
    if (block.type === 'whileDo' || block.type === 'doWhile' || block.type === 'forLoop') {
      const c = findBlock(blockId, state, block.body, block,
        createContainerRef({ diagramId: containerRef.diagramId, parentBlockId: block.id, kind: block.type, branch: 'body' }));
      if (c) {return c;}
    }
    if (block.type === 'switchCase') {
      for (const cit of block.cases) {
        const e = findBlock(blockId, state, cit.blocks, block,
          createContainerRef({ diagramId: containerRef.diagramId, parentBlockId: block.id, kind: 'switchCase', branch: 'caseBlocks', caseId: cit.id }));
        if (e) {return e;}
      }
    }
  }
  return null;
}

// ── Minimum-width helpers ─────────────────────────────────────────────────────

/**
 * Compute the minimum readable width for a single block.
 *
 * For most leaf blocks this is H.minCaseW.  For container blocks it is the
 * minimum width that lets all children fit without clipping.
 *
 * @param {import('./state.js').Block} block
 * @param {string}                    diagramId
 * @param {import('./store.js').Store} store
 * @returns {number}
 */
function blockMinWidth(block, diagramId, store) {
  switch (block.type) {
    case 'ifElse': {
      // Each branch gets at least its own content minimum (floored at minCaseW).
      // The total minimum is simply their sum — no equal-split assumption.
      const lMin = blockListMinWidth(block.thenBlocks, diagramId, store);
      const rMin = blockListMinWidth(block.elseBlocks, diagramId, store);
      return Math.max(lMin, H.minCaseW) + Math.max(rMin, H.minCaseW);
    }
    case 'whileDo':
    case 'doWhile':
    case 'forLoop': {
      // Body receives max(width - 18, …); body itself will be at least minCaseW.
      const bMin = blockListMinWidth(block.body, diagramId, store);
      return Math.max(bMin, H.minCaseW) + 18;
    }
    case 'switchCase': {
      // Each case column is at least H.minCaseW; total = sum of column minimums.
      const total = block.cases.reduce((sum, c) => {
        return sum + Math.max(blockListMinWidth(c.blocks, diagramId, store), H.minCaseW);
      }, 0);
      return Math.max(total, H.minCaseW);
    }
    default:
      return H.minCaseW;
  }
}

/**
 * Compute the minimum readable width for a list of blocks stacked vertically.
 * The minimum width is the maximum of all individual block minimum widths.
 *
 * @param {import('./state.js').Block[]} blocks
 * @param {string}                       diagramId
 * @param {import('./store.js').Store}    store
 * @returns {number}
 */
function blockListMinWidth(blocks, diagramId, store) {
  if (!blocks || blocks.length === 0) {return H.minCaseW;}
  return Math.max(...blocks.map((b) => blockMinWidth(b, diagramId, store)));
}

// ── Layout ────────────────────────────────────────────────────────────────────

/**
 * Lay out a flat list of blocks stacked vertically, inserting drop-zones
 * (insert targets) between every pair of blocks and at the top and bottom.
 *
 * @param {import('./state.js').Block[]} blocks       - Ordered list of blocks to lay out.
 * @param {ContainerRef}                 containerRef - Reference to the container that owns this list.
 * @param {number}                       x            - Left edge in SVG user units.
 * @param {number}                       y            - Top edge in SVG user units.
 * @param {number}                       width        - Available width in SVG user units.
 * @param {import('./store.js').Store}   store        - Application store (needed for functionCall expansion state).
 * @returns {{ x: number, y: number, width: number, height: number,
 *             items: LayoutItem[] }}
 *   A layout record whose `items` array contains alternating insert-target and
 *   block-layout entries ready for renderLayoutToSvg.
 */
export function layoutStack(blocks, containerRef, x, y, width, store) {
  const items = [];
  let cursorY = y;
  let actualW = width; // grows if a child (e.g. switchCase) is wider than the slot

  const isInitial = blocks.length === 0;
  const insertH   = isInitial ? 60 : 0;

  // Placeholder insert-target at index 0 — width patched below once actualW is known.
  items.push({ kind: 'insert', ref: { ...containerRef, index: 0 }, x, y: cursorY, width, height: insertH });
  if (isInitial) {cursorY += insertH;}

  blocks.forEach((block, index) => {
    const item = layoutBlock(block, x, cursorY, width, containerRef.diagramId, store);
    items.push(item);
    if (item.width > actualW) {actualW = item.width;}
    cursorY += item.height;
    // Placeholder insert-target — width patched below.
    items.push({ kind: 'insert', ref: { ...containerRef, index: index + 1 }, x, y: cursorY, width, height: 0 });
  });

  // Patch all insert-target widths to match the actual content width so drop
  // zones span the full switch block when it overflows the slot.
  if (actualW > width) {
    items.forEach((it) => { if (it.kind === 'insert') {it.width = actualW;} });
  }

  return { x, y, width: actualW, height: Math.max(cursorY - y, 60), items };
}

/**
 * Compute the layout record for a single block (recursive for container blocks).
 *
 * The returned object always contains at minimum:
 *   `{ block, x, y, width, height, kind, diagramId }`
 *
 * Container blocks additionally carry child layout records:
 *   - ifElse  → `{ left, right }`
 *   - loops   → `{ body, head, cond }`
 *   - switch  → `{ cases[], head }`
 *   - fn call → `{ fnExpanded, fnDef, fnBlocks }`
 *
 * @param {import('./state.js').Block}  block
 * @param {number}                      x
 * @param {number}                      y
 * @param {number}                      width
 * @param {string}                      diagramId  - ID of the diagram that contains this block.
 * @param {import('./store.js').Store}  store
 * @returns {LayoutItem}
 */
export function layoutBlock(block, x, y, width, diagramId, store) {
  const state = store.getState();

  switch (block.type) {
    case 'statement':
    case 'comment':
      return { block, x, y, width, height: H.leaf, kind: block.type, diagramId };

    case 'terminator':
      return { block, x, y, width, height: H.term, kind: block.type, diagramId };

    case 'functionCall': {
      const fnExpanded = store.expandedFnBlocks.has(block.id);
      const fnDef      = block.functionId ? (state.functions[block.functionId] || null) : null;
      const fnBlocks   = (fnDef && state.diagrams[fnDef.diagramId])
        ? state.diagrams[fnDef.diagramId].blocks : [];
      let fnBodyHeight = 0;
      let fnBodyWidth  = width;
      if (fnExpanded && fnDef) {
        const fnDiagId  = fnDef.diagramId;
        const fnMeasure = layoutStack(
          fnBlocks,
          createContainerRef({ diagramId: fnDiagId, kind: 'diagram' }),
          x, y + H.fn, width, store,
        );
        fnBodyHeight = fnMeasure.height;
        // The expanded body may be wider than the slot (e.g. contains a switchCase).
        fnBodyWidth  = Math.max(fnMeasure.width, width);
      }
      return { block, x, y, width: fnBodyWidth, height: H.fn + fnBodyHeight,
               kind: block.type, diagramId, fnExpanded, fnDef, fnBlocks };
    }

    case 'ifElse': {
      const top  = H.ifTop;
      const lRef = createContainerRef({ diagramId, parentBlockId: block.id, kind: 'ifElse', branch: 'thenBlocks' });
      const rRef = createContainerRef({ diagramId, parentBlockId: block.id, kind: 'ifElse', branch: 'elseBlocks' });
      // Compute the minimum width each branch needs independently.
      const lMin = Math.max(blockListMinWidth(block.thenBlocks, diagramId, store), H.minCaseW);
      const rMin = Math.max(blockListMinWidth(block.elseBlocks, diagramId, store), H.minCaseW);
      const minTotal = lMin + rMin;
      // Distribute the available width proportionally to each branch's minimum,
      // but never give a branch less than its own minimum.
      const effectiveW = Math.max(width, minTotal);
      const leftW  = Math.max(Math.round(effectiveW * lMin / minTotal), lMin);
      const rightW = Math.max(effectiveW - leftW, rMin);
      const left  = layoutStack(block.thenBlocks, lRef, x,            y + top, leftW,  store);
      const right = layoutStack(block.elseBlocks, rRef, x + left.width, y + top, rightW, store);
      const totalW = left.width + right.width;
      const h = top + Math.max(left.height, right.height, 90);
      return { block, x, y, width: totalW, height: h,
               kind: 'ifElse', left, right, dividerX: x + left.width, diagramId };
    }

    case 'whileDo': {
      const wH  = H.loopHead;
      const wC  = H.loopCond;
      const wRef = createContainerRef({ diagramId, parentBlockId: block.id, kind: 'whileDo', branch: 'body' });
      const wBody = layoutStack(block.body, wRef, x + 18, y + wH + wC, width - 18, store);
      // Body may be wider than (width-18) if it contains a wide switch/ifElse.
      const totalW = wBody.width + 18;
      return { block, x, y, width: Math.max(totalW, width),
               height: wH + wC + Math.max(wBody.height, 110),
               kind: 'whileDo', body: wBody, head: wH, cond: wC, diagramId };
    }

    case 'doWhile': {
      const dC  = H.loopCond;
      const dF  = H.loopHead;
      const dRef = createContainerRef({ diagramId, parentBlockId: block.id, kind: 'doWhile', branch: 'body' });
      const dBody = layoutStack(block.body, dRef, x + 18, y, width - 18, store);
      const totalW = dBody.width + 18;
      return { block, x, y, width: Math.max(totalW, width),
               height: Math.max(dBody.height, 110) + dC + dF,
               kind: 'doWhile', body: dBody, cond: dC, foot: dF, diagramId };
    }

    case 'forLoop': {
      const fH  = H.loopHead;
      const fG  = H.loopCond;
      const fRef = createContainerRef({ diagramId, parentBlockId: block.id, kind: 'forLoop', branch: 'body' });
      const fBody = layoutStack(block.body, fRef, x + 18, y + fH + fG, width - 18, store);
      const totalW = fBody.width + 18;
      return { block, x, y, width: Math.max(totalW, width),
               height: fH + fG + Math.max(fBody.height, 110),
               kind: 'forLoop', body: fBody, head: fH, grid: fG, diagramId };
    }

    case 'switchCase': {
      const sH = H.swHead;
      const sL = H.swLabel;
      const cc = Math.max(block.cases.length, 1);

      // ── Pass 1: compute the minimum readable width for each column ─────────
      // blockMinWidth mirrors the exact constraints that layoutBlock will apply,
      // so colMinWidths[i] is the smallest width at which column i fits without
      // any child block overflowing its container.
      const minCW  = H.minCaseW;
      const fairCW = Math.max(Math.floor(width / cc), minCW);

      const colMinWidths = block.cases.map((c) => {
        return blockListMinWidth(c.blocks, diagramId, store);
      });

      // Each column is at least max(fairCW, its minimum content width).
      const colWidths = colMinWidths.map((mw) => Math.max(fairCW, mw));

      // ── Pass 2: lay out each column and use the stack's actual width ────────
      // layoutStack may return a width larger than colWidths[i] in edge cases
      // (deeply nested containers with compounding minimums). Using stack.width
      // as the authoritative column width ensures no child ever overflows.
      let curX = x;
      const sCases = block.cases.map((c, i) => {
        const cw   = colWidths[i];
        const cRef = createContainerRef({ diagramId, parentBlockId: block.id, kind: 'switchCase', branch: 'caseBlocks', caseId: c.id });
        const stack = layoutStack(c.blocks, cRef, curX, y + sH + sL, cw, store);
        // Use the larger of the pre-computed width and the stack's actual width.
        const actualCW = Math.max(cw, stack.width);
        const col = { caseItem: c, x: curX, y: y + sH, width: actualCW, stack };
        curX += actualCW;
        return col;
      });

      const totalW = curX - x;
      const maxH   = Math.max(...sCases.map((c) => c.stack.height), sL);
      return { block, x, y, width: totalW, height: sH + sL + maxH,
               kind: 'switchCase', cases: sCases, head: sH, diagramId };
    }

    default:
      return { block, x, y, width, height: H.leaf, kind: block.type, diagramId };
  }
}

// ── JSDoc type stubs ──────────────────────────────────────────────────────────
/**
 * @typedef {{ diagramId: string, parentBlockId: string|null,
 *             kind: string, branch: string|null, caseId: string|null,
 *             index?: number }} ContainerRef
 *
 * @typedef {{ kind: string, block?: *, ref?: ContainerRef,
 *             x: number, y: number, width: number, height: number,
 *             [key: string]: * }} LayoutItem
 */
