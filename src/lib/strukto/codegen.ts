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

const stmt = (lang: CodeLang, text: string) => {
  const s = bare(text) || (lang === "python" ? "pass" : "/* … */");
  return lang === "python" ? s : `${s};`;
};

const cond = (text: string) => bare(text) || "true";

/** `for` headers: keep whatever the user typed, wrap for C-like languages */
function forHeader(lang: CodeLang, raw: string): string {
  const c = bare(raw) || "i = 0; i < n; i++";
  if (lang === "python") {
    const m = /^\s*(\w+)\s*=\s*(.+?)\s*(?:to|bis|\.\.)\s*(.+?)\s*$/i.exec(c);
    if (m) return `for ${m[1]} in range(${m[2]}, ${m[3]} + 1):`;
    return `for ${c.replace(/^for\s+/i, "")}:`;
  }
  const inner = c.replace(/^for\s*/i, "").replace(/^\(|\)$/g, "");
  return `for (${inner}) {`;
}

function emitNodes(
  nodes: SNode[],
  lang: CodeLang,
  doc: StruktoDoc,
  depth: number,
  out: string[],
) {
  if (nodes.length === 0) {
    if (lang === "python") out.push(`${ind(depth)}pass`);
    return;
  }
  for (const n of nodes) emitNode(n, lang, doc, depth, out);
}

function emitNode(n: SNode, lang: CodeLang, doc: StruktoDoc, d: number, out: string[]) {
  const py = lang === "python";
  const p = ind(d);
  switch (n.kind) {
    case "statement":
      out.push(p + stmt(lang, n.text));
      break;
    case "comment":
      bare(n.text)
        .split("\n")
        .forEach((line) => out.push(`${p}${py ? "#" : "//"} ${line}`.trimEnd()));
      break;
    case "terminator": {
      const extra = bare(n.text);
      if (n.variant === "return") out.push(p + (py ? `return ${extra}`.trim() : `return ${extra}`.trim() + ";"));
      else out.push(p + (py ? n.variant : `${n.variant};`));
      break;
    }
    case "call": {
      const fn = doc.functions[n.funcId];
      const name = sanitize(fn?.name ?? "unknownFunction");
      out.push(p + (py ? `${name}()` : `${name}();`));
      break;
    }
    case "if": {
      if (py) {
        out.push(`${p}if ${cond(n.cond)}:`);
        emitNodes(n.then, lang, doc, d + 1, out);
        if (n.else.length === 1 && n.else[0]!.kind === "if") {
          const chain: string[] = [];
          emitNode(n.else[0]!, lang, doc, d, chain);
          chain[0] = chain[0]!.replace(/^(\s*)if /, "$1elif ");
          out.push(...chain);
        } else if (n.else.length) {
          out.push(`${p}else:`);
          emitNodes(n.else, lang, doc, d + 1, out);
        }
      } else {
        out.push(`${p}if (${cond(n.cond)}) {`);
        emitNodes(n.then, lang, doc, d + 1, out);
        if (n.else.length === 1 && n.else[0]!.kind === "if") {
          const chain: string[] = [];
          emitNode(n.else[0]!, lang, doc, d, chain);
          chain[0] = chain[0]!.replace(/^(\s*)if /, "$1} else if ");
          out.push(...chain);
          break;
        } else if (n.else.length) {
          out.push(`${p}} else {`);
          emitNodes(n.else, lang, doc, d + 1, out);
        }
        out.push(`${p}}`);
      }
      break;
    }
    case "while": {
      if (py) {
        out.push(`${p}while ${cond(n.cond)}:`);
        emitNodes(n.body, lang, doc, d + 1, out);
      } else {
        out.push(`${p}while (${cond(n.cond)}) {`);
        emitNodes(n.body, lang, doc, d + 1, out);
        out.push(`${p}}`);
      }
      break;
    }
    case "dowhile": {
      if (py) {
        out.push(`${p}while True:`);
        emitNodes(n.body, lang, doc, d + 1, out);
        out.push(`${ind(d + 1)}if not (${cond(n.cond)}):`);
        out.push(`${ind(d + 2)}break`);
      } else {
        out.push(`${p}do {`);
        emitNodes(n.body, lang, doc, d + 1, out);
        out.push(`${p}} while (${cond(n.cond)});`);
      }
      break;
    }
    case "for": {
      if (py) {
        out.push(p + forHeader(lang, n.cond));
        emitNodes(n.body, lang, doc, d + 1, out);
      } else {
        out.push(p + forHeader(lang, n.cond));
        emitNodes(n.body, lang, doc, d + 1, out);
        out.push(`${p}}`);
      }
      break;
    }
    case "switch": {
      const expr = bare(n.expr) || "value";
      if (py) {
        out.push(`${p}match ${expr}:`);
        for (const c of n.cases) {
          out.push(`${ind(d + 1)}case ${bare(c.label) || "_"}:`);
          emitNodes(c.body, lang, doc, d + 2, out);
        }
        out.push(`${ind(d + 1)}case _:`);
        emitNodes(n.defaultCase.body, lang, doc, d + 2, out);
      } else {
        out.push(`${p}switch (${expr}) {`);
        for (const c of n.cases) {
          out.push(`${ind(d + 1)}case ${bare(c.label) || "0"}:`);
          emitNodes(c.body, lang, doc, d + 2, out);
          out.push(`${ind(d + 2)}break;`);
        }
        out.push(`${ind(d + 1)}default:`);
        emitNodes(n.defaultCase.body, lang, doc, d + 2, out);
        out.push(`${ind(d + 2)}break;`);
        out.push(`${p}}`);
      }
      break;
    }
  }
}

