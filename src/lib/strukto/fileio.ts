import type { StruktoDoc } from "./types";
import { emptyDoc } from "./model";
import { loadHandle, rememberRecent, storeHandle } from "./recent";

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
      rememberRecent(handle!.name);
      void storeHandle(handle!.name, handle);
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
      rememberRecent(h.name);
      void storeHandle(h.name, h);
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

/** True when we can write silently (autosave) without showing a picker. */
export const hasHandle = () => handle !== null;

/** Silent write to the already-granted handle. Returns false when not possible. */
export async function saveToHandle(doc: StruktoDoc): Promise<boolean> {
  if (!handle) return false;
  try {
    const perm = await (
      handle as unknown as { queryPermission?: (o: unknown) => Promise<PermissionState> }
    ).queryPermission?.({ mode: "readwrite" });
    if (perm && perm !== "granted") return false;
    const writable = await handle.createWritable();
    await writable.write(serialize(doc));
    await writable.close();
    return true;
  } catch {
    return false;
  }
}

/** Re-open a previously used file from the stored handle (permission prompt may appear). */
export async function openRecent(name: string): Promise<{ doc: StruktoDoc; name: string } | null> {
  const h = await loadHandle(name);
  if (!h) return null;
  const perm = await (
    h as unknown as { requestPermission?: (o: unknown) => Promise<PermissionState> }
  ).requestPermission?.({ mode: "readwrite" });
  if (perm && perm !== "granted") return null;
  handle = h;
  const file = await h.getFile();
  rememberRecent(name);
  return { doc: parse(await file.text()), name };
}
