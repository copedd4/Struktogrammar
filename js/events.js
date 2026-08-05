// @ts-nocheck
// ── Events & render pipeline ──────────────────────────────────────────────────
// Owns the full render pipeline and all DOM event handlers.
// Imported and called once by main.js.

import { BLOCK_LIBRARY, SVG_NS } from './constants.js';
import { tr } from './i18n.js';
import {
  escapeHtml, normalizeState, defaultState, deepClone,
  flattenBlocks, rekeyBlockTree,
} from './state.js';
import { createContainerRef, layoutStack, findBlock, resolveContainer } from './layout.js';
import {
  renderLayoutToSvg, svgRect, ensureFunctionDefinition,
} from './svg-render.js';
import { validateProject } from './validation.js';
import {
  openProject, openFromFileInput, saveProject,
  exportSvg, exportPng, exportPdf,
} from './export.js';

// ── Modal helpers ─────────────────────────────────────────────────────────────

/**
 * Show a generic modal dialog.
 *
 * @param {HTMLElement} modalHost
 * @param {string}      title
 * @param {string}      bodyHtml   - Inner HTML for the modal body.
 * @param {Array<{label:string, value:string, primary?:boolean}>} buttons
 * @returns {Promise<string>}  Resolves with the value of the clicked button.
 */
function showModal(modalHost, title, bodyHtml, buttons) {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');
    backdrop.setAttribute('aria-label', title);

    const modal = document.createElement('div');
    modal.className = 'modal';

    const header = document.createElement('div');
    header.className = 'modal-header';
    header.innerHTML = `<strong>${escapeHtml(title)}</strong>`;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'small';
    closeBtn.textContent = '✕';
    closeBtn.setAttribute('aria-label', 'Close dialog');
    closeBtn.addEventListener('click', () => { backdrop.remove(); resolve('cancel'); });
    header.append(closeBtn);

    const body = document.createElement('div');
    body.className = 'modal-body';
    body.innerHTML = bodyHtml;

    const footer = document.createElement('div');
    footer.className = 'modal-footer';
    footer.style.cssText = 'display:flex;gap:0.5rem;justify-content:flex-end;padding:0.75rem 1rem;border-top:1px solid var(--border)';

    buttons.forEach(({ label, value, primary }) => {
      const btn = document.createElement('button');
      btn.textContent = label;
      if (primary) {btn.style.background = 'var(--accent)';}
      if (primary) {btn.style.color = '#fff';}
      btn.addEventListener('click', () => { backdrop.remove(); resolve(value); });
      footer.append(btn);
    });

    modal.append(header, body, footer);
    backdrop.append(modal);
    modalHost.append(backdrop);

    // Focus the first button for keyboard accessibility.
    requestAnimationFrame(() => { footer.querySelector('button')?.focus(); });

    // Escape key closes.
    const onKey = (e) => {
      if (e.key === 'Escape') { backdrop.remove(); resolve('cancel'); document.removeEventListener('keydown', onKey); }
    };
    document.addEventListener('keydown', onKey);
  });
}

/**
 * Show a brief toast notification.
 *
 * @param {string} msg
 * @param {number} [duration=3000]
 */
function showToast(msg, duration = 3000) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  t.setAttribute('role', 'status');
  t.setAttribute('aria-live', 'polite');
  document.body.append(t);
  requestAnimationFrame(() => { t.classList.add('toast-visible'); });
  setTimeout(() => {
    t.classList.remove('toast-visible');
    setTimeout(() => t.remove(), 300);
  }, duration);
}

// ── Render pipeline ───────────────────────────────────────────────────────────

