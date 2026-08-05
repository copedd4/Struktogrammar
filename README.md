# Struktogramm Editor PWA

An offline-capable, installable web app for drawing **Nassi–Shneiderman diagrams** (a.k.a. *Struktogramme*) — the block-based flowchart notation commonly used in German-speaking technical education to plan program logic before writing code.

Everything is rendered as SVG, runs entirely in the browser, and needs no backend or database. Diagrams are saved as local files (`.stkg`) or auto-saved to `localStorage`, and the whole app works offline once loaded (thanks to a Service Worker).

## Features

- **Block-based diagram editor** with the standard structogram block types:
  `Statement`, `If/Else`, `While`, `Do-While`, `For loop`, `Function call`, `Switch/Case`, `Terminator`, `Comment` (each has a `1`–`9` keyboard shortcut).
- **Nested functions** — a `Function call` block can jump into its own sub-diagram, with breadcrumb navigation back up the chain.
- **Undo / redo**, duplicate, delete, drag-free block picker, and a live validation panel (flags empty fields, duplicate function names, duplicate switch-case labels, etc.).
- **Zoom & fit-to-screen**, search/find within a diagram.
- **Themes**: Light, Dark, Eggshell White, Navy Blue Dark, Siemens.
- **Languages**: English and German (`en` / `de`), switchable at runtime.
- **Save / Open project files** (`.stkg`, plain JSON) using the native File System Access API where supported, with a classic file-input fallback for other browsers.
- **Export** the current diagram as **SVG**, **PNG**, or **PDF**.
- **Autosave** to `localStorage` plus a recovery snapshot, so a closed tab doesn't lose work.
- **Installable PWA** — works offline via a Service Worker (cache-first for the app shell) and prompts you to reload when a new version has been deployed.

## Tech stack

Deliberately dependency-free at runtime:

- **Vanilla JavaScript (ES Modules)** — no framework, no bundler, no build step required to run the app.
- **SVG** for rendering the diagrams directly (`js/svg-render.js`).
- **Service Worker + Web App Manifest** for PWA/offline support.
- **Vitest** for unit tests, **ESLint** + **Prettier** for linting/formatting, **TypeScript** (`tsc --noEmit`) purely for JSDoc-based type-checking — these are *dev-only* tools and are not needed to run the app itself.

## Project structure

```
struktogramm-pwa/
├── index.html              # App shell / DOM structure
├── styles.css               # All styling (incl. themes)
├── manifest.webmanifest     # PWA manifest
├── service-worker.js        # Offline cache-first service worker
├── icon*.png / icon.svg     # App icons
├── js/
│   ├── main.js               # Entry point: bootstraps state, DOM, SW registration
│   ├── constants.js          # Shared constants (block types, themes, languages, sizes)
│   ├── state.js              # Pure state helpers (no DOM) - safe to unit test
│   ├── store.js               # App state container / persistence
│   ├── layout.js              # Computes block positions/sizes for rendering
│   ├── svg-render.js          # Renders the computed layout to SVG
│   ├── validation.js          # Diagram validation rules
│   ├── export.js              # Save/Open .stkg, export to SVG/PNG/PDF
│   ├── events.js              # Render pipeline + all DOM event handlers
│   └── i18n.js                 # English/German translation strings
├── tests/                    # Vitest unit tests (mirrors js/ modules)
├── package.json
├── tsconfig.json
└── vitest.config.js
```

## Setup

### 1. Just want to run the app? (no Node.js required)

The app is plain static HTML/CSS/JS — you only need **any local web server**. It cannot be opened directly via `file://` in most browsers because ES modules and the Service Worker require it to be served over `http://` or `https://`.

Pick whichever is easiest for you:

**Option A — VS Code "Live Server" extension**
1. Open the `struktogramm-pwa` folder in VS Code.
2. Install the "Live Server" extension (by Ritwick Dey) if you don't have it.
3. Right-click `index.html` → **"Open with Live Server"**.
4. The app opens at something like `http://127.0.0.1:5500/`.

