import { jsPDF } from "jspdf";
import {
  FONTS,
  drawToCanvas,
  layoutDiagrams,
  toSvg,
  type Drawing,
  type RenderColors,
  type RenderLabels,
} from "./render";
import { saveFile } from "./savefile";
import type { StruktoDoc } from "./types";

export type ExportFormat = "png" | "svg" | "pdf";

export interface ExportRequest {
  doc: StruktoDoc;
  /** Functions to export, drawn one below the other (PDF: one per page). */
  funcIds: string[];
  labels: RenderLabels;
  /** File name without extension. */
  name: string;
}

/** Resolve a theme colour (often oklch) to rgb, which every SVG/PDF viewer understands. */
function themeColor(varName: string, fallback: string): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx || !raw) return fallback;
  ctx.fillStyle = fallback;
  ctx.fillStyle = raw;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
  return a === 255
    ? `rgb(${r}, ${g}, ${b})`
    : `rgba(${r}, ${g}, ${b}, ${((a ?? 255) / 255).toFixed(3)})`;
}

function themeColors(): RenderColors {
  return {
    canvas: themeColor("--canvas", "#f5f5f5"),
    block: themeColor("--block", "#ffffff"),
    head: themeColor("--block-head", "#f1f3f5"),
    line: themeColor("--line", "#555b66"),
    text: themeColor("--foreground", "#111827"),
    muted: themeColor("--muted-foreground", "#6b7280"),
    note: themeColor("--note", "#fdf6d8"),
    noteText: themeColor("--note-foreground", "#5c4a1a"),
  };
}

async function ensureFonts() {
  if (typeof document === "undefined" || !document.fonts) return;
  await Promise.all(
    Object.values(FONTS).map((f) => document.fonts.load(f.css, "Aa∅←").catch(() => [])),
  );
}

const pngBlob = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG encoding failed"))), "image/png"),
  );

/**
 * Render and save the diagram. Returns the saved file name, or `null` when the
 * user cancelled the save dialog.
 */
export async function exportDiagram(
  format: ExportFormat,
  req: ExportRequest,
): Promise<string | null> {
  await ensureFonts();
  const colors = themeColors();
  const drawing = layoutDiagrams(req.doc, req.funcIds, colors, req.labels);
  if (format === "svg") {
    const blob = new Blob([toSvg(drawing, colors.line)], { type: "image/svg+xml;charset=utf-8" });
    return saveFile(`${req.name}.svg`, blob, { name: "SVG image", extensions: ["svg"] });
  }
  if (format === "png") {
    // 2× for sharpness, less for huge diagrams: browsers refuse canvases above ~16k px per side
    const scale = Math.max(0.5, Math.min(2, MAX_CANVAS / Math.max(drawing.width, drawing.height)));
    const blob = await pngBlob(drawToCanvas(drawing, colors.line, scale));
    return saveFile(`${req.name}.png`, blob, { name: "PNG image", extensions: ["png"] });
  }
  const pdf = buildPdf(drawing, colors.line);
  if (!pdf) return null;
  return saveFile(`${req.name}.pdf`, pdf, { name: "PDF document", extensions: ["pdf"] });
}

const PDF_MARGIN = 30;
/** 1 CSS px = 0.75 pt. */
const PT_PER_PX = 0.75;
const PDF_SCALE = 3;
const MAX_CANVAS = 16000;

/**
 * Each function starts on a new A4 page (landscape when wider than tall), scaled
 * to fit the page width without distortion and never enlarged. Diagrams taller
 * than a page continue on the next one; page breaks fall between blocks
 * whenever possible instead of cutting through one.
 */
function buildPdf(d: Drawing, lineColor: string): Blob | null {
  let pdf: jsPDF | null = null;
  for (const s of d.surfaces) {
    const top = s.y - 8;
    const bottom = s.y + s.h + 8;
    const orientation = d.width > bottom - top ? "landscape" : "portrait";
    if (pdf) pdf.addPage("a4", orientation);
    else pdf = new jsPDF({ unit: "pt", format: "a4", orientation, compress: true });
    const maxW = pdf.internal.pageSize.getWidth() - PDF_MARGIN * 2;
    const maxH = pdf.internal.pageSize.getHeight() - PDF_MARGIN * 2;
    const scale = Math.min(maxW / d.width, PT_PER_PX); // pt per drawing px
    const pageH = maxH / scale; // drawing px per page

    let y = top;
    while (y < bottom - 1) {
      let end = Math.min(bottom, y + pageH);
      if (end < bottom) {
        // prefer the last block boundary on this page, unless it wastes most of the page
        const cut = d.breaks.filter((b) => b > y + pageH * 0.3 && b <= end).at(-1);
        if (cut) end = cut;
      }
      // each page is rendered on its own, so the whole diagram never needs one giant canvas
      const slice = drawToCanvas(
        d,
        lineColor,
        Math.min(PDF_SCALE, MAX_CANVAS / d.width),
        y,
        end - y,
      );
      if (y > top) pdf.addPage("a4", orientation);
      // "FAST" = flate-compress the pixels; jsPDF stores them raw (MBs per page) otherwise
      pdf.addImage(
        slice,
        "PNG",
        PDF_MARGIN,
        PDF_MARGIN,
        d.width * scale,
        (end - y) * scale,
        undefined,
        "FAST",
      );
      y = end;
    }
  }
  return pdf ? pdf.output("blob") : null;
}
