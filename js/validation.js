// ── Validation ────────────────────────────────────────────────────────────────

import { flattenBlocks } from './state.js';
import { tr } from './i18n.js';

/**
 * Validate the entire project and return an array of warning strings.
 * An empty array means the project is clean.
 *
 * Checks:
 *  - Empty required fields (statement text, conditions, function names, switch expressions).
 *  - Duplicate function names across all functionCall blocks.
 *  - Duplicate switch-case labels within a single switchCase block.
 *  - Duplicate function definition names in state.functions.
 *
 * @param {import('./state.js').AppState} state
 * @returns {string[]}  Human-readable warning messages, one per offending block.
 */
export function validateProject(state) {
  const lang = state.settings.language;
  const t    = tr(lang);
  const w    = [];

  // ── Per-block field checks ─────────────────────────────────────────────────
  Object.values(state.diagrams).forEach((d) => {
    flattenBlocks(d.blocks).forEach((b) => {
      if (b.type === 'statement'    && !(b.text         || '').trim()) {w.push(`${b.id}: ${t.statement}`);}
      if ((b.type === 'ifElse' || b.type === 'whileDo' || b.type === 'doWhile')
          && !(b.condition || '').trim())                               {w.push(`${b.id}: ${t.condition}`);}
      if (b.type === 'forLoop'      && !(b.condition    || '').trim()) {w.push(`${b.id}: ${t.forCondition}`);}
      if (b.type === 'functionCall' && !(b.functionName || '').trim()) {w.push(`${b.id}: ${t.functionName}`);}
      if (b.type === 'switchCase'   && !(b.expression   || '').trim()) {w.push(`${b.id}: ${t.switchExpr}`);}

      // Duplicate switch-case labels within one block.
      if (b.type === 'switchCase' && Array.isArray(b.cases)) {
        const seen = new Set();
        b.cases.forEach((c) => {
          const label = (c.name || '').trim();
          if (!label) {return;}
          if (seen.has(label)) {
            w.push(`${b.id}: ${t.duplicateCaseLabel || 'Duplicate case label'}: "${label}"`);
          }
          seen.add(label);
        });
      }
    });
  });

  // ── Duplicate function names across functionCall blocks ────────────────────
  const fnNames = new Map(); // name → first block id
  Object.values(state.diagrams).forEach((d) => {
    flattenBlocks(d.blocks).forEach((b) => {
      if (b.type !== 'functionCall') {return;}
      const name = (b.functionName || '').trim().toLowerCase();
      if (!name) {return;}
      if (fnNames.has(name)) {
        w.push(`${b.id}: ${t.duplicateFunctionName || 'Duplicate function name'}: "${b.functionName}"`);
      } else {
        fnNames.set(name, b.id);
      }
    });
  });

  // ── Duplicate function definition names in state.functions ────────────────
  const defNames = new Map();
  Object.values(state.functions).forEach((fn) => {
    const name = (fn.name || '').trim().toLowerCase();
    if (!name) {return;}
    if (defNames.has(name)) {
      w.push(`${fn.id}: ${t.duplicateFunctionDef || 'Duplicate function definition name'}: "${fn.name}"`);
    } else {
      defNames.set(name, fn.id);
    }
  });

  return w;
}
