// tests/layout.test.js
//
// layoutBlock and layoutStack are pure geometry functions — no DOM needed.
// We supply a minimal Store stub that exposes only what layout.js uses:
//   store.getState()          → AppState
//   store.expandedFnBlocks    → Set<string>

import { describe, it, expect } from 'vitest';
import { H } from '../js/constants.js';
import { layoutBlock, layoutStack, createContainerRef } from '../js/layout.js';
import { normalizeState, defaultState } from '../js/state.js';

// ── Minimal store stub ────────────────────────────────────────────────────────

/**
 *
 * @param extraState
 */
function makeStoreStub(extraState = {}) {
  const state = normalizeState({ ...defaultState(), ...extraState });
  return {
    getState:        () => state,
    expandedFnBlocks: new Set(),
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 *
 * @param type
 * @param extra
 */
function block(type, extra = {}) {
  return { id: `b-${type}`, type, ...extra };
}

const DIAG_ID = 'diag-test';
const X = 0, Y = 0, W = 1040;

// ── layoutBlock — leaf blocks ─────────────────────────────────────────────────

describe('layoutBlock — leaf blocks', () => {
  it('statement has height H.leaf', () => {
    const store = makeStoreStub();
    const item  = layoutBlock(block('statement', { text: '' }), X, Y, W, DIAG_ID, store);
    expect(item.height).toBe(H.leaf);
  });

  it('comment has height H.leaf', () => {
    const store = makeStoreStub();
    const item  = layoutBlock(block('comment', { text: '' }), X, Y, W, DIAG_ID, store);
    expect(item.height).toBe(H.leaf);
  });

  it('terminator has height H.term', () => {
    const store = makeStoreStub();
    const item  = layoutBlock(block('terminator', { kind: 'break', value: '' }), X, Y, W, DIAG_ID, store);
    expect(item.height).toBe(H.term);
  });

  it('unknown type falls back to H.leaf', () => {
    const store = makeStoreStub();
    const item  = layoutBlock(block('custom'), X, Y, W, DIAG_ID, store);
    expect(item.height).toBe(H.leaf);
  });
});

// ── layoutBlock — functionCall ────────────────────────────────────────────────

describe('layoutBlock — functionCall', () => {
  it('collapsed functionCall has height H.fn', () => {
    const store = makeStoreStub();
    const b     = block('functionCall', { functionId: null, functionName: 'f' });
    const item  = layoutBlock(b, X, Y, W, DIAG_ID, store);
    expect(item.height).toBe(H.fn);
    expect(item.fnExpanded).toBe(false);
  });

  it('expanded functionCall adds body height', () => {
    // Build a state with a known function diagram containing one statement
    const fnDiagId = 'fn-diag';
    const fnId     = 'fn-1';
    const state    = normalizeState(defaultState());
    state.diagrams[fnDiagId] = {
      id: fnDiagId, name: 'MyFn',
      blocks: [{ id: 'inner', type: 'statement', text: 'x = 1' }],
    };
    state.functions[fnId] = { id: fnId, diagramId: fnDiagId, name: 'MyFn' };

    const store = {
      getState:         () => state,
      expandedFnBlocks: new Set(['b-functionCall']),
    };

    const b    = block('functionCall', { functionId: fnId, functionName: 'MyFn' });
    const item = layoutBlock(b, X, Y, W, DIAG_ID, store);

    // Height must exceed H.fn because the body is expanded
    expect(item.height).toBeGreaterThan(H.fn);
    expect(item.fnExpanded).toBe(true);
  });
});

// ── layoutBlock — ifElse ──────────────────────────────────────────────────────

describe('layoutBlock — ifElse', () => {
  it('empty ifElse height is H.ifTop + max(0, 0, 90)', () => {
    const store = makeStoreStub();
    const b     = block('ifElse', { condition: '', thenBlocks: [], elseBlocks: [] });
    const item  = layoutBlock(b, X, Y, W, DIAG_ID, store);
    expect(item.height).toBe(H.ifTop + 90);
  });

  it('exposes left and right sub-layouts', () => {
    const store = makeStoreStub();
    const b     = block('ifElse', { condition: '', thenBlocks: [], elseBlocks: [] });
    const item  = layoutBlock(b, X, Y, W, DIAG_ID, store);
    expect(item.left).toBeDefined();
    expect(item.right).toBeDefined();
    expect(item.left.width).toBeCloseTo(W / 2);
    expect(item.right.width).toBeCloseTo(W / 2);
  });

  it('taller branch determines total height', () => {
    const store = makeStoreStub();
    // Put two statements in the then-branch to make it taller than the minimum
    const thenChild = { id: 'tc', type: 'statement', text: 'x' };
    const b = block('ifElse', {
      condition:  'x > 0',
      thenBlocks: [thenChild, { id: 'tc2', type: 'statement', text: 'y' }],
      elseBlocks: [],
    });
    const item = layoutBlock(b, X, Y, W, DIAG_ID, store);
    // left branch has 2 statements, each H.leaf + insert zones
    expect(item.height).toBeGreaterThan(H.ifTop + 90);
    expect(item.height).toBe(H.ifTop + Math.max(item.left.height, item.right.height, 90));
  });
});

// ── layoutBlock — loops ───────────────────────────────────────────────────────

describe('layoutBlock — whileDo', () => {
  it('empty body has minimum height', () => {
    const store = makeStoreStub();
    const b     = block('whileDo', { condition: '', body: [] });
    const item  = layoutBlock(b, X, Y, W, DIAG_ID, store);
    expect(item.height).toBe(H.loopHead + H.loopCond + 110);
  });

  it('body width is reduced by 18px for the loop bar', () => {
    const store = makeStoreStub();
    const b     = block('whileDo', { condition: '', body: [] });
    const item  = layoutBlock(b, X, Y, W, DIAG_ID, store);
    expect(item.body.width).toBe(W - 18);
  });
});

describe('layoutBlock — doWhile', () => {
  it('empty body has minimum height', () => {
    const store = makeStoreStub();
    const b     = block('doWhile', { condition: '', body: [] });
    const item  = layoutBlock(b, X, Y, W, DIAG_ID, store);
    expect(item.height).toBe(110 + H.loopCond + H.loopHead);
  });
});

describe('layoutBlock — forLoop', () => {
  it('empty body has minimum height', () => {
    const store = makeStoreStub();
    const b     = block('forLoop', { init: '', condition: '', step: '', body: [] });
    const item  = layoutBlock(b, X, Y, W, DIAG_ID, store);
    expect(item.height).toBe(H.loopHead + H.loopCond + 110);
  });
});

// ── layoutBlock — switchCase ──────────────────────────────────────────────────

describe('layoutBlock — switchCase', () => {
  it('height is swHead + swLabel + max body height (min swLabel for empty cases)', () => {
    const store = makeStoreStub();
    const b = block('switchCase', {
      expression: 'x',
      cases: [
        { id: 'c1', name: 'A',       blocks: [], isDefault: false },
        { id: 'c2', name: 'Default', blocks: [], isDefault: true  },
      ],
    });
    const item = layoutBlock(b, X, Y, W, DIAG_ID, store);
    // Each empty case produces a stack of height 60 (layoutStack minimum).
    // Total = swHead + swLabel + max(60, swLabel) = swHead + swLabel + 60.
    expect(item.height).toBe(H.swHead + H.swLabel + Math.max(60, H.swLabel));
    // And it must be at least swHead + swLabel + 1.
    expect(item.height).toBeGreaterThan(H.swHead + H.swLabel);
  });

  it('each case column width is at least minCaseW and total fills available width', () => {
    const store = makeStoreStub();
    const b = block('switchCase', {
      expression: 'x',
      cases: [
        { id: 'c1', name: 'A', blocks: [], isDefault: false },
        { id: 'c2', name: 'B', blocks: [], isDefault: false },
        { id: 'c3', name: 'Default', blocks: [], isDefault: true },
      ],
    });
    const item = layoutBlock(b, X, Y, W, DIAG_ID, store);
    expect(item.cases).toHaveLength(3);
    // Each column is at least H.minCaseW wide.
    item.cases.forEach((c) => {
      expect(c.width).toBeGreaterThanOrEqual(H.minCaseW);
    });
    // Total width of all columns equals item.width.
    const totalCaseW = item.cases.reduce((sum, c) => sum + c.width, 0);
    expect(totalCaseW).toBe(item.width);
  });
});

// ── layoutStack ───────────────────────────────────────────────────────────────

describe('layoutStack', () => {
  it('empty stack has minimum height 60', () => {
    const store = makeStoreStub();
    const cRef  = createContainerRef({ diagramId: DIAG_ID, kind: 'diagram' });
    const layout = layoutStack([], cRef, X, Y, W, store);
    expect(layout.height).toBeGreaterThanOrEqual(60);
  });

  it('items array has 2*n + 1 entries for n blocks (inserts between every block)', () => {
    const store  = makeStoreStub();
    const cRef   = createContainerRef({ diagramId: DIAG_ID, kind: 'diagram' });
    const blocks = [
      { id: 'a', type: 'statement', text: '' },
      { id: 'b', type: 'statement', text: '' },
    ];
    const layout = layoutStack(blocks, cRef, X, Y, W, store);
    // 2 blocks → 3 insert targets + 2 block items = 5
    expect(layout.items).toHaveLength(5);
  });

  it('all insert-target items have kind "insert"', () => {
    const store  = makeStoreStub();
    const cRef   = createContainerRef({ diagramId: DIAG_ID, kind: 'diagram' });
    const blocks = [{ id: 'a', type: 'statement', text: '' }];
    const layout = layoutStack(blocks, cRef, X, Y, W, store);
    const inserts = layout.items.filter((i) => i.kind === 'insert');
    expect(inserts).toHaveLength(2); // before and after the single block
  });

  it('total height equals sum of block heights (insert zones are zero-height between blocks)', () => {
    const store  = makeStoreStub();
    const cRef   = createContainerRef({ diagramId: DIAG_ID, kind: 'diagram' });
    const blocks = [{ id: 'a', type: 'statement', text: '' }];
    const layout = layoutStack(blocks, cRef, X, Y, W, store);
    // Non-empty stacks: insert zones between blocks have height 0.
    // Total height = sum of block heights, minimum 60.
    expect(layout.height).toBe(Math.max(H.leaf, 60));
  });

  it('y coordinate of block items is non-decreasing and block items follow their preceding insert', () => {
    const store  = makeStoreStub();
    const cRef   = createContainerRef({ diagramId: DIAG_ID, kind: 'diagram' });
    const blocks = [
      { id: 'a', type: 'statement', text: '' },
      { id: 'b', type: 'comment',   text: '' },
    ];
    const layout = layoutStack(blocks, cRef, X, Y, W, store);
    // Block items (non-insert) must appear in ascending y order.
    const blockItems = layout.items.filter((i) => i.kind !== 'insert');
    expect(blockItems).toHaveLength(2);
    expect(blockItems[1].y).toBeGreaterThanOrEqual(blockItems[0].y + blockItems[0].height);
  });
});
