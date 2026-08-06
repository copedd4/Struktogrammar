# Strukto — Interactive Struktogramm Editor

A browser-based editor for **Nassi–Shneiderman diagrams** (Struktogramme) built with TanStack Start, React, TypeScript, and Tailwind CSS. Design, edit, and export structured program diagrams with drag-and-drop blocks, collapsible function calls, multiple themes, and full German/English language support.

![Strukto editor screenshot](https://id-preview--8ae99dd9-5b7a-45f2-9be2-4d198baf1e9d.lovable.app/og-image.png)

## Features

- **Block-based editing** — Insert Statement, If/Else, While, Do-While, For, Switch-Case, Function/Method, Break/Return/Continue, and Comment blocks.
- **Drag & drop** — Drag blocks from the sidebar palette or move existing blocks around the diagram.
- **Inline function expansion** — Double-click a function block to open it in a modal, or expand it directly inside the main diagram.
- **Recursive protection** — Prevents infinite recursion when expanding function calls.
- **Theming** — Switch between Light, Dark, Eggshell White, Navy Blue Dark, and Siemens themes.
- **Undo/redo** — Full history stack with 100 levels of undo.
- **Copy/paste/duplicate** — Duplicate blocks quickly with `Ctrl/Cmd + D`.
- **Zoom & pan** — Zoom with `Ctrl/Cmd + mouse wheel`, pan by middle-clicking or holding Space and dragging.
- **Collapsible blocks** — Fold loops and expanded function calls to keep large diagrams readable.
- **Autosave** — Work is automatically saved to `localStorage`.
- **File handling** — Save and open native `.stkg` JSON files using the File System Access API (where supported), with fallback downloads.
- **Export** — Export diagrams as PNG, SVG, or PDF.
- **Multilingual** — Switch between English and German.
- **Keyboard shortcuts** — Speed up diagramming with one-key block insertion.

## Tech Stack

- [TanStack Start](https://tanstack.com/start) — full-stack React framework
- [React 19](https://react.dev) — UI library
- [TypeScript](https://www.typescriptlang.org) — type-safe code
- [Tailwind CSS](https://tailwindcss.com) — styling
- [Lucide React](https://lucide.dev) — icons
- [html-to-image](https://github.com/bubkoo/html-to-image) & [jsPDF](https://github.com/parallax/jsPDF) — export rendering

## Prerequisites

- [Node.js](https://nodejs.org) 18 or later (LTS recommended)
- [npm](https://www.npmjs.com) (or [bun](https://bun.sh), [pnpm](https://pnpm.io), or [yarn](https://yarnpkg.com))

This project is configured to use **Bun** by default (`bunfig.toml` is included). You can use npm instead if you prefer.

## Installation

1. Clone the repository:

   ```sh
   git clone <repository-url>
   cd <repository-name>
   ```

2. Install dependencies:

   ```sh
   # Using bun (recommended)
   bun install

   # Using npm
   npm install
   ```

## Development

Start the local development server:

```sh
# Using bun
bun run dev

# Using npm
npm run dev
```

The app will be available at `http://localhost:8080`. The server supports hot module replacement (HMR), so changes update automatically in the browser.

## Build for Production

```sh
# Using bun
bun run build

# Using npm
npm run build
```

The production build is output to the `dist/` directory and can be deployed to any static or edge host.

## Quick Guide

### Creating a Diagram

1. Open the app in your browser.
2. The main function block is already shown on the canvas.
3. Click any block in the left sidebar to insert it after the currently selected block, or drag a block from the sidebar onto the canvas.

### Inserting Blocks

- Select a block in the diagram, then click a sidebar block to insert after it.
- Insert blocks directly with keyboard shortcuts:
  - `S` — Statement
  - `I` — If/Else
  - `W` — While
  - `D` — Do-While
  - `F` — For
  - `C` — Switch-Case
  - `M` — Function/Method
  - `B` — Break/Return/Continue
  - `K` — Comment

### Editing Text

- Click any block text to edit it inline.
- Textareas auto-resize as you type.

### Working with Functions

- **Create a function** — Click "New function" in the left sidebar.
- **Rename a function** — Double-click the function name in the sidebar.
- **Open a function** — Double-click a function call block to open it in a floating panel.
- **Expand inline** — Click the chevron on the left side of a function call block to show its diagram inside the main diagram.
- **Drag a function in** — Drag a function name from the sidebar onto the canvas to insert an expanded function call.

Function names must be unique across the entire project. Deleting a function call gives you the option to keep the function definition or remove it entirely.

### Switch-Case Blocks

- Switch blocks start with three named cases plus a default case.
- Click the `+` gap between cases to add a new case.
- Delete any named case except the default case.

### Navigation

- **Zoom** — Hold `Ctrl`/`Cmd` and scroll, or use the zoom buttons in the top bar.
- **Pan** — Middle-click and drag, or hold Space and drag.
- **Reset view** — Click the maximize button in the top bar.

### Files and Export

- **Save** — `File → Save` (uses the native File System Access API when available, otherwise downloads the file).
- **Save as** — `File → Save as`.
- **Open** — `File → Open`.
- **Export** — Choose `PNG`, `SVG`, or `PDF` from the File menu. Toggle between exporting the current view or the full call tree.

### Keyboard Shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl/Cmd + Z` | Undo |
| `Ctrl/Cmd + Shift + Z` | Redo |
| `Ctrl/Cmd + Y` | Redo |
| `Ctrl/Cmd + C` | Copy selected block |
| `Ctrl/Cmd + V` | Paste copied block |
| `Ctrl/Cmd + D` | Duplicate selected block |
| `Delete` / `Backspace` | Delete selected block |
| `Escape` | Deselect |

### Themes and Language

- Switch themes with the palette icon in the top bar.
- Switch between English and German with the language button (`EN` / `DE`).

## Project Structure

```text
src/
├── components/strukto/   # Editor components (Canvas, Diagram, DiagramSurface, etc.)
├── lib/strukto/            # State, model, operations, i18n, themes, file I/O, export
├── routes/                 # TanStack Start routes
├── routes/__root.tsx       # Root layout
├── routes/index.tsx        # Main editor page
└── styles.css              # Global styles and theme tokens
```

## File Format

Projects are saved as `.stkg` files — JSON documents containing the diagram structure, function definitions, and metadata. The format is portable and can be opened across any browser that supports the editor.

## License

This project is open source and available under the [MIT License](LICENSE).

---

Built with [Lovable](https://lovable.dev) and synced to GitHub for two-way collaboration.

## Desktop app (Tauri, fully offline)

The editor is 100% client-side, so it can be shipped as a native desktop app with no server and no network access.

### Files involved

| Path | Purpose |
| --- | --- |
| `desktop/index.html`, `desktop/main.tsx` | Standalone SPA entry (no SSR, no router) |
| `vite.desktop.config.ts` | Static build that inlines JS + CSS into **one** HTML file |
| `src-tauri/` | Tauri v2 shell (Rust), config, capabilities |

### Prerequisites

- Node.js 20+ (or Bun) and project deps installed: `bun install`
- Rust toolchain: https://rustup.rs
- Platform deps: see https://tauri.app/start/prerequisites (Windows: WebView2 + MSVC build tools; Linux: `libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, `librsvg2-dev`, `patchelf`; macOS: Xcode CLT)
- App icons (one time):
  ```bash
  bunx tauri icon path/to/icon.png   # writes src-tauri/icons/
  ```

### Commands

```bash
bun install             # required once — installs vite & the tauri CLI
bun run desktop:build   # -> desktop/dist/index.html  (single self-contained file)
bun run tauri:dev       # run the desktop app in dev
bun run tauri:build     # produce installers/binaries in src-tauri/target/release/bundle
```

> `bun: command not found: vite` simply means dependencies were never installed in
> that folder — run `bun install` (or `npm install`) first.

`desktop/dist/index.html` alone is already a working offline app — you can double-click it in any browser. `tauri build` wraps that same file into a native executable.

### Notes

- Saving/opening `.stkg` files uses the File System Access API in browsers; inside the Tauri WebView the download/file-input fallback is used, and the `dialog` + `fs` plugins are already enabled if you want to wire native dialogs later.
- Everything (themes, autosave, PNG/SVG/PDF export) works without a network connection.
