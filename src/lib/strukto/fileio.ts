import type { StruktoDoc } from "./types";
import { emptyDoc } from "./model";

let handle: FileSystemFileHandle | null = null;

const pickerOpts = {
  types: [{ description: "Struktogramm project", accept: { "application/json": [".stkg"] } }],
};

export const supportsFsAccess = () =>
  typeof window !== "undefined" && "showSaveFilePicker" in window;

export function serialize(doc: StruktoDoc) {
  return JSON.stringify(doc, null, 2);
}

export function parse(text: string): StruktoDoc {
  const data = JSON.parse(text) as StruktoDoc;
  if (!data || typeof data !== "object" || !data.functions || !data.mainId)
    throw new Error("Invalid .stkg file");
  return { ...emptyDoc(), ...data };
}

function download(name: string, content: string) {
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export async function saveProject(doc: StruktoDoc, name: string, forceNew = false): Promise<string> {
  const fileName = name.endsWith(".stkg") ? name : `${name}.stkg`;
  if (supportsFsAccess()) {
    try {
      if (!handle || forceNew) {
        // @ts-expect-error non-standard API
        handle = await window.showSaveFilePicker({ suggestedName: fileName, ...pickerOpts });
      }
      const writable = await handle!.createWritable();
      await writable.write(serialize(doc));
      await writable.close();
      return handle!.name;
    } catch (err) {
      if ((err as DOMException)?.name === "AbortError") throw err;
    }
  }
  download(fileName, serialize(doc));
  return fileName;
}

export async function openProject(): Promise<{ doc: StruktoDoc; name: string } | null> {
  if (supportsFsAccess()) {
    try {
      // @ts-expect-error non-standard API
      const [h] = await window.showOpenFilePicker(pickerOpts);
      handle = h;
      const file = await h.getFile();
      return { doc: parse(await file.text()), name: h.name };
    } catch (err) {
      if ((err as DOMException)?.name === "AbortError") return null;
    }
  }
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".stkg,application/json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      try {
        resolve({ doc: parse(await file.text()), name: file.name });
      } catch (e) {
        reject(e);
      }
    };
    input.click();
  });
}

export function resetHandle() {
  handle = null;
}
