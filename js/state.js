// ── State — pure functions ────────────────────────────────────────────────────
// No side-effects, no DOM access. Safe to import in unit tests without a browser.

/**
 * Generate a short random ID with an optional prefix.
 *
 * @param {string} [prefix='id']
 * @returns {string}  e.g. 'block-a3f9z2k'
 */
export function uid(prefix = 'id') {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Deep-clone any JSON-serialisable value.
 *
 * @template T
 * @param {T} o
 * @returns {T}
 */
export function deepClone(o) {
  return JSON.parse(JSON.stringify(o));
}

/**
 * Escape a value for safe insertion into HTML text / attributes.
 *
 * @param {*} v
 * @returns {string}
 */
export function escapeHtml(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Alias kept for call-sites that use escapeAttr. */
export const escapeAttr = escapeHtml;

// ── Default state ─────────────────────────────────────────────────────────────

/**
 * Build a brand-new blank application state.
 *
 * @returns {AppState}
 */
export function defaultState() {
  const rootId = uid('diagram');
  return {
    version: 5,
    settings: { language: 'en', theme: 'light' },
    rootDiagramId: rootId,
    diagrams: {},
    functions: {},
  };
}

/**
 * Return the default two-case + Default switch-case array.
 *
 * @returns {CaseItem[]}
 */
export function defaultCases() {
  return [
    { id: uid('case'), name: 'A',       blocks: [], isDefault: false },
    { id: uid('case'), name: 'B',       blocks: [], isDefault: false },
    { id: uid('case'), name: 'Default', blocks: [], isDefault: true  },
  ];
}

// ── Block factory ─────────────────────────────────────────────────────────────

/**
 * Create a new block of the given type with default field values.
 *
 * For 'functionCall' the factory also registers a new diagram and function
 * definition inside `state` — pass the current mutable state object.
 *
 * @param {string}   type  - Block type key (e.g. 'statement', 'ifElse').
 * @param {AppState} state - Current application state (mutated for functionCall).
 * @returns {Block}
 */
export function createBlock(type, state) {
  switch (type) {
    case 'statement':
      return { id: uid('block'), type, text: '' };
    case 'ifElse':
      return { id: uid('block'), type, condition: '', thenBlocks: [], elseBlocks: [] };
    case 'whileDo':
      return { id: uid('block'), type, condition: '', body: [] };
    case 'doWhile':
      return { id: uid('block'), type, condition: '', body: [] };
    case 'forLoop':
      return { id: uid('block'), type, init: '', condition: '', step: '', body: [] };
    case 'functionCall': {
      const fnId = uid('fn');
      const dId  = uid('diagram');
      state.diagrams[dId]   = { id: dId,  name: 'Function', blocks: [] };
      state.functions[fnId] = { id: fnId, diagramId: dId, name: 'Function' };
      return { id: uid('block'), type, functionId: fnId, functionName: 'Function' };
    }
    case 'switchCase':
      return { id: uid('block'), type, expression: '', cases: defaultCases() };
    case 'terminator':
      return { id: uid('block'), type, kind: 'break', value: '' };
    case 'comment':
      return { id: uid('block'), type, text: '' };
    default:
      return { id: uid('block'), type, text: '' };
  }
}

// ── Normalization ─────────────────────────────────────────────────────────────

/**
 * Recursively ensure a block and all its children have the correct array fields.
 * Mutates `b` in place — callers should always operate on clones or
 * freshly-parsed JSON.
 *
 * @param {Block} b - The block to normalise.
 * @returns {void}
 */
export function normalizeBlock(b) {
  if (!b || !b.type) {return;}

  if (b.type === 'ifElse') {
    b.thenBlocks = Array.isArray(b.thenBlocks) ? b.thenBlocks : [];
    b.elseBlocks = Array.isArray(b.elseBlocks) ? b.elseBlocks : [];
    b.thenBlocks.forEach(normalizeBlock);
    b.elseBlocks.forEach(normalizeBlock);
  }

  if (b.type === 'whileDo' || b.type === 'doWhile' || b.type === 'forLoop') {
    b.body = Array.isArray(b.body) ? b.body : [];
    b.body.forEach(normalizeBlock);
  }

  if (b.type === 'switchCase') {
    b.cases = Array.isArray(b.cases) && b.cases.length ? b.cases : defaultCases();
    b.cases.forEach((c) => {
      c.blocks = Array.isArray(c.blocks) ? c.blocks : [];
      c.blocks.forEach(normalizeBlock);
    });
    if (!b.cases.some((c) => c.isDefault)) {
      b.cases.push({ id: uid('case'), name: 'Default', blocks: [], isDefault: true });
    }
  }
}

/**
 * Ensure a raw (possibly partial) state object has all required fields.
 * Safe to call on freshly-parsed JSON from localStorage or a .stkg file.
 *
 * @param {Partial<AppState>|null|undefined} [state] - Raw state; defaults to a fresh state when falsy.
 * @returns {AppState}
 */
export function normalizeState(state) {
  /** @type {any} */
  const next = state || defaultState();
  if (!next.settings)  {next.settings  = { language: 'en', theme: 'light' };}
  if (!next.diagrams)  {next.diagrams  = {};}
  if (!next.functions) {next.functions = {};}

  if (!next.diagrams[next.rootDiagramId]) {
    next.diagrams[next.rootDiagramId] = {
      id:     next.rootDiagramId,
      name:   'Main',
      blocks: [],
    };
  }

  Object.values(next.diagrams).forEach((d) => {
    d.blocks = Array.isArray(d.blocks) ? d.blocks : [];
    d.blocks.forEach(normalizeBlock);
  });

  return next;
}

// ── Block tree helpers ────────────────────────────────────────────────────────

/**
 * Assign fresh IDs to every block in a tree (used after clone/paste).
 *
 * @param {Block} b - Root of the block tree to re-key (mutated in place).
 * @returns {void}
 */
export function rekeyBlockTree(b) {
  b.id = uid('block');
  if (b.type === 'ifElse') {
    b.thenBlocks.forEach(rekeyBlockTree);
    b.elseBlocks.forEach(rekeyBlockTree);
  }
  if (b.type === 'whileDo' || b.type === 'doWhile' || b.type === 'forLoop') {
    b.body.forEach(rekeyBlockTree);
  }
  if (b.type === 'switchCase') {
    b.cases.forEach((c) => { c.blocks.forEach(rekeyBlockTree); });
  }
}

/**
 * Flatten a block tree into a single array (depth-first pre-order).
 *
 * @param {Block[]} blocks - Top-level block array.
 * @param {Block[]} [acc]  - Accumulator; omit on the initial call.
 * @returns {Block[]}
 */
export function flattenBlocks(blocks, acc = []) {
  blocks.forEach((b) => {
    acc.push(b);
    if (b.type === 'ifElse') {
      flattenBlocks(b.thenBlocks, acc);
      flattenBlocks(b.elseBlocks, acc);
    }
    if (b.type === 'whileDo' || b.type === 'doWhile' || b.type === 'forLoop') {
      flattenBlocks(b.body, acc);
    }
    if (b.type === 'switchCase') {
      b.cases.forEach((c) => { flattenBlocks(c.blocks, acc); });
    }
  });
  return acc;
}

/**
 * Check if a block (by ID) is a descendant of another block tree.
 *
 * @param {Block}  root     - The root of the tree to search.
 * @param {string} targetId - The ID to look for.
 * @returns {boolean}
 */
export function isDescendantOf(root, targetId) {
  if (!root) {return false;}
  if (root.id === targetId) {return true;}
  const children = flattenBlocks([root]);
  return children.some((b) => b.id === targetId);
}

// ── JSDoc type stubs ──────────────────────────────────────────────────────────
/**
 * @typedef {{ version: number, settings: {language:string, theme:string},
 *             rootDiagramId: string,
 *             diagrams:  Record<string, Diagram>,
 *             functions: Record<string, FunctionDef> }} AppState
 *
 * @typedef {{ id: string, name: string, blocks: Block[] }} Diagram
 * @typedef {{ id: string, diagramId: string, name: string }} FunctionDef
 *
 * @typedef {{
 *   id: string,
 *   type: string,
 *   text?: string,
 *   condition?: string,
 *   thenBlocks?: Block[],
 *   elseBlocks?: Block[],
 *   body?: Block[],
 *   init?: string,
 *   step?: string,
 *   functionId?: string|null,
 *   functionName?: string,
 *   expression?: string,
 *   cases?: CaseItem[],
 *   kind?: string,
 *   value?: string,
 *   comment?: string
 * }} Block
 *
 * @typedef {{ id: string, name: string, blocks: Block[], isDefault: boolean }} CaseItem
 */
