/**
 * Draws diagrams straight from the document model (not from the editor DOM), so
 * exports contain no editor controls and can be written as real vector SVG.
 *
 * `layoutDiagrams` turns functions into drawing primitives; `toSvg` and
 * `drawToCanvas` render those primitives. Sizes mirror the editor's styling.
 */
import { DIAG_PAD, DIAG_TEXT_RATIO, ifHeaderLayout, switchHeaderLayout } from "./geometry";
import type { SNode, StruktoDoc, StruktoFunction } from "./types";

export interface RenderColors {
  canvas: string;
  block: string;
  head: string;
  line: string;
  text: string;
  muted: string;
  note: string;
  noteText: string;
}

export interface RenderLabels {
  yes: string;
  no: string;
  doLabel: string;
  whileLabel: string;
  missingFunction: string;
}

type FontKey = "sans" | "italic" | "mono" | "small" | "title";

export type Prim =
  | { t: "rect"; x: number; y: number; w: number; h: number; fill: string; stroke?: boolean }
  | { t: "line"; pts: Array<[number, number]> }
  | {
      t: "text";
      x: number;
      y: number;
      text: string;
      font: FontKey;
      color: string;
      anchor: "start" | "middle" | "end";
    };

export interface Drawing {
  width: number;
  height: number;
  prims: Prim[];
  /** y positions where a page may be cut without slicing through a block. */
  breaks: number[];
  /** Vertical extent of each function diagram, in drawing order. */
  surfaces: Array<{ y: number; h: number }>;
}

export const FONTS: Record<
  FontKey,
  { css: string; size: number; lh: number; family: string; weight?: number; italic?: boolean }
> = {
  sans: {
    css: "14px Inter, Arial, sans-serif",
    size: 14,
    lh: 19,
    family: "Inter, Arial, sans-serif",
  },
  italic: {
    css: "italic 14px Inter, Arial, sans-serif",
    size: 14,
    lh: 19,
    family: "Inter, Arial, sans-serif",
    italic: true,
  },
  mono: {
    css: "13px 'JetBrains Mono', Consolas, monospace",
    size: 13,
    lh: 18,
    family: "'JetBrains Mono', Consolas, monospace",
  },
  small: {
    css: "11px 'JetBrains Mono', Consolas, monospace",
    size: 11,
    lh: 14,
    family: "'JetBrains Mono', Consolas, monospace",
  },
  title: {
    css: "600 14px 'JetBrains Mono', Consolas, monospace",
    size: 14,
    lh: 19,
    family: "'JetBrains Mono', Consolas, monospace",
    weight: 600,
  },
};

const PX = 8; // horizontal text padding (px-2)
const PY = 4; // vertical text padding (py-1)
const TEXT_MAX = 544 - PX * 2; // editor text fields wrap at 34rem
const ROW_MIN = 28;
const EMPTY_H = 36;
const LOOP_INDENT = 20;
const CALL_BAR = 8;
const CASE_MIN = 144;
const SURFACE_MIN = 720;
const TITLE_H = 30;
const GAP = 32;
const MARGIN = 16;

/* ------------------------------ text measuring ----------------------------- */

let measureCtx: CanvasRenderingContext2D | null = null;
function textWidth(text: string, font: FontKey): number {
  measureCtx ??= document.createElement("canvas").getContext("2d");
  if (!measureCtx) return text.length * FONTS[font].size * 0.6;
  measureCtx.font = FONTS[font].css;
  return measureCtx.measureText(text).width;
}

/** Word-wrap like the editor's text fields (explicit newlines are kept). */
function wrap(text: string, font: FontKey, max = TEXT_MAX): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/(\s+)/)) {
      const next = line + word;
      if (line && textWidth(next.trimEnd(), font) > max) {
        out.push(line.trimEnd());
        line = word.trimStart();
      } else line = next;
    }
    out.push(line);
  }
  return out;
}

const widest = (lines: string[], font: FontKey) =>
  Math.max(0, ...lines.map((l) => textWidth(l, font)));

/* --------------------------------- layout --------------------------------- */

interface Ctx {
  doc: StruktoDoc;
  colors: RenderColors;
  labels: RenderLabels;
  prims: Prim[];
  /** inlined function chain, to stop infinite recursion */
  chain: string[];
}

const kindLabel = (n: SNode, labels: RenderLabels) =>
  n.kind === "for" ? "FOR" : labels.whileLabel.toUpperCase();

