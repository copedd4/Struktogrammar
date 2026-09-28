import { z } from "zod";
import { makeNode, walk } from "./model";
import { functionSchema, nodeSchema } from "./schema";
import type { SNode, StruktoDoc, StruktoFunction } from "./types";

/**
 * Blocks travel through the system clipboard as JSON text, so they can be pasted
 * into another tab or document. Function definitions used by copied call blocks
 * travel along, otherwise those calls would point nowhere in another document.
 */
export interface Clip {
  node: SNode;
  functions: Record<string, StruktoFunction>;
}

const TAG = "strukto-block";

const clipSchema = z.object({
  [TAG]: z.literal(1),
  node: nodeSchema,
  functions: z.record(functionSchema).catch({}),
});

export function makeClip(doc: StruktoDoc, node: SNode): Clip {
  const functions: Record<string, StruktoFunction> = {};
  const visit = (n: SNode) => {
    if (n.kind !== "call" || functions[n.funcId]) return;
    const fn = doc.functions[n.funcId];
    if (!fn) return;
    functions[fn.id] = fn;
    walk(fn.body, visit);
  };
  walk([node], visit);
  return { node, functions };
}

export const serializeClip = (clip: Clip) => JSON.stringify({ [TAG]: 1, ...clip });

/**
 * Blocks copied from this editor come back as they were; any other text
 * becomes one statement per non-empty line.
 */
export function parseClipText(text: string): Clip[] {
  try {
    const parsed = clipSchema.safeParse(JSON.parse(text));
    if (parsed.success)
      return [{ node: parsed.data.node, functions: parsed.data.functions as Clip["functions"] }];
  } catch {
    /* not JSON: plain text */
  }
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 200)
    .map((line) => {
      const n = makeNode("statement");
      if (n.kind === "statement") n.text = line;
      return { node: n, functions: {} };
    });
}

/** False when the last copy could not reach the system clipboard, which then holds older content. */
let systemHasLatest = true;

/** Record that a copy event already put the block on the system clipboard. */
export function noteSystemClipboardWritten() {
  systemHasLatest = true;
}

/** Copy to the system clipboard where allowed; failures are silent (the in-app clipboard still works). */
export async function writeSystemClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    systemHasLatest = true;
  } catch {
    systemHasLatest = false;
  }
  return systemHasLatest;
}

export async function readSystemClipboard(): Promise<string | null> {
  try {
    return await navigator.clipboard.readText();
  } catch {
    return null;
  }
}

/**
 * What a paste inserts. Every copy also writes the system clipboard, so its text
 * is the most recent thing the user copied: a block from this editor, or other
 * text (one statement per line). The in-app clipboard is the fallback when the
 * system clipboard can't be read.
 */
export function resolvePaste(
  systemText: string | null,
  internal: SNode | null,
  doc: StruktoDoc,
): Clip[] {
  if (systemText?.trim() && (systemHasLatest || !internal)) return parseClipText(systemText);
  return internal ? [makeClip(doc, internal)] : [];
}