export function buildRenderPipeline(store, el) {
  const lang = () => store.getState().settings.language;
  const t    = () => tr(lang());

  // afterMutation: persist + selective re-render.
  // Pass full=false to skip re-building the block picker / function list / shortcuts.
  function afterMutation(full = true) {
    store.persist(false, el, tr);
    if (full) {renderAll();}
    else { renderCanvas(); renderProperties(); renderValidation(); }
  }

  function renderAll() {
    applySettings();
    renderBlockPicker();
    renderFunctions();
    renderCanvas();
    renderProperties();
    renderValidation();
    renderShortcuts();
    renderContextMenu();
    store.persist(true, el, tr);
  }

  function applySettings() {
    const state = store.getState();
    el.languageSelect.value = state.settings.language;
    el.themeSelect.value    = state.settings.theme;
    document.body.className = `theme-${state.settings.theme}`;
    document.documentElement.lang = state.settings.language;
    document.querySelectorAll('[data-i18n]').forEach((n) => {
      n.textContent = t()[n.dataset.i18n] || n.dataset.i18n;
    });
    el.appTitle.textContent    = t().appTitle;
    el.appSubtitle.textContent = t().appSubtitle;
    setActionLabels();
  }

  function setActionLabels() {
    const map = {
      'new-project':        t().newProject,
      'open-project':       t().openProject,
      'save-project':       t().saveProject,
      'save-as-project':    t().saveAsProject,
      'export-svg':         t().saveSvg,
      'export-png':         t().savePng,
      'export-pdf':         t().savePdf,
      'undo':               t().undo,
      'redo':               t().redo,
      'duplicate':          t().duplicate,
      'delete':             t().delete,
      'zoom-in':            t().zoomIn,
      'zoom-out':           t().zoomOut,
      'zoom-reset':         t().zoomReset,
      'zoom-fit':           t().zoomFit,
      'validate':           t().validateAction,
      'toggle-block-picker': t().toggleBlockPicker,
      'search-toggle':      t().searchToggle,
    };
    document.querySelectorAll('[data-action]').forEach((b) => {
      const label = map[b.dataset.action];
      if (label) {b.textContent = label;}
      // Keep aria-label in sync.
      if (label) {b.setAttribute('aria-label', label);}
    });
  }

  function renderBlockPicker() {
    el.blockPicker.innerHTML = '';
    const hint = document.createElement('div');
    hint.className = 'notice';
    hint.style.fontSize = '0.82rem';
    hint.style.marginBottom = '0.35rem';
    hint.textContent = t().dragHint;
    el.blockPicker.append(hint);

    BLOCK_LIBRARY.forEach((block) => {
      const btn = document.createElement('button');
      btn.className = 'block-picker-item';
      btn.draggable = true;
      btn.dataset.createBlockType = block.type;
      btn.setAttribute('role', 'button');
      btn.setAttribute('aria-label', `${t().blockTypes[block.type]} (${block.shortcut})`);
      btn.innerHTML = `<strong>${escapeHtml(t().blockTypes[block.type])}</strong><small>${block.shortcut}</small>`;

      // HTML5 DnD
      btn.addEventListener('dragstart', (e) => {
        store.dragBlockType = block.type;
        btn.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData('text/plain', block.type);
      });
      btn.addEventListener('dragend', () => {
        store.dragBlockType = null;
        btn.classList.remove('dragging');
      });

      // Touch / pointer-event DnD fallback
      _bindTouchDragSource(btn, () => block.type, null, store);

      el.blockPicker.append(btn);
    });
  }

  function renderFunctions() {
    el.functionList.innerHTML = '';
    const fns = Object.values(store.getState().functions);
    if (!fns.length) {
      el.functionList.innerHTML = '<div class="notice">0</div>';
      return;
    }
    fns.forEach((fn) => {
      const btn = document.createElement('button');
      btn.className = 'block-picker-item';
      btn.dataset.openFunctionId = fn.id;
      btn.setAttribute('aria-label', fn.name);
      btn.innerHTML = `<strong>${escapeHtml(fn.name)}</strong>`;
      el.functionList.append(btn);
    });
  }

  // ── Canvas width helper ────────────────────────────────────────────────────

  function getCanvasWidth() {
    // Use the viewport's client width, fall back to 1040.
    const vp = el.canvasViewport;
    if (vp) {
      const w = vp.clientWidth - 40; // subtract padding
      if (w > 200) {return w;}
    }
    return 1040;
  }

  function renderCanvas() {
    el.canvasContent.style.transform = `scale(${store.zoom})`;
    el.canvasContent.innerHTML = '';
    renderBreadcrumb();

    const state    = store.getState();
    const rootId   = state.rootDiagramId;
    const blocks   = state.diagrams[rootId].blocks;
    const cRef     = createContainerRef({ diagramId: rootId, kind: 'diagram' });
    const canvasW  = getCanvasWidth();
    const layout   = layoutStack(blocks, cRef, 0, 0, canvasW, store);

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class',   'diagram-svg');
    svg.setAttribute('viewBox', `0 0 ${layout.width} ${layout.height}`);
    svg.setAttribute('width',   layout.width);
    svg.setAttribute('height',  layout.height);
    svg.setAttribute('role',    'img');
    svg.setAttribute('aria-label', 'Struktogramm diagram');
    svg.append(svgRect(0, 0, layout.width, layout.height, 'svg-diagram-frame'));
    renderLayoutToSvg(svg, layout, store, afterMutation);
    el.canvasContent.append(svg);

    let statusText = t().noSelection;
    if (store.selectedId) {
      const found = findBlock(store.selectedId, state);
      if (found) {
        const childCount = flattenBlocks([found.block]).length - 1;
        statusText = `${t().selected}: ${t().blockTypes[found.block.type] || found.block.type}`;
        if (childCount > 0) {
          statusText += ` (+ ${childCount} ${childCount === 1 ? 'child' : 'children'})`;
        }
      }
    }
    el.selectionStatus.textContent = statusText;
  }

  // ── Breadcrumb ─────────────────────────────────────────────────────────────

  /**
   * The breadcrumb stack is an array of { label, diagramId } entries.
   * store.breadcrumbStack is initialised in main.js (or lazily here).
   */
  function renderBreadcrumb() {
    if (!store.breadcrumbStack) {store.breadcrumbStack = [];}
    el.breadcrumb.innerHTML = '';

    const rootBtn = document.createElement('button');
    rootBtn.className = 'crumb';
    rootBtn.textContent = t().rootDiagram;
    rootBtn.setAttribute('aria-label', t().rootDiagram);
    rootBtn.addEventListener('click', () => {
      store.breadcrumbStack = [];
      store.getState().rootDiagramId = store._rootDiagramId || store.getState().rootDiagramId;
      renderCanvas();
    });
    el.breadcrumb.append(rootBtn);

    store.breadcrumbStack.forEach((crumb, i) => {
      const sep = document.createElement('span');
      sep.textContent = '›';
      sep.setAttribute('aria-hidden', 'true');
      el.breadcrumb.append(sep);

      const btn = document.createElement('button');
      btn.className = 'crumb';
      btn.textContent = crumb.label;
      btn.setAttribute('aria-label', crumb.label);
      btn.addEventListener('click', () => {
        // Navigate back to this crumb level.
        store.breadcrumbStack = store.breadcrumbStack.slice(0, i + 1);
        store.getState().rootDiagramId = crumb.diagramId;
        renderCanvas();
      });
      el.breadcrumb.append(btn);
    });
  }

  function renderProperties() {
    const found = store.selectedId ? findBlock(store.selectedId, store.getState()) : null;
    const block = found ? found.block : null;
    if (!block) {
      el.propertiesPanel.innerHTML = `<div class="notice">${escapeHtml(t().noSelection)}</div>`;
      return;
    }
    // Show comment badge if block has a comment.
    const commentHtml = block.comment
      ? `<div class="notice" style="margin-top:0.5rem"><strong>${escapeHtml(t().note)}:</strong> ${escapeHtml(block.comment)}</div>`
      : '';
    el.propertiesPanel.innerHTML =
      `<div class="notice"><strong>${escapeHtml(t().blockTypes[block.type] || block.type)}</strong></div>${commentHtml}`;
  }

  function renderValidation() {
    const w = validateProject(store.getState());
    el.validationPanel.innerHTML = w.length
      ? w.map((x) => `<div class="validation-item warn">${escapeHtml(x)}</div>`).join('')
      : `<div class="validation-item">${escapeHtml(t().validationOk)}</div>`;
  }

  function renderShortcuts() {
    el.shortcutPanel.innerHTML = t().shortcutHelp
      .map((x) => `<div class="shortcut-item">${escapeHtml(x)}</div>`)
      .join('');
  }

  function renderContextMenu() {
    document.querySelectorAll('.context-menu').forEach((n) => { n.remove(); });
    if (!store.contextMenu) {return;}
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.setAttribute('role', 'menu');
    menu.style.left = `${store.contextMenu.x}px`;
    menu.style.top  = `${store.contextMenu.y}px`;
    menu.innerHTML = store.contextMenu.items.map((item) =>
      `<button role="menuitem" data-context-action="${item.action}" data-context-target="${item.target || ''}" aria-label="${escapeHtml(item.label)}">${escapeHtml(item.label)}</button>`,
    ).join('');
    document.body.append(menu);
  }

  // ── Search / Find in diagram ───────────────────────────────────────────────

  function renderSearchBar() {
    const existing = document.getElementById('searchBar');
    if (existing) { existing.remove(); return; }

    const bar = document.createElement('div');
    bar.id = 'searchBar';
    bar.className = 'search-bar';
    bar.setAttribute('role', 'search');
    bar.innerHTML = `
      <input id="searchInput" type="search" placeholder="${escapeHtml(t().searchPlaceholder || 'Search blocks…')}"
             aria-label="${escapeHtml(t().searchPlaceholder || 'Search blocks')}" />
      <span id="searchCount" aria-live="polite"></span>
      <button id="searchPrev" aria-label="Previous match">&#8593;</button>
      <button id="searchNext" aria-label="Next match">&#8595;</button>
      <button id="searchClose" aria-label="Close search">&#10005;</button>
    `;
    el.canvasViewport.parentElement.insertBefore(bar, el.canvasViewport);

    let matches = [];
    let matchIdx = 0;

    const input = bar.querySelector('#searchInput');
    const count = bar.querySelector('#searchCount');

    function doSearch() {
      const query = input.value.trim().toLowerCase();
      // Remove previous highlights.
      document.querySelectorAll('.search-match').forEach((n) => n.classList.remove('search-match', 'search-match-active'));
      matches = [];
      if (!query) { count.textContent = ''; return; }

      const state = store.getState();
      Object.values(state.diagrams).forEach((d) => {
        flattenBlocks(d.blocks).forEach((b) => {
          const text = [b.text, b.condition, b.functionName, b.expression, b.init, b.step, b.comment]
            .filter(Boolean).join(' ').toLowerCase();
          if (text.includes(query)) {matches.push(b.id);}
        });
      });

      count.textContent = matches.length ? `${matchIdx + 1}/${matches.length}` : '0';
      if (matches.length) {
        matchIdx = 0;
        highlightMatch();
      }
    }

    function highlightMatch() {
      document.querySelectorAll('.search-match').forEach((n) => n.classList.remove('search-match', 'search-match-active'));
      if (!matches.length) {return;}
      const id = matches[matchIdx];
      const el2 = document.querySelector(`[data-block-id="${id}"]`);
      if (el2) {
        el2.classList.add('search-match', 'search-match-active');
        el2.scrollIntoView({ behavior: 'smooth', block: 'center' });
        store.selectedId = id;
        renderProperties();
      }
      count.textContent = `${matchIdx + 1}/${matches.length}`;
    }

    input.addEventListener('input', doSearch);
    bar.querySelector('#searchPrev').addEventListener('click', () => {
      if (!matches.length) {return;}
      matchIdx = (matchIdx - 1 + matches.length) % matches.length;
      highlightMatch();
    });
    bar.querySelector('#searchNext').addEventListener('click', () => {
      if (!matches.length) {return;}
      matchIdx = (matchIdx + 1) % matches.length;
      highlightMatch();
    });
    bar.querySelector('#searchClose').addEventListener('click', () => {
      document.querySelectorAll('.search-match').forEach((n) => n.classList.remove('search-match', 'search-match-active'));
      bar.remove();
    });

    input.focus();
  }

  // ── Event handlers ──────────────────────────────────────────────────────────

  function handleClick(event) {
    if (store.contextMenu && !event.target.closest('.context-menu')) {
      store.contextMenu = null;
      renderContextMenu();
    }

    const action = event.target.dataset.action;
    if (action) {return handleToolbarAction(action);}

    if (event.target.dataset.openFunctionId) {
      return toggleFunctionExpand(event.target.dataset.openFunctionId);
    }
    if (event.target.dataset.contextAction) {
      return runContextAction(
        event.target.dataset.contextAction,
        event.target.dataset.contextTarget,
      );
    }

    const blockEl = event.target.closest('[data-block-id]');
    if (blockEl) {
      store.selectedId = blockEl.dataset.blockId;
      renderCanvas();
      renderProperties();
      store.persist(true, el, tr);
    }
  }

  function handleChange(event) {
    if (event.target === el.languageSelect) {
      store.dispatch((s) => { s.settings.language = event.target.value; return s; });
      return afterMutation(false);
    }
    if (event.target === el.themeSelect) {
      store.dispatch((s) => { s.settings.theme = event.target.value; return s; });
      return afterMutation();
    }
  }

  function handleDoubleClick(event) {
    const blockEl = event.target.closest('[data-block-id]');
    if (!blockEl) {return;}
    const found = findBlock(blockEl.dataset.blockId, store.getState());
    if (found && found.block.type === 'functionCall') {
      toggleFunctionExpand(found.block.id);
    }
  }

  function handleContextMenu(event) {
    const blockEl = event.target.closest('[data-block-id]');
    if (!blockEl) {return;}
    event.preventDefault();
    const found = findBlock(blockEl.dataset.blockId, store.getState());
    const block = found ? found.block : null;
    if (!block) {return;}
    store.selectedId  = block.id;
    store.contextMenu = {
      x: event.pageX, y: event.pageY,
      items: [
        ...(block.type === 'functionCall'
          ? [{ action: 'open', target: block.id, label: t().contextOpen }]
          : []),
        { action: 'duplicate', target: block.id, label: t().contextDuplicate },
        { action: 'comment',   target: block.id, label: t().contextComment },
        { action: 'delete',    target: block.id, label: t().contextDelete },
      ],
    };
    renderContextMenu();
  }

  // ── Keyboard navigation ────────────────────────────────────────────────────

  function handleKeydown(event) {
    const tag = event.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {return;}
    const mod = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();

    if (mod && key === 'z') { event.preventDefault(); return undo(); }
    if (mod && key === 'y') { event.preventDefault(); return redo(); }
    if (mod && key === 'c') { if (store.selectedId) {copySelection();} return; }
    if (mod && key === 'v') {return pasteSelection();}
    if (mod && key === 'f') { event.preventDefault(); renderSearchBar(); return; }
    if (event.key === 'Delete' && store.selectedId) {return deleteBlockWithConfirm(store.selectedId);}
    if (event.key === 'Escape') { store.contextMenu = null; return renderAll(); }

    // Arrow-key navigation between blocks.
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault();
      return navigateBlocks(event.key);
    }

    // Enter / Space on selected block: open insert menu or edit.
    if ((event.key === 'Enter' || event.key === ' ') && store.selectedId) {
      event.preventDefault();
      const blockEl = document.querySelector(`[data-block-id="${store.selectedId}"]`);
      if (blockEl) {
        const input = blockEl.querySelector('input, textarea');
        if (input) {input.focus();}
      }
      return;
    }
  }

  /**
   * Navigate selection using arrow keys.
   * ArrowUp/Down: move to prev/next sibling.
   * ArrowRight: enter first child container (if any).
   * ArrowLeft: go to parent block.
   */
  function navigateBlocks(key) {
    const state = store.getState();
    if (!store.selectedId) {
      // Select first block in root diagram.
      const blocks = state.diagrams[state.rootDiagramId].blocks;
      if (blocks.length) { store.selectedId = blocks[0].id; renderCanvas(); renderProperties(); }
      return;
    }
    const found = findBlock(store.selectedId, state);
    if (!found) {return;}
    const siblings = resolveContainer(found.containerRef, state);
    if (!siblings) {return;}

    if (key === 'ArrowDown') {
      const next = siblings.blocks[found.index + 1];
      if (next) { store.selectedId = next.id; renderCanvas(); renderProperties(); }
    } else if (key === 'ArrowUp') {
      const prev = siblings.blocks[found.index - 1];
      if (prev) { store.selectedId = prev.id; renderCanvas(); renderProperties(); }
    } else if (key === 'ArrowLeft') {
      if (found.parent) { store.selectedId = found.parent.id; renderCanvas(); renderProperties(); }
    } else if (key === 'ArrowRight') {
      const b = found.block;
      let firstChild = null;
      if (b.type === 'ifElse' && b.thenBlocks?.length) {firstChild = b.thenBlocks[0];}
      else if ((b.type === 'whileDo' || b.type === 'doWhile' || b.type === 'forLoop') && b.body?.length) {firstChild = b.body[0];}
      else if (b.type === 'switchCase' && b.cases?.[0]?.blocks?.length) {firstChild = b.cases[0].blocks[0];}
      if (firstChild) { store.selectedId = firstChild.id; renderCanvas(); renderProperties(); }
    }
  }

  function handleWheel(event) {
    if (!event.ctrlKey) {return;}
    event.preventDefault();
    store.zoom += event.deltaY < 0 ? 0.1 : -0.1;
    store.zoom = Math.min(2.5, Math.max(0.4, store.zoom));
    renderCanvas();
  }

  // ── Fit-to-screen ──────────────────────────────────────────────────────────

  function fitToScreen() {
    const vp = el.canvasViewport;
    if (!vp) {return;}
    const svg = el.canvasContent.querySelector('svg');
    if (!svg) {return;}
    const svgW = parseFloat(svg.getAttribute('width'))  || 1040;
    const svgH = parseFloat(svg.getAttribute('height')) || 600;
    const vpW  = vp.clientWidth  - 40;
    const vpH  = vp.clientHeight - 40;
    const scaleX = vpW / svgW;
    const scaleY = vpH / svgH;
    store.zoom = Math.min(scaleX, scaleY, 2.5);
    store.zoom = Math.max(store.zoom, 0.1);
    renderCanvas();
  }

  // ── Toolbar actions ────────────────────────────────────────────────────────

  function handleToolbarAction(action) {
    switch (action) {
      case 'new-project':
        return confirmNewProject();
      case 'open-project':
        return openProject(store, el, afterMutation, (msg) => showModal(el.modalHost, 'Error', `<p>${escapeHtml(msg)}</p>`, [{ label: 'OK', value: 'ok', primary: true }]));
      case 'save-project':    return saveProject(false, store, el, () => store.persist(false, el, tr));
      case 'save-as-project': return saveProject(true,  store, el, () => store.persist(false, el, tr));
      case 'export-svg':      return exportSvg(store, getCanvasWidth());
      case 'export-png':      return exportPng(store, getCanvasWidth());
      case 'export-pdf':      return exportPdf(store, getCanvasWidth());
      case 'undo':            return undo();
      case 'redo':            return redo();
      case 'duplicate':       return store.selectedId ? duplicateBlock(store.selectedId) : null;
      case 'delete':          return store.selectedId ? deleteBlockWithConfirm(store.selectedId) : null;
      case 'zoom-in':         store.zoom = Math.min(2.5, store.zoom + 0.1); return renderCanvas();
      case 'zoom-out':        store.zoom = Math.max(0.1, store.zoom - 0.1); return renderCanvas();
      case 'zoom-reset':      store.zoom = 1; return renderCanvas();
      case 'zoom-fit':        return fitToScreen();
      case 'validate':        return renderValidation();
      case 'toggle-block-picker': {
        const isHidden = el.blockPicker.classList.toggle('hidden');
        const btn = document.querySelector('[data-action="toggle-block-picker"]');
        if (btn) {btn.setAttribute('aria-expanded', String(!isHidden));}
        return;
      }
      case 'search-toggle':   return renderSearchBar();
    }
  }

  function runContextAction(action, target) {
    store.contextMenu = null;
    renderContextMenu();
    if (action === 'open')      {return toggleFunctionExpand(target);}
    if (action === 'duplicate') {return duplicateBlock(target);}
    if (action === 'delete')    {return deleteBlockWithConfirm(target);}
    if (action === 'comment')   {return addCommentToBlock(target);}
  }

  // ── Confirmation dialogs ───────────────────────────────────────────────────

  async function confirmNewProject() {
    const answer = await showModal(
      el.modalHost,
      t().newProject,
      `<p>${escapeHtml(t().confirmNewProject || 'Discard current diagram and start fresh?')}</p>`,
      [
        { label: t().cancel || 'Cancel', value: 'cancel' },
        { label: t().newProject, value: 'ok', primary: true },
      ],
    );
    if (answer !== 'ok') {return;}
    store.snapshot();
    store.dispatch(() => normalizeState(defaultState()));
    store.selectedId = null;
    store.expandedFnBlocks = new Set();
    store.breadcrumbStack = [];
    afterMutation();
  }

  async function deleteBlockWithConfirm(blockId) {
    const found = findBlock(blockId, store.getState());
    if (!found) {return;}
    const label = t().blockTypes[found.block.type] || found.block.type;
    const answer = await showModal(
      el.modalHost,
      t().delete,
      `<p>${escapeHtml((t().confirmDelete || 'Delete this block?').replace('{type}', label))}</p>`,
      [
        { label: t().cancel || 'Cancel', value: 'cancel' },
        { label: t().delete, value: 'ok', primary: true },
      ],
    );
    if (answer !== 'ok') {return;}
    _doDeleteBlock(blockId);
    showToast(t().deletedUndo || 'Block deleted. Ctrl+Z to undo.');
  }

  function _doDeleteBlock(blockId) {
    const found = findBlock(blockId, store.getState());
    if (!found) {return;}
    store.snapshot();
    resolveContainer(found.containerRef, store.getState()).blocks.splice(found.index, 1);
    if (store.selectedId === blockId) {store.selectedId = null;}
    afterMutation();
  }

  // ── Comment modal ──────────────────────────────────────────────────────────

  async function addCommentToBlock(blockId) {
    const found = findBlock(blockId, store.getState());
    if (!found) {return;}
    const existing = found.block.comment || '';
    const bodyHtml = `
      <label style="display:block;margin-bottom:0.4rem">${escapeHtml(t().note)}:</label>
      <textarea id="commentTextarea" rows="4" style="width:100%;resize:vertical">${escapeHtml(existing)}</textarea>
    `;
    const answer = await showModal(
      el.modalHost,
      t().contextComment,
      bodyHtml,
      [
        { label: t().cancel || 'Cancel', value: 'cancel' },
        { label: 'OK', value: 'ok', primary: true },
      ],
    );
    if (answer !== 'ok') {return;}
    const textarea = document.getElementById('commentTextarea');
    const text = textarea ? textarea.value : '';
    store.snapshot();
    found.block.comment = text;
    afterMutation();
  }

  // ── Block operations ────────────────────────────────────────────────────────

  function undo() {
    if (store.undo()) {renderAll();}
  }

  function redo() {
    if (store.redo()) {renderAll();}
  }

  function copySelection() {
    const f = store.selectedId ? findBlock(store.selectedId, store.getState()) : null;
    if (f) {store.clipboard = deepClone(f.block);}
  }

  function pasteSelection() {
    if (!store.clipboard) {return;}
    store.snapshot();
    const clone = deepClone(store.clipboard);
    rekeyBlockTree(clone);
    const state = store.getState();
    state.diagrams[state.rootDiagramId].blocks.push(clone);
    store.selectedId = clone.id;
    afterMutation();
  }

  function duplicateBlock(blockId) {
    const found = findBlock(blockId, store.getState());
    if (!found) {return;}
    store.snapshot();
    const clone = deepClone(found.block);
    rekeyBlockTree(clone);
    resolveContainer(found.containerRef, store.getState()).blocks.splice(found.index + 1, 0, clone);
    store.selectedId = clone.id;
    afterMutation();
  }

  function toggleFunctionExpand(id) {
    let blockId = id;
    const state = store.getState();
    if (state.functions[id]) {
      const all = [];
      Object.values(state.diagrams).forEach((d) => { flattenBlocks(d.blocks, all); });
      const match = all.find((b) => b.type === 'functionCall' && b.functionId === id);
      if (match) {blockId = match.id;}
    }
    if (store.expandedFnBlocks.has(blockId)) {
      store.expandedFnBlocks.delete(blockId);
    } else {
      const found = findBlock(blockId, store.getState());
      if (found && found.block.type === 'functionCall') {
        ensureFunctionDefinition(found.block, store);
      }
      store.expandedFnBlocks.add(blockId);
    }
    renderCanvas();
  }

  // ── Touch / pointer-event DnD ─────────────────────────────────────────────

  /**
   * Bind pointer-event touch DnD on a draggable source element.
   * When a touch drag is detected we:
   *   1. Record the drag type on the store.
   *   2. Synthesise a visual ghost.
   *   3. On pointerup, hit-test the drop zone divs and fire their drop logic.
   *
   * @param {HTMLElement} el
   * @param {function():string} getType  - Returns block type string.
   * @param {string|null}       moveId   - If non-null, treat as a move drag.
   * @param {import('./store.js').Store} store
   */
  function _bindTouchDragSource(el, getType, moveId, store) {
    let ghost = null;
    let startX = 0, startY = 0;
    let dragging = false;

    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') {return;} // handled by HTML5 DnD
      startX = e.clientX; startY = e.clientY;
      dragging = false;
    }, { passive: true });

    el.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse') {return;}
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!dragging && Math.sqrt(dx * dx + dy * dy) > 8) {
        dragging = true;
        if (moveId) {
          store.dragMoveId    = moveId;
          store.dragBlockType = null;
        } else {
          store.dragBlockType = getType();
          store.dragMoveId    = null;
        }
        // Create ghost.
        ghost = document.createElement('div');
        ghost.className = 'touch-drag-ghost';
        ghost.textContent = getType();
        ghost.style.cssText = 'position:fixed;pointer-events:none;z-index:9999;padding:4px 10px;background:var(--accent);color:#fff;border-radius:8px;font-size:12px;opacity:0.85';
        document.body.append(ghost);
      }
      if (ghost) {
        ghost.style.left = `${e.clientX + 12}px`;
        ghost.style.top  = `${e.clientY + 12}px`;
      }
      // Highlight drop zones under the pointer.
      document.querySelectorAll('.insert-drop-div').forEach((div) => {
        const r = div.getBoundingClientRect();
        const over = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
        div.classList.toggle('drag-over-div', over);
      });
    }, { passive: true });

    el.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'mouse') {return;}
      if (ghost) { ghost.remove(); ghost = null; }
      if (!dragging) { store.dragBlockType = null; store.dragMoveId = null; return; }
      dragging = false;

      // Find drop zone under pointer.
      const target = document.elementFromPoint(e.clientX, e.clientY);
      const dropDiv = target?.closest('.insert-drop-div');
      if (dropDiv) {
        // Synthesise a drop event so the existing DnD handler fires.
        const dropEvent = new DragEvent('drop', { bubbles: true, cancelable: true });
        Object.defineProperty(dropEvent, 'dataTransfer', {
          value: {
            getData: () => store.dragBlockType || '',
            dropEffect: store.dragMoveId ? 'move' : 'copy',
          },
        });
        dropDiv.dispatchEvent(dropEvent);
      }
      document.querySelectorAll('.drag-over-div').forEach((d) => d.classList.remove('drag-over-div'));
      store.dragBlockType = null;
      store.dragMoveId    = null;
    }, { passive: true });
  }

  // ── Bind events ─────────────────────────────────────────────────────────────

  function bindGlobalEvents() {
    document.body.addEventListener('click',       handleClick);
    document.body.addEventListener('change',      handleChange);
    document.body.addEventListener('dblclick',    handleDoubleClick);
    document.body.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('keydown',          handleKeydown);
    el.fileInput.addEventListener('change',
      (e) => openFromFileInput(
        e, store, afterMutation,
        (msg) => showModal(el.modalHost, 'Error', `<p>${escapeHtml(msg)}</p>`, [{ label: 'OK', value: 'ok', primary: true }]),
      ));
    el.canvasViewport.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('beforeunload', () => {
      store.persist(true, el, tr);
    });

    // Resize observer: re-render canvas when viewport changes size.
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(() => { renderCanvas(); }).observe(el.canvasViewport);
    }
  }

  return { renderAll, applySettings, bindGlobalEvents };
}
