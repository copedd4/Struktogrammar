import type { StruktoDoc } from "./types";
import { parseDocument } from "./schema";
import { loadHandle, rememberRecent } from "./recent";

let handle: FileSystemFileHandle | null = null;

const pickerOpts = {
  types: [{ description: "Struktogramm project", accept: { "application/json": [".stkg"] } }],
};

export const supportsFsAccess = () =>
  typeof window !== "undefined" && "showSaveFilePicker" in window;

export function serialize(doc: StruktoDoc) {
  return JSON.stringify(doc, null, 2);
}

/** Parse and validate a .stkg file (throws InvalidFileError). */
export const parse = parseDocument;

function download(name: string, content: string) {
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const isAbort = (err: unknown) => (err as DOMException)?.name === "AbortError";

async function write(h: FileSystemFileHandle, doc: StruktoDoc) {
  const writable = await h.createWritable();
  await writable.write(serialize(doc));
  await writable.close();
}

/**
 * Save to the current file (or ask for one). Returns the saved file name.
 * Cancelling the picker throws an AbortError. When the picker itself is not
 * usable here (e.g. inside an iframe) the file is downloaded instead; a failure
 * while writing an already chosen file is thrown so the user learns about it.
 */
export async function saveProject(
  doc: StruktoDoc,
  name: string,
  forceNew = false,
): Promise<string> {
  const fileName = name.endsWith(".stkg") ? name : `${name}.stkg`;
  if (supportsFsAccess()) {
    let target = forceNew ? null : handle;
    if (!target) {
      try {
        // @ts-expect-error non-standard API
        target = (await window.showSaveFilePicker({
          suggestedName: fileName,
          ...pickerOpts,
        })) as FileSystemFileHandle;
      } catch (err) {
        if (isAbort(err)) throw err;
        target = null; // picker blocked: fall through to a download
      }
    }
    if (target) {
      await write(target, doc);
      handle = target;
      await rememberRecent(target);
      return target.name;
    }
  }
  download(fileName, serialize(doc));
  return fileName;
}

export async function openProject(): Promise<{ doc: StruktoDoc; name: string } | null> {
  if (supportsFsAccess()) {
    let h: FileSystemFileHandle | null = null;
    try {
      // @ts-expect-error non-standard API
      [h] = await window.showOpenFilePicker(pickerOpts);
    } catch (err) {
      if (isAbort(err)) return null;
    }
    if (h) {
      const doc = parse(await (await h.getFile()).text());
      handle = h;
      await rememberRecent(h);
      return { doc, name: h.name };
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
    await write(handle, doc);
    return true;
  } catch {
    return false;
  }
}

/** Re-open a previously used file from the stored handle (permission prompt may appear). */
export async function openRecent(id: string): Promise<{ doc: StruktoDoc; name: string } | null> {
  const h = await loadHandle(id);
  if (!h) return null;
  const perm = await (
    h as unknown as { requestPermission?: (o: unknown) => Promise<PermissionState> }
  ).requestPermission?.({ mode: "readwrite" });
  if (perm && perm !== "granted") return null;
  const doc = parse(await (await h.getFile()).text());
  handle = h;
  await rememberRecent(h);
  return { doc, name: h.name };
}