export function callLabel(doc: StruktoDoc, n: Extract<SNode, { kind: "call" }>, missing: string) {
  const def = doc.functions[n.funcId];
  if (!def) return missing;
  return n.args?.trim() ? `${def.name}(${n.args.trim()})` : def.name;
}

/** Minimum width a node needs. */
function minWidth(n: SNode, c: Ctx): number {
  switch (n.kind) {
    case "statement":
      return widest(wrap(n.text, "sans"), "sans") + PX * 2;
    case "comment":
      return widest(wrap(n.text, "italic"), "italic") + PX * 2 + 4;
    case "terminator":
      return (
        textWidth(n.variant.toUpperCase(), "small") +
        12 +
        PX * 2 +
        widest(wrap(n.text, "mono"), "mono") +
        PX
      );
    case "call": {
      const head =
        textWidth(callLabel(c.doc, n, c.labels.missingFunction), "mono") + PX * 2 + CALL_BAR * 2;
      const body = expandedBody(n, c);
      return Math.max(
        head,
        body ? seqMin(body, { ...c, chain: [...c.chain, n.funcId] }) + CALL_BAR : 0,
      );
    }
    case "if": {
      const header = Math.min(widest(wrap(n.cond, "mono"), "mono") + PX * 2, 420) / DIAG_TEXT_RATIO;
      if (n.collapsed) return Math.max(header, 120);
      return Math.max(header, seqMin(n.then, c) + seqMin(n.else, c));
    }
    case "while":
    case "for":
    case "dowhile": {
      const head =
        textWidth(kindLabel(n, c.labels), "small") +
        widest(wrap(n.cond, "mono"), "mono") +
        PX * 3 +
        4;
      return Math.max(head, n.collapsed ? 60 : LOOP_INDENT + seqMin(n.body, c));
    }
    case "switch": {
      const header = Math.min(widest(wrap(n.expr, "mono"), "mono") + PX * 2, 420) / DIAG_TEXT_RATIO;
      if (n.collapsed) return Math.max(header, 120);
      const cols = [...n.cases, n.defaultCase].reduce(
        (sum, cs) =>
          sum + Math.max(CASE_MIN, textWidth(cs.label, "mono") + PX * 2, seqMin(cs.body, c)),
        0,
      );
      return Math.max(header, cols);
    }
  }
}

function seqMin(list: SNode[], c: Ctx): number {
  return Math.max(textWidth("∅", "sans") + PX * 2, ...list.map((n) => minWidth(n, c)));
}

function expandedBody(n: Extract<SNode, { kind: "call" }>, c: Ctx): SNode[] | null {
  const def = c.doc.functions[n.funcId];
  return n.expanded && def && !c.chain.includes(def.id) ? def.body : null;
}

/** Draws text lines inside a box; returns nothing. `top` is the first line's top. */
function drawLines(
  c: Ctx,
  lines: string[],
  x: number,
  top: number,
  font: FontKey,
  color: string,
  anchor: "start" | "middle" | "end" = "start",
) {
  const f = FONTS[font];
  lines.forEach((line, i) => {
    // baseline: vertically centred in the line box
    const baseline = top + i * f.lh + (f.lh - f.size) / 2 + f.size * 0.8;
    c.prims.push({ t: "text", x, y: baseline, text: line, font, color, anchor });
  });
}

/** Adds a bordered, filled box and returns it so its height can be set later. */
function box(c: Ctx, x: number, y: number, w: number, fill: string) {
  const r = { t: "rect" as const, x, y, w, h: 0, fill, stroke: true };
  c.prims.push(r);
  return r;
}

const hline = (c: Ctx, x1: number, x2: number, y: number) =>
  c.prims.push({
    t: "line",
    pts: [
      [x1, y],
      [x2, y],
    ],
  });
const vline = (c: Ctx, x: number, y1: number, y2: number) =>
  c.prims.push({
    t: "line",
    pts: [
      [x, y1],
      [x, y2],
    ],
  });

/** Lays out a list; returns its height. */
function placeSeq(
  list: SNode[],
  x: number,
  y: number,
  w: number,
  c: Ctx,
  breaks?: number[],
): number {
  if (!list.length) {
    drawLines(
      c,
      ["∅"],
      x + w / 2,
      y + (EMPTY_H - FONTS.sans.lh) / 2,
      "sans",
      c.colors.muted,
      "middle",
    );
    return EMPTY_H;
  }
  let h = 0;
  for (const n of list) {
    breaks?.push(y + h);
    h += place(n, x, y + h, w, c);
  }
  breaks?.push(y + h);
  return h;
}

