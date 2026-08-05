// ── Entry point ───────────────────────────────────────────────────────────────
// Bootstraps the application: reads saved state, wires up the Store,
// binds DOM elements, and hands off to the render/event pipeline.

import { STORAGE_KEY, THEMES, LANGUAGES } from './constants.js';
import { normalizeState, defaultState } from './state.js';
import { Store } from './store.js';
import { buildRenderPipeline } from './events.js';
import { tr } from './i18n.js';

// ── DOM element cache ─────────────────────────────────────────────────────────

/** @type {Record<string, HTMLElement>} */
const el = {};

function bindElements() {
  el.appTitle        = document.getElementById('appTitle');
  el.appSubtitle     = document.getElementById('appSubtitle');
  el.languageSelect  = document.getElementById('languageSelect');
  el.themeSelect     = document.getElementById('themeSelect');
  el.blockPicker     = document.getElementById('blockPicker');
  el.functionList    = document.getElementById('functionList');
  el.propertiesPanel = document.getElementById('propertiesPanel');
  el.validationPanel = document.getElementById('validationPanel');
  el.shortcutPanel   = document.getElementById('shortcutPanel');
  el.canvasContent   = document.getElementById('canvasContent');
  el.canvasViewport  = document.getElementById('canvasViewport');
  el.modalHost       = document.getElementById('modalHost');
  el.fileInput       = document.getElementById('fileInput');
  el.autosaveStatus  = document.getElementById('autosaveStatus');
  el.selectionStatus = document.getElementById('selectionStatus');
  el.breadcrumb      = document.getElementById('breadcrumb');

  LANGUAGES.forEach((lang) => {
    const o = document.createElement('option');
    o.value = lang.id;
    o.textContent = lang.label;
    el.languageSelect.append(o);
  });

  THEMES.forEach((theme) => {
    const o = document.createElement('option');
    o.value = theme.id;
    o.textContent = theme.label;
    el.themeSelect.append(o);
  });
}

// ── State bootstrap ───────────────────────────────────────────────────────────

function loadInitialState() {
  const raw =
    localStorage.getItem(STORAGE_KEY) ||
    localStorage.getItem('struktogramm-editor-state-v4') ||
    localStorage.getItem('struktogramm-editor-state-v3');

  if (raw) {
    try { return normalizeState(JSON.parse(raw)); } catch (_) { /* fall through */ }
  }
  return normalizeState(defaultState());
}

// ── Init ──────────────────────────────────────────────────────────────────────

function init() {
  bindElements();

  const store    = new Store(loadInitialState());
  const pipeline = buildRenderPipeline(store, el);

  pipeline.renderAll();
  pipeline.bindGlobalEvents();
  registerServiceWorker();
}

// ── Service-worker registration with update prompt ────────────────────────────

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {return;}
  try {
    const reg = await navigator.serviceWorker.register('./service-worker.js');

    reg.addEventListener('updatefound', () => {
      const newSW = reg.installing;
      if (!newSW) {return;}

      newSW.addEventListener('statechange', () => {
        // A new SW has installed and is waiting to activate.
        if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
          const lang = document.documentElement.lang || 'en';
          const t    = tr(lang);
          showUpdateToast(
            t.swUpdateAvailable || 'A new version is available.',
            t.swUpdateReload    || 'Reload',
            newSW,
          );
        }
      });
    });
  } catch (_) { /* silently ignore SW registration failures */ }
}

/**
 * Show a persistent toast prompting the user to reload for the new SW version.
 *
 * @param {string}      message
 * @param {string}      reloadLabel
 * @param {ServiceWorker} newSW
 */
function showUpdateToast(message, reloadLabel, newSW) {
  // Remove any existing update toast.
  document.getElementById('swUpdateToast')?.remove();

  const toast = document.createElement('div');
  toast.id = 'swUpdateToast';
  toast.className = 'toast toast-update toast-visible';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.style.cssText = [
    'position:fixed', 'bottom:1.5rem', 'right:1.5rem', 'z-index:9999',
    'background:var(--accent)', 'color:#fff',
    'padding:0.65rem 1rem', 'border-radius:12px',
    'display:flex', 'gap:0.75rem', 'align-items:center',
    'box-shadow:0 8px 24px rgba(0,0,0,0.25)',
  ].join(';');

  const span = document.createElement('span');
  span.textContent = message;

  const btn = document.createElement('button');
  btn.textContent = reloadLabel;
  btn.style.cssText = 'background:#fff;color:var(--accent);border:none;border-radius:8px;padding:0.3rem 0.7rem;cursor:pointer;font-weight:700';
  btn.addEventListener('click', () => {
    newSW.postMessage('SKIP_WAITING');
    // Reload once the new SW has taken control.
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload();
    }, { once: true });
  });

  toast.append(span, btn);
  document.body.append(toast);
}

document.addEventListener('DOMContentLoaded', init);
