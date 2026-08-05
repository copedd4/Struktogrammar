// tests/events.test.js
// Lightweight tests for the pure helpers and i18n keys that events.js depends on.
// Full DOM integration (buildRenderPipeline) requires a real browser; those paths
// are covered by svg-render.test.js and manual testing.

import { describe, it, expect } from 'vitest';
import { tr } from '../js/i18n.js';
import { defaultState, normalizeState, flattenBlocks, createBlock } from '../js/state.js';

// ── i18n keys consumed by events.js ──────────────────────────────────────────
describe('i18n keys required by events.js', () => {
  const REQUIRED_KEYS = [
    'newProject', 'openProject', 'saveProject', 'saveAsProject',
    'saveSvg', 'savePng', 'savePdf',
    'undo', 'redo', 'duplicate', 'delete',
    'zoomIn', 'zoomOut', 'zoomReset', 'zoomFit',
    'validateAction', 'toggleBlockPicker',
    'rootDiagram', 'noSelection', 'selected',
    'contextOpen', 'contextDuplicate', 'contextDelete', 'contextComment',
    'cancel', 'confirmNewProject', 'confirmDelete', 'deletedUndo',
    'note', 'searchToggle', 'dragHint',
  ];

  it('all required keys exist in EN', () => {
    const t = tr('en');
    REQUIRED_KEYS.forEach((key) => {
      expect(t[key], `t.${key}`).toBeTruthy();
    });
  });

  it('all required keys exist in DE', () => {
    const t = tr('de');
    REQUIRED_KEYS.forEach((key) => {
      expect(t[key], `t.${key}`).toBeTruthy();
    });
  });
});

// ── State helpers used by events.js ──────────────────────────────────────────
describe('defaultState + normalizeState', () => {
  it('produces a state with a valid rootDiagramId', () => {
    const s = normalizeState(defaultState());
    expect(s.rootDiagramId).toBeTruthy();
    expect(s.diagrams[s.rootDiagramId]).toBeTruthy();
  });

  it('normalizeState with null returns a fresh default state', () => {
    const s = normalizeState(null);
    expect(s.diagrams).toBeTruthy();
    expect(s.functions).toBeTruthy();
  });
});

// ── flattenBlocks (used by search and keyboard nav) ───────────────────────────
describe('flattenBlocks', () => {
  it('returns empty array for no blocks', () => {
    expect(flattenBlocks([])).toEqual([]);
  });

  it('flattens a single statement', () => {
    const s = normalizeState(defaultState());
    const b = createBlock('statement', s);
    expect(flattenBlocks([b])).toEqual([b]);
  });

  it('flattens nested ifElse children', () => {
    const s     = normalizeState(defaultState());
    const child = createBlock('statement', s);
    const parent = { id: 'p1', type: 'ifElse', condition: 'x', thenBlocks: [child], elseBlocks: [] };
    const flat  = flattenBlocks([parent]);
    expect(flat).toHaveLength(2);
    expect(flat[1].id).toBe(child.id);
  });

  it('flattens switchCase children across all cases', () => {
    const s  = normalizeState(defaultState());
    const c1 = createBlock('statement', s);
    const c2 = createBlock('statement', s);
    const sw = {
      id: 'sw1', type: 'switchCase', expression: 'x',
      cases: [
        { id: 'ca1', name: 'A', blocks: [c1], isDefault: false },
        { id: 'ca2', name: 'Default', blocks: [c2], isDefault: true },
      ],
    };
    const flat = flattenBlocks([sw]);
    expect(flat).toHaveLength(3); // sw + c1 + c2
    expect(flat.map((b) => b.id)).toContain(c1.id);
    expect(flat.map((b) => b.id)).toContain(c2.id);
  });
});

// ── createBlock (used when inserting blocks) ──────────────────────────────────
describe('createBlock', () => {
  it('creates a statement block with an id and empty text', () => {
    const s = normalizeState(defaultState());
    const b = createBlock('statement', s);
    expect(b.id).toBeTruthy();
    expect(b.type).toBe('statement');
    expect(b.text).toBe('');
  });

  it('creates an ifElse block with empty branch arrays', () => {
    const s = normalizeState(defaultState());
    const b = createBlock('ifElse', s);
    expect(Array.isArray(b.thenBlocks)).toBe(true);
    expect(Array.isArray(b.elseBlocks)).toBe(true);
  });

  it('creates a switchCase block with at least one default case', () => {
    const s = normalizeState(defaultState());
    const b = createBlock('switchCase', s);
    expect(b.cases.some((c) => c.isDefault)).toBe(true);
  });

  it('creates a functionCall block and registers diagram+function in state', () => {
    const s = normalizeState(defaultState());
    const b = createBlock('functionCall', s);
    expect(b.functionId).toBeTruthy();
    expect(s.functions[b.functionId]).toBeTruthy();
    expect(s.diagrams[s.functions[b.functionId].diagramId]).toBeTruthy();
  });
});
