import { walk } from "./model";
import type { SNode, StruktoDoc, StruktoFunction } from "./types";

export type CodeLang = "c" | "python" | "java" | "javascript";

export const CODE_LANGS: Array<{ id: CodeLang; label: string; ext: string }> = [
  { id: "c", label: "C", ext: "c" },
  { id: "python", label: "Python", ext: "py" },
  { id: "java", label: "Java", ext: "java" },
  { id: "javascript", label: "JavaScript", ext: "js" },
];

const IND = "    ";
const ind = (n: number) => IND.repeat(n);

const sanitize = (name: string) =>
  (name.trim() || "func").replace(/[^A-Za-z0-9_]/g, "_").replace(/^(\d)/, "_$1");

/** strip a trailing `;` / `:` so we can re-add per language */
const bare = (s: string) => s.trim().replace(/[;:]+$/, "");

/* ----------------------- pseudo-code → target syntax ----------------------- */

/**
 * Diagrams are usually written in pseudo-code (`x ← 1`, `a ≥ b`, `n = 0` as a
 * comparison, `and`/`or`). Translate the common notations to the target language.
 */
function translate(lang: CodeLang, text: string, isCondition: boolean): string {
  // string literals are copied verbatim, only the code between them is translated
  return text
    .split(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/)
    .map((part, i) => (i % 2 ? part : translateCode(lang, part, isCondition)))
    .join("")
    .replace(/ {2,}/g, " ")
    .trim();
}

function translateCode(lang: CodeLang, text: string, isCondition: boolean): string {
  let s = text.replace(/←|:=/g, "=").replace(/≠|<>/g, "!=").replace(/≤/g, "<=").replace(/≥/g, ">=");
  // in a condition a lone `=` is a comparison
  if (isCondition) s = s.replace(/(^|[^=!<>+\-*/%&|^])=(?!=)/g, "$1==");
  if (lang === "python") {
    s = s
      .replace(/&&/g, " and ")
      .replace(/\|\|/g, " or ")
      .replace(/!(?!=)/g, "not ")
      .replace(/\btrue\b/g, "True")
      .replace(/\bfalse\b/g, "False")
      .replace(/\bnull\b/g, "None");
  } else {
    s = s
      .replace(/\band\b/g, "&&")
      .replace(/\bor\b/g, "||")
      .replace(/\bnot\s+/g, "!")
      .replace(/\bTrue\b/g, "true")
      .replace(/\bFalse\b/g, "false");
  }
  return s;
}

const stmt = (lang: CodeLang, text: string) => {
  const s = translate(lang, bare(text), false) || (lang === "python" ? "pass" : "/* … */");
  return lang === "python" ? s : `${s};`;
};

const cond = (lang: CodeLang, text: string) =>
  translate(lang, bare(text), true) || (lang === "python" ? "True" : "true");

/**
 * `for` headers: "i ← 1 to n" / "i = 0; i < n; i++" / "x in items" are turned
 * into the target language's loop; anything else is kept as typed.
 */
function forHeader(lang: CodeLang, raw: string): string {
  const c =
    bare(raw)
      .replace(/^for\s*/i, "")
      .replace(/^\((.*)\)$/, "$1")
      .trim() || "i = 0; i < n; i++";
  const range =
    /^(\w+)\s*(?:←|=|:=)\s*(.+?)\s+(?:to|bis|\.\.)\s+(.+?)(?:\s+(?:step|schritt)\s+(.+))?$/i.exec(
      c,
    );
  const cStyle =
    /^(\w+)\s*=\s*([^;]+);\s*\1\s*(<=?|>=?)\s*([^;]+);\s*(?:\1\s*(\+\+|--|\+=\s*\S+|-=\s*\S+)|(\+\+|--)\s*\1)$/.exec(
      c,
    );
  const each = /^(?:(?:const|let|var|int|String|auto)\s+)?(\w+)\s+(?:in|of|:)\s+(.+)$/.exec(c);

  if (lang === "python") {
    if (range) {
      const [, v, a, b, step] = range;
      return `for ${v} in range(${a}, ${b} + 1${step ? `, ${step}` : ""}):`;
    }
    if (cStyle) {
      const [, v, a, op, b, post = "", pre = ""] = cStyle;
      const inc = post || pre;
      const step =
        inc === "--"
          ? "-1"
          : inc.startsWith("-=")
            ? `-${inc.slice(2).trim()}`
            : inc.startsWith("+=")
              ? inc.slice(2).trim()
              : "";
      const end = op === "<=" ? `${b} + 1` : op === ">=" ? `${b} - 1` : b;
      return `for ${v} in range(${a}, ${end}${step ? `, ${step}` : ""}):`;
    }
    if (each) return `for ${each[1]} in ${translate(lang, each[2]!, false)}:`;
    return `for ${translate(lang, c, false)}:`;
  }
  if (range) {
    const [, v, a, b, step] = range;
    const decl = lang === "javascript" ? "let " : "int ";
    return `for (${decl}${v} = ${a}; ${v} <= ${b}; ${v}${step ? ` += ${step}` : "++"}) {`;
  }
  if (each && !c.includes(";")) {
    if (lang === "javascript") return `for (const ${each[1]} of ${each[2]}) {`;
    if (lang === "java") return `for (var ${each[1]} : ${each[2]}) {`;
  }
  return `for (${translate(lang, c, false)}) {`;
}