**Option B — Node.js `serve` (no project install needed)**
```bash
npx serve .
```
Then open the printed local URL (e.g. `http://localhost:3000`).

**Option C — Python (if you have it and no Node.js)**
```bash
python3 -m http.server 8080
```
Then open `http://localhost:8080`.

Any of these is enough to use the editor. The service worker will register on first load, after which the app also works offline.

### 2. Want to run tests / lint / typecheck? (Node.js required)

The dev tooling (Vitest, ESLint, Prettier, TypeScript) is listed in `package.json` and does need Node.js + npm installed.

```bash
# from inside struktogramm-pwa/
npm install          # installs devDependencies only - app itself has none

npm test              # run the unit test suite once (vitest run)
npm run test:watch    # run tests in watch mode
npm run test:ui       # run tests with the Vitest UI

npm run lint          # ESLint over js/ and tests/
npm run lint:fix      # ESLint with auto-fix

npm run format        # Prettier - write formatting
npm run format:check  # Prettier - check only, no writes

npm run typecheck      # tsc --noEmit (JSDoc type-checking, no compiled output)
```

Recommended Node.js version: any current LTS (18+) works fine — the project has no native/build dependencies.

## Quick usage guide

1. **Start a diagram.** On first load you get a blank canvas with a starter diagram. Use **New project** to reset, or **Open project** to load an existing `.stkg` file.
2. **Add blocks.** Use the block picker on the left (or press `1`–`9`) to insert a block type: Statement, If/Else, While, Do-While, For, Function call, Switch/Case, Terminator, or Comment.
3. **Edit a block.** Select a block on the canvas to edit its text/condition/expression in the **Properties** panel on the right.
4. **Structure your logic.** If/Else and loop blocks are containers — insert further blocks inside their branches to build nested logic, just like a flowchart drawn as nested boxes.
5. **Work with functions.** A **Function call** block references a named function. Defined functions show up in the **Functions** list in the left sidebar; open one to edit its own sub-diagram, and use the **breadcrumb** bar at the top of the canvas to navigate back out.
6. **Check your work.** The **Validation** panel (right sidebar) live-flags problems: empty statements/conditions, missing function names, or duplicate function/case names.
7. **Undo/redo, duplicate, delete** the selected block using the toolbar buttons (or their shortcuts, shown in the **Shortcuts** panel).
8. **Zoom & search.** Use the zoom controls to zoom in/out/reset/fit the diagram to the screen, and the search toggle to find text within the current diagram.
9. **Save your work.**
   - **Save project / Save project as** writes a `.stkg` file (plain JSON) — using the browser's native file picker if supported (Chrome/Edge), otherwise a normal download.
   - The app also **autosaves** to `localStorage` continuously, so refreshing the page won't lose unsaved work.
10. **Export for sharing.** Use **Save SVG**, **Save PNG**, or **Save PDF** to export the current diagram as an image/document for reports, slides, or printing.
11. **Switch language/theme** anytime via the dropdowns in the control strip (English/German; Light, Dark, Eggshell White, Navy Blue Dark, Siemens).
12. **Install as an app (optional).** Once served over http(s), most browsers let you "Install" the PWA from the address bar or browser menu, so it opens like a native app and works fully offline afterward.

## Notes & limitations

- The native file save/open dialogs (`showOpenFilePicker`/`showSaveFilePicker`) are only available in Chromium-based browsers (Chrome, Edge). Other browsers automatically fall back to a standard file input / download.
- All data stays local to your browser — nothing is sent to a server. Clearing site data/`localStorage` will remove the autosave and recovery snapshot (but not any `.stkg` files you've already saved to disk).
- There is no build step for production use — deploying the app is just hosting the static files (e.g. GitHub Pages) over https, which is also required for the Service Worker/PWA install prompt to work.
