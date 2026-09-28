/**
 * Recent-file bookkeeping. File handles are kept in IndexedDB where supported.
 * Entries are keyed by an id, not the file name: two "main.stkg" files in
 * different folders are different entries (told apart with isSameEntry).
 */
export interface RecentFile {
  id: string;
  name: string;
  at: number;
}

import { uid } from "./model";

const KEY = "strukto.recent.v2";
const DB = "strukto-files";
const STORE = "handles";
const MAX = 8;

const LEGACY_KEY = "strukto.recent.v1";

export function listRecent(): RecentFile[] {
  try {
    const raw = localStorage.getItem(KEY);
    // v1 stored names only; their handles were saved under the name, so it doubles as the id
    const list = raw
      ? (JSON.parse(raw) as RecentFile[])
      : (
          JSON.parse(localStorage.getItem(LEGACY_KEY) ?? "[]") as Array<{
            name: string;
            at: number;
          }>
        ).map((r) => ({ id: r.name, name: r.name, at: r.at }));
    return Array.isArray(list) ? list.filter((r) => r && r.id && r.name) : [];
  } catch {
    return [];
  }
}

function saveList(list: RecentFile[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable */
  }
}

export function clearRecent() {
  saveList([]);
  void withStore("readwrite", (s) => s.clear());
}

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const req = run(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null); // e.g. handle not cloneable
    }
  });
}

export async function loadHandle(id: string): Promise<FileSystemFileHandle | null> {
  return (
    ((await withStore("readonly", (s) => s.get(id))) as FileSystemFileHandle | undefined) ?? null
  );
}

/** Move `handle` to the top of the recent list, reusing its entry if it is already known. */
export async function rememberRecent(handle: FileSystemFileHandle) {
  const list = listRecent();
  let id: string | null = null;
  for (const r of list) {
    const known = await loadHandle(r.id);
    if (known && (await known.isSameEntry(handle).catch(() => false))) {
      id = r.id;
      break;
    }
  }
  id ??= `${Date.now().toString(36)}-${uid()}`;
  await withStore("readwrite", (s) => s.put(handle, id));
  const next = [{ id, name: handle.name, at: Date.now() }, ...list.filter((r) => r.id !== id)];
  for (const dropped of next.slice(MAX)) void withStore("readwrite", (s) => s.delete(dropped.id));
  saveList(next.slice(0, MAX));
}
