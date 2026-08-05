# Structo Canvas

Build a interactive Struktogramm (Nassi–Shneiderman diagram) editor, similar in spirit to app.strukto.io.

1. Block types The editor must support these blocks, each insertable via drag-and-drop or a block-picker menu:

Statement (a single processing step)

If / Else (selection, two branches)

While-Do (pre-test loop — condition checked before body executes)

Do-While (post-test loop — condition checked after body executes)

For-loop (counted iteration, distinct from While-Do/Do-While)

Function/Method block (a named, callable sub-structogram)

Switch-Case

Break / Return / Continue (a compact terminator statement usable inside loops and switch-cases)

Comment/Annotation (a non-executable note that can attach to any block or float freely on the canvas)

2. Switch-Case block behavior

On insertion, the block starts with exactly 3 named cases (A, B, C) plus 1 Default case, matching C-style switch layout.

The user can insert additional cases by hovering in the gap between any two existing regular cases, or between the last regular case and the Default case — a "+" affordance should appear in that gap.

Default must always remain the rightmost case, regardless of how many cases are added or reordered.

Cases must be renameable and deletable (except Default, which can be relabeled but not removed).

3. Interactivity — nested function structograms

Placing a Function/Method block in a diagram creates a reference to its own independent sub-structogram.

Double-clicking (or an explicit "open" action on) a Function block opens that function's structogram in a modal/pop-up window layered above the main canvas — not a page navigation.

The pop-up must be closable (returning to the parent diagram) without losing edits, and re-openable at any time.

Support recursive or repeated calls safely: opening the same function twice should show the same underlying data (single source of truth), and the app must prevent infinite pop-up nesting if a function calls itself.

Deleting a Function block must prompt a warning if its underlying sub-structogram has content, rather than silently destroying it; offer to keep the definition as an orphaned, recoverable function.

4. Theming A VS Code-style theme switcher with live preview, offering at minimum:

Light — black/white/grey base, subtle accent color

Dark — dark grey/black base, light text, tasteful accent

Eggshell White — soft off-white background with modern pastel accents

Navy Blue Dark — VS Code "Dark+"-style navy background with muted syntax-like accents

Siemens — Siemens brand petrol/teal and dark navy, matching Siemens corporate identity Themes must restyle the entire UI (canvas, blocks, menus, pop-ups) consistently, persist between sessions, and maintain WCAG AA text/border contrast in every theme, including the pastel and dark variants.

5. Editing quality-of-life

Undo/redo for every editing action, from day one (not a later add-on).

Copy/paste and duplicate for individual blocks and whole branches, including across the main diagram and nested function pop-ups.

Zoom and pan on the canvas for large diagrams.

Collapsible/foldable blocks — any If/Else, loop, Switch-Case, or Function body can be collapsed to a single line to save vertical space, like code folding.

Keyboard shortcuts for block insertion, navigation, undo/redo, and copy/paste.

Autosave and crash recovery — in-progress edits must survive an accidental browser/tab close or crash.

Basic validation guardrails: warn (don't silently allow) on empty condition/statement text, especially before export.

6. File handling

Native project format: a custom JSON-based file type (e.g. .stkg) storing the full diagram structure — including all nested function structograms — so a project can be closed and reopened later for continued editing, the same way a .docx or .pptx file works. Reopening must restore 100% of the editable structure, not a flattened image.

Use the File System Access API (Chrome/Edge) for real Open/Save/Save As behavior where supported, with a download/upload fallback for other browsers.

Export formats: PNG or JPEG (whichever is simpler to implement reliably) for a static image of the current view, plus SVG (near-free if rendering to canvas/DOM already) for crisp vector output, and PDF for easy sharing/printing.

For nested diagrams, explicitly decide and document whether an export captures only the currently open view or the full call tree flattened into one document — make this a user-selectable option if feasible.

7. Language Support German and English UI from the start (structograms are widely used in German-speaking technical/vocational training), with a language switcher rather than a hardcoded locale.

If you have any follow up questions ask them. If youre not shure about something ask.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/8ae99dd9-5b7a-45f2-9be2-4d198baf1e9d).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