/** Lays out one block at (x, y) with width w; returns its height. */
function place(n: SNode, x: number, y: number, w: number, c: Ctx): number {
  const { colors } = c;
  switch (n.kind) {
    case "statement": {
      const r = box(c, x, y, w, colors.block);
      const lines = wrap(n.text, "sans");
      drawLines(c, lines, x + PX, y + PY, "sans", colors.text);
      return (r.h = Math.max(ROW_MIN, lines.length * FONTS.sans.lh + PY * 2));
    }
    case "comment": {
      const r = box(c, x, y, w, colors.note);
      const lines = wrap(n.text, "italic");
      r.h = Math.max(ROW_MIN, lines.length * FONTS.italic.lh + PY * 2);
      c.prims.push({ t: "rect", x, y, w: 4, h: r.h, fill: colors.noteText });
      drawLines(c, lines, x + 4 + PX, y + PY, "italic", colors.noteText);
      return r.h;
    }
    case "terminator": {
      const r = box(c, x, y, w, colors.head);
      const lines = wrap(n.text, "mono");
      r.h = Math.max(ROW_MIN, lines.length * FONTS.mono.lh + PY * 2);
      const label = n.variant.toUpperCase();
      const bw = textWidth(label, "small") + 12;
      c.prims.push({
        t: "rect",
        x: x + PX,
        y: y + (r.h - 18) / 2,
        w: bw,
        h: 18,
        fill: colors.head,
        stroke: true,
      });
      drawLines(
        c,
        [label],
        x + PX + bw / 2,
        y + (r.h - 18) / 2 + 2,
        "small",
        colors.muted,
        "middle",
      );
      drawLines(c, lines, x + PX * 2 + bw, y + PY, "mono", colors.text);
      return r.h;
    }
    case "call": {
      const r = box(c, x, y, w, colors.block);
      const head = ROW_MIN;
      vline(c, x + CALL_BAR, y, y + head);
      vline(c, x + w - CALL_BAR, y, y + head);
      drawLines(
        c,
        [callLabel(c.doc, n, c.labels.missingFunction)],
        x + CALL_BAR + PX,
        y + PY,
        "mono",
        colors.text,
      );
      const body = expandedBody(n, c);
      if (!body) return (r.h = head);
      hline(c, x, x + w, y + head);
      const inner = { ...c, chain: [...c.chain, n.funcId] };
      const bh = placeSeq(body, x + CALL_BAR, y + head, w - CALL_BAR, inner);
      c.prims.push({
        t: "rect",
        x,
        y: y + head,
        w: CALL_BAR,
        h: bh,
        fill: colors.head,
        stroke: true,
      });
      return (r.h = head + bh);
    }
    case "if": {
      const r = box(c, x, y, w, colors.block);
      const lines = wrap(n.cond, "mono", Math.max(40, w * DIAG_TEXT_RATIO - PX * 2));
      const tw = widest(lines, "mono") + PX * 2;
      const th = lines.length * FONTS.mono.lh + PY * 2;
      let thenW = w / 2;
      if (!n.collapsed) {
        const a = seqMin(n.then, c);
        const b = seqMin(n.else, c);
        thenW = a + Math.max(0, w - a - b) / 2;
      }
      const { height, left } = ifHeaderLayout(w, thenW, tw, th, 64);
      c.prims.push({
        t: "line",
        pts: [
          [x, y],
          [x + thenW, y + height],
          [x + w, y],
        ],
      });
      hline(c, x, x + w, y + height);
      drawLines(c, lines, x + left + tw / 2, y + DIAG_PAD + PY, "mono", colors.text, "middle");
      drawLines(c, [c.labels.yes], x + 6, y + height - FONTS.small.lh - 2, "small", colors.muted);
      drawLines(
        c,
        [c.labels.no],
        x + w - 6,
        y + height - FONTS.small.lh - 2,
        "small",
        colors.muted,
        "end",
      );
      if (n.collapsed) {
        drawLines(c, ["…"], x + PX, y + height + PY, "sans", colors.muted);
        return (r.h = height + ROW_MIN);
      }
      const ht = placeSeq(n.then, x, y + height, thenW, c);
      const he = placeSeq(n.else, x + thenW, y + height, w - thenW, c);
      const bodyH = Math.max(ht, he);
      vline(c, x + thenW, y + height, y + height + bodyH);
      return (r.h = height + bodyH);
    }
    case "while":
    case "for":
    case "dowhile": {
      const r = box(c, x, y, w, colors.block);
      const label = kindLabel(n, c.labels);
      const lw = textWidth(label, "small");
      const lines = wrap(n.cond, "mono");
      const condRow = Math.max(ROW_MIN, lines.length * FONTS.mono.lh + PY * 2);
      const drawCond = (top: number) => {
        c.prims.push({ t: "rect", x, y: top, w, h: condRow, fill: colors.head, stroke: true });
        drawLines(c, [label], x + PX, top + (condRow - FONTS.small.lh) / 2, "small", colors.muted);
        drawLines(c, lines, x + PX * 2 + lw, top + PY, "mono", colors.text);
      };
      let h = 0;
      if (n.kind === "dowhile") {
        const doRow = 22;
        c.prims.push({ t: "rect", x, y, w, h: doRow, fill: colors.head, stroke: true });
        drawLines(
          c,
          [c.labels.doLabel.toUpperCase()],
          x + PX,
          y + (doRow - FONTS.small.lh) / 2,
          "small",
          colors.muted,
        );
        h = doRow;
      } else {
        drawCond(y);
        h = condRow;
      }
      if (n.collapsed) {
        drawLines(c, ["…"], x + PX, y + h + PY, "sans", colors.muted);
        h += ROW_MIN;
      } else {
        const bh = placeSeq(n.body, x + LOOP_INDENT, y + h, w - LOOP_INDENT, c);
        vline(c, x + LOOP_INDENT, y + h, y + h + bh);
        h += bh;
      }
      if (n.kind === "dowhile") {
        drawCond(y + h);
        h += condRow;
      }
      return (r.h = h);
    }
    case "switch": {
      const r = box(c, x, y, w, colors.block);
      const lines = wrap(n.expr, "mono", Math.max(40, w * DIAG_TEXT_RATIO - PX * 2));
      const tw = widest(lines, "mono") + PX * 2;
      const th = lines.length * FONTS.mono.lh + PY * 2;
      const { height, left } = switchHeaderLayout(w, tw, th, 56);
      c.prims.push({
        t: "line",
        pts: [
          [x, y],
          [x + w, y + height],
        ],
      });
      hline(c, x, x + w, y + height);
      drawLines(c, lines, x + left + PX, y + height - DIAG_PAD - th + PY, "mono", colors.text);
      if (n.collapsed) {
        drawLines(
          c,
          [n.cases.map((cs) => cs.label).join(" · ")],
          x + PX,
          y + height + PY,
          "italic",
          colors.muted,
        );
        return (r.h = height + ROW_MIN);
      }
      const cols = [...n.cases, n.defaultCase];
      const mins = cols.map((cs) =>
        Math.max(CASE_MIN, textWidth(cs.label, "mono") + PX * 2, seqMin(cs.body, c)),
      );
      const extra = Math.max(0, w - mins.reduce((a, b) => a + b, 0)) / cols.length;
      const labelRow = 26;
      let cx = x;
      const heights = cols.map((cs, i) => {
        const cw = mins[i]! + extra;
        c.prims.push({
          t: "rect",
          x: cx,
          y: y + height,
          w: cw,
          h: labelRow,
          fill: colors.head,
          stroke: true,
        });
        drawLines(
          c,
          [cs.label],
          cx + cw / 2,
          y + height + (labelRow - FONTS.mono.lh) / 2,
          "mono",
          colors.text,
          "middle",
        );
        const bh = placeSeq(cs.body, cx, y + height + labelRow, cw, c);
        cx += cw;
        return bh;
      });
      const bodyH = Math.max(...heights);
      cx = x;
      cols.forEach((_, i) => {
        if (i > 0) vline(c, cx, y + height + labelRow, y + height + labelRow + bodyH);
        cx += mins[i]! + extra;
      });
      return (r.h = height + labelRow + bodyH);
    }
  }
}