/* ------------------------------ parameters -------------------------------- */

interface Param {
  name: string;
  type?: string;
}

/** Accepts "int a, int b", "a: int, b" or "a, b". */
export function parseParams(raw: string | undefined): Param[] {
  return (raw ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const py = /^(\w+)\s*:\s*(.+)$/.exec(p);
      if (py) return { name: py[1]!, type: py[2]!.trim() };
      const words = p.replace(/\s*=.*$/, "").split(/\s+/);
      const name = words.pop()!.replace(/^[*&]+/, "");
      const type = words.join(" ") + (/^[*&]/.test(p.split(/\s+/).pop() ?? "") ? "*" : "");
      return type ? { name, type } : { name };
    });
}

const hasReturnValue = (fn: StruktoFunction) => {
  let found = false;
  walk(fn.body, (n) => {
    if (n.kind === "terminator" && n.variant === "return" && returnValue(n.text)) found = true;
  });
  return found;
};

/** "return x" typed into a return block's text is just "x". */
const returnValue = (text: string) => bare(text).replace(/^return\b\s*/, "");

function signature(fn: StruktoFunction, lang: CodeLang, isMain: boolean): string {
  const name = sanitize(fn.name);
  const params = parseParams(fn.params);
  const typed = (fallback: string) =>
    params.map((p) => `${p.type ?? fallback} ${sanitize(p.name)}`).join(", ");
  const ret = fn.returns?.trim() || (hasReturnValue(fn) ? "int" : "void");
  switch (lang) {
    case "python":
      return `def ${name}(${params.map((p) => sanitize(p.name)).join(", ")}):`;
    case "javascript":
      return `function ${name}(${params.map((p) => sanitize(p.name)).join(", ")}) {`;
    case "java":
      if (isMain && !params.length) return "public static void main(String[] args) {";
      return `static ${ret} ${name}(${typed("int")}) {`;
    case "c":
      if (isMain && !params.length) return "int main(void) {";
      return `${ret} ${name}(${typed("int") || "void"}) {`;
  }
}

/* --------------------------------- blocks --------------------------------- */

function emitNodes(nodes: SNode[], lang: CodeLang, doc: StruktoDoc, depth: number, out: string[]) {
  const before = out.length;
  for (const n of nodes) emitNode(n, lang, doc, depth, out);
  // python needs a statement in every block (a comment alone is not enough)
  if (lang === "python" && !out.slice(before).some((l) => !l.trim().startsWith("#")))
    out.push(`${ind(depth)}pass`);
}

const endsWithJump = (nodes: SNode[]) => {
  const last = nodes.at(-1);
  return last?.kind === "terminator";
};

function emitNode(n: SNode, lang: CodeLang, doc: StruktoDoc, d: number, out: string[]) {
  const py = lang === "python";
  const p = ind(d);
  switch (n.kind) {
    case "statement":
      out.push(p + stmt(lang, n.text));
      break;
    case "comment":
      n.text
        .trim()
        .split("\n")
        .forEach((line) => out.push(`${p}${py ? "#" : "//"} ${line}`.trimEnd()));
      break;
    case "terminator": {
      if (n.variant === "return") {
        const value = translate(lang, returnValue(n.text), false);
        out.push(p + `return ${value}`.trim() + (py ? "" : ";"));
      } else out.push(p + (py ? n.variant : `${n.variant};`));
      break;
    }
    case "call": {
      const fn = doc.functions[n.funcId];
      const name = sanitize(fn?.name ?? "unknownFunction");
      const call = `${name}(${translate(lang, n.args?.trim() ?? "", false)})`;
      out.push(p + (py ? call : `${call};`));
      break;
    }
    case "if": {
      out.push(py ? `${p}if ${cond(lang, n.cond)}:` : `${p}if (${cond(lang, n.cond)}) {`);
      emitNodes(n.then, lang, doc, d + 1, out);
      if (n.else.length === 1 && n.else[0]!.kind === "if") {
        const chain: string[] = [];
        emitNode(n.else[0]!, lang, doc, d, chain);
        chain[0] = chain[0]!.replace(/^(\s*)if /, py ? "$1elif " : "$1} else if ");
        out.push(...chain);
        break;
      }
      if (n.else.length) {
        out.push(py ? `${p}else:` : `${p}} else {`);
        emitNodes(n.else, lang, doc, d + 1, out);
      }
      if (!py) out.push(`${p}}`);
      break;
    }
    case "while": {
      out.push(py ? `${p}while ${cond(lang, n.cond)}:` : `${p}while (${cond(lang, n.cond)}) {`);
      emitNodes(n.body, lang, doc, d + 1, out);
      if (!py) out.push(`${p}}`);
      break;
    }
    case "dowhile": {
      if (py) {
        out.push(`${p}while True:`);
        emitNodes(n.body, lang, doc, d + 1, out);
        out.push(`${ind(d + 1)}if not (${cond(lang, n.cond)}):`);
        out.push(`${ind(d + 2)}break`);
      } else {
        out.push(`${p}do {`);
        emitNodes(n.body, lang, doc, d + 1, out);
        out.push(`${p}} while (${cond(lang, n.cond)});`);
      }
      break;
    }
    case "for": {
      out.push(p + forHeader(lang, n.cond));
      emitNodes(n.body, lang, doc, d + 1, out);
      if (!py) out.push(`${p}}`);
      break;
    }
    case "switch": {
      const expr = translate(lang, bare(n.expr), false) || "value";
      if (py) {
        // match has no fall-through: a trailing `break` would leave an enclosing loop instead
        const body = (list: SNode[]) =>
          list.at(-1)?.kind === "terminator" &&
          (list.at(-1) as { variant: string }).variant === "break"
            ? list.slice(0, -1)
            : list;
        out.push(`${p}match ${expr}:`);
        for (const c of n.cases) {
          out.push(`${ind(d + 1)}case ${bare(c.label) || "_"}:`);
          emitNodes(body(c.body), lang, doc, d + 2, out);
        }
        out.push(`${ind(d + 1)}case _:`);
        emitNodes(body(n.defaultCase.body), lang, doc, d + 2, out);
      } else {
        out.push(`${p}switch (${expr}) {`);
        for (const c of [...n.cases, n.defaultCase]) {
          const isDefault = c === n.defaultCase;
          out.push(`${ind(d + 1)}${isDefault ? "default" : `case ${bare(c.label) || "0"}`}:`);
          emitNodes(c.body, lang, doc, d + 2, out);
          // no second `break` after a block that already jumps away
          if (!endsWithJump(c.body)) out.push(`${ind(d + 2)}break;`);
        }
        out.push(`${p}}`);
      }
      break;
    }
  }
}

