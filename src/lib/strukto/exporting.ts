import { toPng, toSvg } from "html-to-image";
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

export async function exportPdf(elements: HTMLElement[], name: string) {
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const pw = pdf.internal.pageSize.getWidth();
  const ph = pdf.internal.pageSize.getHeight();
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i]!;
    const url = await toPng(el, opts(el));
    const ratio = el.scrollHeight / el.scrollWidth;
    const w = pw - 60;
    const h = Math.min(w * ratio, ph - 60);
    if (i > 0) pdf.addPage();
    pdf.addImage(url, "PNG", 30, 30, w, h);
  }
  pdf.save(`${name}.pdf`);
}
