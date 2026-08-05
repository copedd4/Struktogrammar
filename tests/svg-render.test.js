// tests/svg-render.test.js
// Tests for SVG primitive helpers and the renderLayoutToSvg entry point.
// vitest uses jsdom which provides document/SVGElement.

import { describe, it, expect, vi } from 'vitest';
import { svgRect, svgLine, svgText, svgGroup, svgHit, renderLayoutToSvg } from '../js/svg-render.js';
import { SVG_NS } from '../js/constants.js';

// ── Minimal store factory ─────────────────────────────────────────────────────
/**
 *
 * @param overrides
 */
function makeStore(overrides = {}) {
  return {
    getState: () => ({
      settings: { language: 'en', theme: 'light' },
      diagrams: {}, functions: {}, rootDiagramId: 'root',
      ...(overrides.state || {}),
    }),
    selectedId:        overrides.selectedId        ?? null,
    expandedFnBlocks:  overrides.expandedFnBlocks  ?? new Set(),
    dragMoveId:        overrides.dragMoveId        ?? null,
    dragBlockType:     overrides.dragBlockType     ?? null,
    persist:           vi.fn(),
    ...overrides,
  };
}

// ── SVG primitive helpers ─────────────────────────────────────────────────────
describe('svgRect', () => {
  it('sets x, y, width, height, class', () => {
    const r = svgRect(10, 20, 100, 50, 'svg-fill');
    expect(r.getAttribute('x')).toBe('10');
    expect(r.getAttribute('y')).toBe('20');
    expect(r.getAttribute('width')).toBe('100');
    expect(r.getAttribute('height')).toBe('50');
    expect(r.getAttribute('class')).toBe('svg-fill');
  });

  it('returns an SVG rect element', () => {
    const r = svgRect(0, 0, 1, 1, 'x');
    expect(r.tagName.toLowerCase()).toBe('rect');
    expect(r.namespaceURI).toBe(SVG_NS);
  });
});

describe('svgLine', () => {
  it('sets x1, y1, x2, y2, class', () => {
    const l = svgLine(0, 5, 100, 5, 'svg-line');
    expect(l.getAttribute('x1')).toBe('0');
    expect(l.getAttribute('y1')).toBe('5');
    expect(l.getAttribute('x2')).toBe('100');
    expect(l.getAttribute('y2')).toBe('5');
    expect(l.getAttribute('class')).toBe('svg-line');
  });
});

describe('svgText', () => {
  it('sets position, class, and text content', () => {
    const t = svgText(5, 15, 'Hello world', 'svg-title-sm');
    expect(t.getAttribute('x')).toBe('5');
    expect(t.getAttribute('y')).toBe('15');
    expect(t.getAttribute('class')).toBe('svg-title-sm');
    expect(t.textContent).toBe('Hello world');
  });

  it('handles null/undefined text gracefully', () => {
    const t = svgText(0, 0, null, 'svg-text');
    expect(t.textContent).toBe('');
  });
});

describe('svgGroup', () => {
  it('creates a <g> with the given class', () => {
    const g = svgGroup('svg-block selected');
    expect(g.tagName.toLowerCase()).toBe('g');
    expect(g.getAttribute('class')).toBe('svg-block selected');
  });
});

describe('svgHit', () => {
  it('stores blockId as dataset.blockId', () => {
    const h = svgHit(0, 0, 200, 20, 'block-abc');
    expect(h.dataset.blockId).toBe('block-abc');
    expect(h.getAttribute('class')).toBe('svg-hit');
  });
});

// ── renderLayoutToSvg ─────────────────────────────────────────────────────────
describe('renderLayoutToSvg', () => {
  it('renders nothing into an SVG for an empty items array', () => {
    const svg = document.createElementNS(SVG_NS, 'svg');
    renderLayoutToSvg(svg, { items: [] }, makeStore(), vi.fn());
    expect(svg.children.length).toBe(0);
  });

  it('appends a <g data-block-id> for a statement block', () => {
    const svg   = document.createElementNS(SVG_NS, 'svg');
    const block = { id: 'b1', type: 'statement', text: 'x = 1' };
    const layout = {
      items: [{ kind: 'statement', block, x: 0, y: 0, width: 300, height: 52, diagramId: 'root' }],
    };
    renderLayoutToSvg(svg, layout, makeStore(), vi.fn());
    const g = svg.querySelector('[data-block-id="b1"]');
    expect(g).not.toBeNull();
    expect(g.tagName.toLowerCase()).toBe('g');
  });

  it('adds "selected" class when store.selectedId matches', () => {
    const svg   = document.createElementNS(SVG_NS, 'svg');
    const block = { id: 'sel1', type: 'statement', text: '' };
    const layout = {
      items: [{ kind: 'statement', block, x: 0, y: 0, width: 300, height: 52, diagramId: 'root' }],
    };
    renderLayoutToSvg(svg, layout, makeStore({ selectedId: 'sel1' }), vi.fn());
    const g = svg.querySelector('[data-block-id="sel1"]');
    expect(g.getAttribute('class')).toContain('selected');
  });

  it('does NOT add "selected" class for a different selectedId', () => {
    const svg   = document.createElementNS(SVG_NS, 'svg');
    const block = { id: 'b2', type: 'statement', text: '' };
    const layout = {
      items: [{ kind: 'statement', block, x: 0, y: 0, width: 300, height: 52, diagramId: 'root' }],
    };
    renderLayoutToSvg(svg, layout, makeStore({ selectedId: 'other' }), vi.fn());
    const g = svg.querySelector('[data-block-id="b2"]');
    expect(g.getAttribute('class')).not.toContain('selected');
  });

  it('renders a comment block', () => {
    const svg   = document.createElementNS(SVG_NS, 'svg');
    const block = { id: 'c1', type: 'comment', text: 'This is a note' };
    const layout = {
      items: [{ kind: 'comment', block, x: 0, y: 0, width: 300, height: 52, diagramId: 'root' }],
    };
    renderLayoutToSvg(svg, layout, makeStore(), vi.fn());
    expect(svg.querySelector('[data-block-id="c1"]')).not.toBeNull();
  });

  it('renders a terminator block', () => {
    const svg   = document.createElementNS(SVG_NS, 'svg');
    const block = { id: 't1', type: 'terminator', kind: 'return', value: '0' };
    const layout = {
      items: [{ kind: 'terminator', block, x: 0, y: 0, width: 300, height: 40, diagramId: 'root' }],
    };
    renderLayoutToSvg(svg, layout, makeStore(), vi.fn());
    expect(svg.querySelector('[data-block-id="t1"]')).not.toBeNull();
  });

  it('renders an insert target (kind="insert") as a group', () => {
    const svg = document.createElementNS(SVG_NS, 'svg');
    const ref = { diagramId: 'root', parentBlockId: null, kind: 'diagram', branch: null, caseId: null, index: 0 };
    const layout = {
      items: [{ kind: 'insert', ref, x: 0, y: 0, width: 300, height: 0 }],
    };
    renderLayoutToSvg(svg, layout, makeStore(), vi.fn());
    // Insert targets produce a <g class="svg-insert-target">
    const g = svg.querySelector('.svg-insert-target');
    expect(g).not.toBeNull();
  });
});