export function functionTitle(fn: StruktoFunction): string {
  const params = fn.params?.trim() ?? "";
  const ret = fn.returns?.trim();
  return `${fn.name}(${params})${ret ? `: ${ret}` : ""}`;
}

/** Lays out the given functions one below the other. */
export function layoutDiagrams(
  doc: StruktoDoc,
  funcIds: string[],
  colors: RenderColors,
  labels: RenderLabels,
): Drawing {
  const prims: Prim[] = [];
  const c: Ctx = { doc, colors, labels, prims, chain: [] };
  const fns = funcIds.map((id) => doc.functions[id]).filter((f): f is StruktoFunction => !!f);
  const width = Math.max(
    SURFACE_MIN,
    ...fns.map((fn) =>
      Math.max(
        textWidth(functionTitle(fn), "title") + 24,
        seqMin(fn.body, { ...c, chain: [fn.id] }),
      ),
    ),
  );
  const breaks: number[] = [];
  const surfaces: Drawing["surfaces"] = [];
  prims.push({ t: "rect", x: 0, y: 0, w: 0, h: 0, fill: colors.canvas }); // background, sized below
  let y = MARGIN;
  fns.forEach((fn, i) => {
    if (i) y += GAP;
    const top = y;
    breaks.push(y);
    prims.push({ t: "rect", x: MARGIN, y, w: width, h: TITLE_H, fill: colors.head, stroke: true });
    drawLines(
      c,
      [functionTitle(fn)],
      MARGIN + 12,
      y + (TITLE_H - FONTS.title.lh) / 2,
      "title",
      colors.text,
    );
    y += TITLE_H;
    const frame = box(c, MARGIN, y, width, colors.block);
    frame.h = placeSeq(fn.body, MARGIN, y, width, { ...c, chain: [fn.id] }, breaks);
    y += frame.h;
    surfaces.push({ y: top, h: y - top });
  });
  const bg = prims[0] as Extract<Prim, { t: "rect" }>;
  bg.w = width + MARGIN * 2;
  bg.h = y + MARGIN;
  return {
    width: bg.w,
    height: bg.h,
    prims,
    breaks: [...new Set(breaks)].sort((a, b) => a - b),
    surfaces,
  };
}