function emitFunction(
  fn: StruktoFunction,
  lang: CodeLang,
  doc: StruktoDoc,
  depth: number,
): string[] {
  const isMain = fn.id === doc.mainId;
  const out = [ind(depth) + signature(fn, lang, isMain)];
  emitNodes(fn.body, lang, doc, depth + 1, out);
  if (lang === "c" && isMain && !parseParams(fn.params).length && !endsWithJump(fn.body))
    out.push(`${ind(depth + 1)}return 0;`);
  if (lang !== "python") out.push(`${ind(depth)}}`);
  return out;
}

export interface GenerateOptions {
  /** only this function (plus nothing else) instead of the whole document */
  onlyFuncId?: string;
  className?: string;
}

/** Functions to emit: every non-orphaned one, plus orphaned ones that are still called. */
function functionsToEmit(doc: StruktoDoc): StruktoFunction[] {
  const keep = new Set(
    Object.values(doc.functions)
      .filter((f) => !f.orphaned)
      .map((f) => f.id),
  );
  const queue = [...keep];
  while (queue.length) {
    const fn = doc.functions[queue.pop()!];
    if (!fn) continue;
    walk(fn.body, (n) => {
      if (n.kind === "call" && doc.functions[n.funcId] && !keep.has(n.funcId)) {
        keep.add(n.funcId);
        queue.push(n.funcId);
      }
    });
  }
  return Object.values(doc.functions).filter((f) => keep.has(f.id));
}

export function generateCode(doc: StruktoDoc, lang: CodeLang, opts: GenerateOptions = {}): string {
  const all = functionsToEmit(doc);
  const main = doc.functions[doc.mainId];
  const list = opts.onlyFuncId
    ? [doc.functions[opts.onlyFuncId]].filter((v): v is StruktoFunction => !!v)
    : [...all.filter((f) => f.id !== doc.mainId), ...(main ? [main] : [])];

  const lines: string[] = [];
  const header = `${lang === "python" ? "#" : "//"} Generated from ${doc.name || "Struktogramm"}`;
  lines.push(header, "");

  if (lang === "c") {
    lines.push("#include <stdio.h>", "#include <stdbool.h>", "");
    const protos = list
      .filter((f) => f.id !== doc.mainId)
      .map((f) => signature(f, lang, false).replace(/ \{$/, ";"));
    if (protos.length) lines.push(...protos, "");
  }

  if (lang === "java") {
    const cls = sanitize(opts.className || doc.name || "Main");
    lines.push(`public class ${cls.charAt(0).toUpperCase() + cls.slice(1)} {`);
    list.forEach((fn, i) => {
      if (i) lines.push("");
      lines.push(...emitFunction(fn, lang, doc, 1));
    });
    lines.push("}");
    return lines.join("\n") + "\n";
  }

  list.forEach((fn, i) => {
    if (i) lines.push("");
    lines.push(...emitFunction(fn, lang, doc, 0));
  });

  if (!opts.onlyFuncId && main && !parseParams(main.params).length) {
    if (lang === "python")
      lines.push("", `if __name__ == "__main__":`, `${IND}${sanitize(main.name)}()`);
    if (lang === "javascript") lines.push("", `${sanitize(main.name)}();`);
  }

  return lines.join("\n") + "\n";
}
