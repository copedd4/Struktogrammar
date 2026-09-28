import { z } from "zod";
import { uid } from "./model";
import type { SNode, StruktoDoc } from "./types";

/** Newest file format this build writes and understands. */
export const CURRENT_VERSION = 1;

const id = z.string().min(1);
const text = z.string().catch("");

export const nodeSchema: z.ZodType<SNode> = z.lazy(() =>
  z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("statement"), id, text }),
    z.object({ kind: z.literal("comment"), id, text }),
    z.object({
      kind: z.literal("terminator"),
      id,
      variant: z.enum(["break", "return", "continue"]).catch("break"),
      text,
    }),
    z.object({
      kind: z.literal("call"),
      id,
      funcId: z.string(),
      args: z.string().optional(),
      collapsed: z.boolean().optional(),
      expanded: z.boolean().optional(),
    }),
    z.object({
      kind: z.literal("if"),
      id,
      cond: text,
      then: z.array(nodeSchema).catch([]),
      else: z.array(nodeSchema).catch([]),
      collapsed: z.boolean().optional(),
    }),
    z.object({
      kind: z.enum(["while", "dowhile", "for"]),
      id,
      cond: text,
      body: z.array(nodeSchema).catch([]),
      collapsed: z.boolean().optional(),
    }),
    z.object({
      kind: z.literal("switch"),
      id,
      expr: text,
      cases: z.array(caseSchema).catch([]),
      defaultCase: caseSchema.catch(() => ({ id: uid(), label: "default", body: [] })),
      collapsed: z.boolean().optional(),
    }),
  ]),
) as z.ZodType<SNode>;

const caseSchema = z.object({
  id,
  label: text,
  body: z.array(nodeSchema).catch([]),
});

export const functionSchema = z.object({
  id,
  name: z.string().catch("function"),
  params: z.string().optional(),
  returns: z.string().optional(),
  body: z.array(nodeSchema),
  orphaned: z.boolean().optional(),
});

const docSchema = z.object({
  version: z.number().int().positive(),
  format: z.literal("stkg"),
  name: z.string().catch("Untitled"),
  mainId: id,
  functions: z.record(functionSchema),
});

export class InvalidFileError extends Error {
  constructor(
    message: string,
    readonly reason: "json" | "structure" | "newer",
  ) {
    super(message);
  }
}

/** Upgrade older files step by step. Add a case here whenever the format changes. */
function migrate(data: Record<string, unknown>): Record<string, unknown> {
  // files written before `format`/`version` were stored
  if (data["version"] === undefined) data["version"] = 1;
  if (data["format"] === undefined) data["format"] = "stkg";
  return data;
}

/** Parse and validate a .stkg file. Throws InvalidFileError with a reason. */
export function parseDocument(raw: string): StruktoDoc {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new InvalidFileError("Not valid JSON", "json");
  }
  if (!data || typeof data !== "object")
    throw new InvalidFileError("Not a .stkg document", "structure");
  const migrated = migrate(data as Record<string, unknown>);
  if (typeof migrated["version"] === "number" && migrated["version"] > CURRENT_VERSION)
    throw new InvalidFileError("File was written by a newer version", "newer");
  const result = docSchema.safeParse(migrated);
  if (!result.success)
    throw new InvalidFileError(result.error.issues[0]?.message ?? "Invalid", "structure");
  const doc = result.data as StruktoDoc;
  if (!doc.functions[doc.mainId])
    throw new InvalidFileError("Main function is missing", "structure");
  // keys and ids must agree, other code relies on functions[id].id === id
  for (const [key, fn] of Object.entries(doc.functions)) fn.id = key;
  return { ...doc, version: CURRENT_VERSION };
}