/* -------------------------------- renderers -------------------------------- */

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function toSvg(d: Drawing, lineColor: string): string {
  const parts: string[] = [];
  for (const p of d.prims) {
    if (p.t === "rect") {
      parts.push(
        `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" fill="${p.fill}"${p.stroke ? ` stroke="${lineColor}"` : ""}/>`,
      );
    } else if (p.t === "line") {
      parts.push(
        `<polyline points="${p.pts.map(([x, y]) => `${x},${y}`).join(" ")}" fill="none" stroke="${lineColor}"/>`,
      );
    } else {
      const f = FONTS[p.font];
      parts.push(
        `<text x="${p.x}" y="${p.y}" fill="${p.color}" font-family="${esc(f.family)}" font-size="${f.size}"` +
          `${f.weight ? ` font-weight="${f.weight}"` : ""}${f.italic ? ` font-style="italic"` : ""}` +
          `${p.anchor !== "start" ? ` text-anchor="${p.anchor}"` : ""} xml:space="preserve">${esc(p.text)}</text>`,
      );
    }
  }
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${d.width}" height="${d.height}" viewBox="0 0 ${d.width} ${d.height}">\n` +
    `<g stroke-width="1" shape-rendering="geometricPrecision">\n${parts.join("\n")}\n</g>\n</svg>\n`
  );
}

/**
 * Draws the region [top, top + height) of the drawing. Rendering page-sized
 * regions keeps large diagrams below the browser's canvas size limit.
 */
export function drawToCanvas(
  d: Drawing,
  lineColor: string,
  scale: number,
  top = 0,
  height = d.height,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(d.width * scale);
  canvas.height = Math.ceil(height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  ctx.translate(0, -top);
  ctx.lineWidth = 1;
  ctx.strokeStyle = lineColor;
  for (const p of d.prims) {
    if (p.t === "rect") {
      ctx.fillStyle = p.fill;
      ctx.fillRect(p.x, p.y, p.w, p.h);
      // borders of neighbouring boxes must land on the same pixel row, not side by side
      if (p.stroke) ctx.strokeRect(p.x + 0.5, p.y + 0.5, p.w, p.h);
    } else if (p.t === "line") {
      ctx.beginPath();
      p.pts.forEach(([x, y], i) =>
        i ? ctx.lineTo(x + 0.5, y + 0.5) : ctx.moveTo(x + 0.5, y + 0.5),
      );
      ctx.stroke();
    } else {
      ctx.font = FONTS[p.font].css;
      ctx.fillStyle = p.color;
      ctx.textAlign = p.anchor === "middle" ? "center" : p.anchor === "end" ? "right" : "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(p.text, p.x, p.y);
    }
  }
  return canvas;
}