function emitFunction(fn: StruktoFunction, lang: CodeLang, doc: StruktoDoc, depth: number): string[] {
  const name = sanitize(fn.name);
  const out: string[] = [];
  switch (lang) {
    case "python":
      out.push(`${ind(depth)}def ${name}():`);
      emitNodes(fn.body, lang, doc, depth + 1, out);
      break;
    case "javascript":
      out.push(`${ind(depth)}function ${name}() {`);
      emitNodes(fn.body, lang, doc, depth + 1, out);
      out.push(`${ind(depth)}}`);
      break;
    case "java":
      out.push(`${ind(depth)}${name === "main" ? "public static void main(String[] args)" : `static void ${name}()`} {`);
      emitNodes(fn.body, lang, doc, depth + 1, out);
      out.push(`${ind(depth)}}`);
      break;
    case "c":
      out.push(`${ind(depth)}${name === "main" ? "int main(void)" : `void ${name}(void)`} {`);
      emitNodes(fn.body, lang, doc, depth + 1, out);
      if (name === "main") out.push(`${ind(depth + 1)}return 0;`);
      out.push(`${ind(depth)}}`);
      break;
  }
  return out;
}

export interface GenerateOptions {
  /** only this function (plus nothing else) instead of the whole document */
  onlyFuncId?: string;
  className?: string;
}

export function generateCode(doc: StruktoDoc, lang: CodeLang, opts: GenerateOptions = {}): string {
  const all = Object.values(doc.functions).filter((f) => !f.orphaned);
  const main = doc.functions[doc.mainId];
  const list = opts.onlyFuncId
    ? [doc.functions[opts.onlyFuncId]].filter(Boolean as unknown as (v: StruktoFunction | undefined) => v is StruktoFunction)
    : [...all.filter((f) => f.id !== doc.mainId), ...(main ? [main] : [])];

  const lines: string[] = [];
  const header = `${lang === "python" ? "#" : "//"} Generated from ${doc.name || "Struktogramm"}`;
  lines.push(header, "");

  if (lang === "c") {
    lines.push("#include <stdio.h>", "#include <stdbool.h>", "");
    list.forEach((fn) => {
      if (fn.id !== doc.mainId) lines.push(`void ${sanitize(fn.name)}(void);`);
    });
    if (list.some((f) => f.id !== doc.mainId)) lines.push("");
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

  if (lang === "python" && main) {
    lines.push("", `if __name__ == "__main__":`, `${IND}${sanitize(main.name)}()`);
  }
  if (lang === "javascript" && main) lines.push("", `${sanitize(main.name)}();`);

  return lines.join("\n") + "\n";
}
