import { toCanvas, toPng, toSvg } from "html-to-image";
import { jsPDF } from "jspdf";

const opts = (el: HTMLElement) => ({
  backgroundColor: getComputedStyle(document.documentElement).getPropertyValue("--canvas") || "#fff",
  pixelRatio: 2,
  width: el.scrollWidth,
  height: el.scrollHeight,
  style: { transform: "none", transformOrigin: "top left" },
});

function triggerDownload(dataUrl: string, name: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = name;
  a.click();
}

export async function exportPng(elements: HTMLElement[], name: string) {
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i]!;
    const url = await toPng(el, opts(el));
    triggerDownload(url, elements.length > 1 ? `${name}-${i + 1}.png` : `${name}.png`);
  }
}

export async function exportSvg(elements: HTMLElement[], name: string) {
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i]!;
    const url = await toSvg(el, opts(el));
    triggerDownload(url, elements.length > 1 ? `${name}-${i + 1}.svg` : `${name}.svg`);
  }
}

const PDF_MARGIN = 30;
/** 1 CSS px = 0.75 pt; the canvas is rendered at pixelRatio 2. */
const PT_PER_CANVAS_PX = 0.75 / 2;

/**
 * Each diagram starts on a new A4 page (landscape for wide diagrams). It is scaled
 * to the page width without distorting it, and never enlarged beyond its natural
 * size; diagrams taller than one page continue on the following pages.
 */
export async function exportPdf(elements: HTMLElement[], name: string) {
  let pdf: jsPDF | null = null;
  for (const el of elements) {
    const canvas = await toCanvas(el, opts(el));
    const orientation = el.scrollWidth > el.scrollHeight ? "landscape" : "portrait";
    if (pdf) pdf.addPage("a4", orientation);
    else pdf = new jsPDF({ unit: "pt", format: "a4", orientation });

    const maxW = pdf.internal.pageSize.getWidth() - PDF_MARGIN * 2;
    const maxH = pdf.internal.pageSize.getHeight() - PDF_MARGIN * 2;
    const scale = Math.min(maxW / canvas.width, PT_PER_CANVAS_PX);
    const sliceHeight = Math.max(1, Math.floor(maxH / scale));

    for (let y = 0; y < canvas.height; y += sliceHeight) {
      const h = Math.min(sliceHeight, canvas.height - y);
      const slice = document.createElement("canvas");
      slice.width = canvas.width;
      slice.height = h;
      slice.getContext("2d")!.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
      if (y > 0) pdf.addPage("a4", orientation);
      pdf.addImage(slice.toDataURL("image/png"), "PNG", PDF_MARGIN, PDF_MARGIN, canvas.width * scale, h * scale);
    }
  }
  pdf?.save(`${name}.pdf`);
}
