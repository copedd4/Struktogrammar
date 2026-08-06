/** Recent-file bookkeeping. File handles are kept in IndexedDB where supported. */
export interface RecentFile {
  name: string;
  at: number;
}

const KEY = "strukto.recent.v1";
const DB = "strukto-files";
const STORE = "handles";

export function listRecent(): RecentFile[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as RecentFile[];
  } catch {
    return [];
  }
}

export function clearRecent() {
  localStorage.removeItem(KEY);
}

export function rememberRecent(name: string) {
  const next = [{ name, at: Date.now() }, ...listRecent().filter((r) => r.name !== name)].slice(0, 8);
  localStorage.setItem(KEY, JSON.stringify(next));
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

export async function storeHandle(name: string, handle: unknown) {
  const db = await openDb();
  if (!db) return;
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).put(handle, name);
}

export async function loadHandle(name: string): Promise<FileSystemFileHandle | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).get(name);
    req.onsuccess = () => resolve((req.result as FileSystemFileHandle) ?? null);
    req.onerror = () => resolve(null);
  });
}
