import { isTauri } from "@tauri-apps/api/core";

export interface SaveFilter {
  /** Label shown in the save dialog, e.g. "PNG image". */
  name: string;
  /** Extensions without the dot, e.g. ["png"]. */
  extensions: string[];
}

/**
 * Save a file the user names.
 *
 * In the desktop app this shows the native "Save as" dialog and writes the file
 * through Tauri: the app's webview ignores `<a download>` links, so the browser
 * way silently does nothing there. In a plain browser the file is downloaded.
 *
 * Returns the chosen file name, or `null` when the user cancelled the dialog.
 */
export async function saveFile(
  suggestedName: string,
  data: Blob | string,
  filter: SaveFilter,
): Promise<string | null> {
  if (isTauri()) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeFile, writeTextFile } = await import("@tauri-apps/plugin-fs");
    const path = await save({ defaultPath: suggestedName, filters: [filter] });
    if (!path) return null;
    if (typeof data === "string") await writeTextFile(path, data);
    else await writeFile(path, new Uint8Array(await data.arrayBuffer()));
    return path.split(/[\\/]/).pop() ?? suggestedName;
  }

  const blob = typeof data === "string" ? new Blob([data], { type: "text/plain" }) : data;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = suggestedName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return suggestedName;
}
