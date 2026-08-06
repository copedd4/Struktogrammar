import { makeNode, uid, uniqueFunctionName } from "./model";
import type { SNode, StruktoDoc, StruktoFunction, SwitchCase, TerminatorVariant } from "./types";

export interface ImportResult {
  doc: StruktoDoc;
  warnings: string[];
}

const statement = (text: string): SNode => ({ kind: "statement", id: uid(), text: text.trim() });
const comment = (text: string): SNode => ({ kind: "comment", id: uid(), text: text.trim() });
const terminator = (variant: TerminatorVariant, text = ""): SNode => ({
  kind: "terminator",
  id: uid(),
  variant,
  text: text.trim(),
});
const emptyCase = (label: string): SwitchCase => ({ id: uid(), label, body: [] });

const parens = (s: string) => {
  const a = s.indexOf("(");
  const b = s.lastIndexOf(")");
  return a >= 0 && b > a ? s.slice(a + 1, b).trim() : s.replace(/^\w+\s*/, "").trim();
};

/* ------------------------------------------------------------------ *
 * shared: turn a raw "call or statement" line into a node
 * ------------------------------------------------------------------ */
function leafNode(raw: string, funcNames: Map<string, string>): SNode {
  const text = raw.trim();
  if (!text) return statement("");
  if (text.startsWith("//") || text.startsWith("#") || text.startsWith("*"))
    return comment(text.replace(/^(\/\/+|#+|\*+)\s?/, ""));
  const ret = /^return\b\s*(.*)$/.exec(text);
  if (ret) return terminator("return", ret[1] ?? "");
  if (/^break$/.test(text)) return terminator("break");
  if (/^continue$/.test(text)) return terminator("continue");
  const call = /^(?:await\s+)?(\w+)\s*\(\s*\)$/.exec(text);
  if (call) {
    const id = funcNames.get(call[1]!.toLowerCase());
    if (id) return { kind: "call", id: uid(), funcId: id };
  }
  return statement(text);
}

/* ------------------------------------------------------------------ *
 * C-like tokenizer: split on newlines, braces and top-level semicolons
 * ------------------------------------------------------------------ */
function tokenize(src: string): string[] {
  const out: string[] = [];
  let buf = "";
  let depth = 0;
  const push = () => {
    const t = buf.trim();
    if (t) out.push(t);
    buf = "";
  };
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (ch === "(" || ch === "[") depth++;
    if (ch === ")" || ch === "]") depth = Math.max(0, depth - 1);
    if (ch === "{" || ch === "}") {
      push();
      out.push(ch);
      continue;
    }
    if (ch === "\n") {
      push();
      continue;
    }
    if (ch === ";" && depth === 0) {
      push();
      continue;
    }
    buf += ch;
  }
  push();
  return out;
}

const FN_HEADER =
  /^(?:export\s+|public\s+|private\s+|protected\s+|static\s+|final\s+|async\s+)*(?:function\s+)?(?:[\w<>\[\],\s*]+?\s+)?([A-Za-z_]\w*)\s*\(([^)]*)\)\s*(?:const)?\s*$/;

const KEYWORDS = new Set(["if", "else", "while", "for", "switch", "do", "return", "catch", "class"]);

interface CParser {
  toks: string[];
  i: number;
}

function parseCSeqInner(
  p: CParser,
  names: Map<string, string>,
  fns: StruktoFunction[],
  stopAfterOne: boolean,
): SNode[] {
  const collected: SNode[] = [];
  while (p.i < p.toks.length) {
    const before = p.i;
    const chunk = parseChunk(p, names, fns);
    if (chunk === "stop") break;
    if (chunk) collected.push(...chunk);
    if (p.i === before) p.i++;
    if (stopAfterOne && collected.length) break;
  }
  return collected;
}

function parseBraced(p: CParser, names: Map<string, string>, fns: StruktoFunction[]): SNode[] {
  if (p.toks[p.i] === "{") {
    p.i++;
    const body = parseCSeqInner(p, names, fns, false);
    if (p.toks[p.i] === "}") p.i++;
    return body;
  }
  // brace-less single statement
  const one = parseChunk(p, names, fns);
  return one && one !== "stop" ? one : [];
}

function parseElseTail(p: CParser, names: Map<string, string>, fns: StruktoFunction[]): SNode[] {
  if (p.toks[p.i] && /^else\b/.test(p.toks[p.i]!)) {
    const tok = p.toks[p.i]!;
    p.i++;
    if (/^else\s+if\b/.test(tok)) {
      const inner = makeNode("if") as Extract<SNode, { kind: "if" }>;
      inner.cond = parens(tok);
      inner.then = parseBraced(p, names, fns);
      inner.else = parseElseTail(p, names, fns);
      return [inner];
    }
    return parseBraced(p, names, fns);
  }
  return [];
}

/** parse one token (and whatever it owns); "stop" means a closing brace/case label */
function parseChunk(
  p: CParser,
  names: Map<string, string>,
  fns: StruktoFunction[],
): SNode[] | "stop" | null {
  const tok = p.toks[p.i];
  if (tok === undefined) return "stop";
  if (tok === "}") return "stop";
  if (/^(case\s+[^:]+:|default\s*:)/.test(tok)) return "stop";
  p.i++;

  if (tok === "{") {
    const body = parseCSeqInner(p, names, fns, false);
    if (p.toks[p.i] === "}") p.i++;
    return body;
  }
  if (/^#include|^#define|^package\b|^import\b|^using\b/.test(tok)) return null;
  if (/^\/\*|\*\/$/.test(tok)) return [leafNode(tok.replace(/\/\*|\*\//g, ""), names)];

  if (/^if\b/.test(tok)) {
    const node = makeNode("if") as Extract<SNode, { kind: "if" }>;
    node.cond = parens(tok);
    node.then = parseBraced(p, names, fns);
    node.else = parseElseTail(p, names, fns);
    return [node];
  }
  if (/^while\b/.test(tok)) {
    const node = makeNode("while") as Extract<SNode, { kind: "while" }>;
    node.cond = parens(tok);
    node.body = parseBraced(p, names, fns);
    return [node];
  }
  if (/^do\b/.test(tok)) {
    const node = makeNode("dowhile") as Extract<SNode, { kind: "dowhile" }>;
    node.body = parseBraced(p, names, fns);
    const tail = p.toks[p.i];
    if (tail && /^while\b/.test(tail)) {
      node.cond = parens(tail);
      p.i++;
    }
    return [node];
  }
  if (/^for\b/.test(tok)) {
    const node = makeNode("for") as Extract<SNode, { kind: "for" }>;
    node.cond = parens(tok);
    node.body = parseBraced(p, names, fns);
    return [node];
  }
  if (/^switch\b/.test(tok)) {
    const node = makeNode("switch") as Extract<SNode, { kind: "switch" }>;
    node.expr = parens(tok);
    node.cases = [];
    node.defaultCase = emptyCase("default");
    if (p.toks[p.i] === "{") {
      p.i++;
      let target: SwitchCase | null = null;
      while (p.i < p.toks.length && p.toks[p.i] !== "}") {
        const t = p.toks[p.i]!;
        const c = /^case\s+([^:]+):\s*(.*)$/.exec(t);
        if (c) {
          target = emptyCase(c[1]!.trim());
          node.cases.push(target);
          const rest = (c[2] ?? "").trim();
          if (rest) p.toks.splice(p.i, 1, rest);
          else p.i++;
          continue;
        }
        const dm = /^default\s*:\s*(.*)$/.exec(t);
        if (dm) {
          target = node.defaultCase;
          const rest = (dm[1] ?? "").trim();
          if (rest) p.toks.splice(p.i, 1, rest);
          else p.i++;
          continue;
        }
        const before = p.i;
        const chunk = parseChunk(p, names, fns);
        if (p.i === before) p.i++;
        if (chunk && chunk !== "stop") {
          const bucket = target ?? node.defaultCase;
          for (const n of chunk) {
            if (n.kind === "terminator" && n.variant === "break" && !n.text) continue;
            bucket.body.push(n);
          }
        }
      }
      if (p.toks[p.i] === "}") p.i++;
    }
    if (!node.cases.length) node.cases = [emptyCase("A")];
    return [node];
  }

  const fnMatch = FN_HEADER.exec(tok);
  if (fnMatch && !KEYWORDS.has(fnMatch[1]!) && p.toks[p.i] === "{") {
    const name = fnMatch[1]!;
    const body = parseBraced(p, names, fns);
    const existing = fns.find((f) => f.name === name);
    if (existing) existing.body = body;
    else fns.push({ id: names.get(name.toLowerCase()) ?? uid(), name, body });
    return null;
  }
  if (/\bclass\b/.test(tok) && p.toks[p.i] === "{") return parseBraced(p, names, fns);

  return [leafNode(tok, names)];
}

/* ------------------------------------------------------------------ *
 * Python (indentation based)
 * ------------------------------------------------------------------ */
interface PyLine {
  indent: number;
  text: string;
}

function pyLines(src: string): PyLine[] {
  return src
    .split("\n")
    .filter((l) => l.trim().length)
    .map((l) => ({ indent: l.match(/^\s*/)![0].replace(/\t/g, "    ").length, text: l.trim() }));
}

function parsePyBlock(
  lines: PyLine[],
  start: number,
  indent: number,
  names: Map<string, string>,
  fns: StruktoFunction[],
): { nodes: SNode[]; next: number } {
  const nodes: SNode[] = [];
  let i = start;
  while (i < lines.length && lines[i]!.indent >= indent) {
    const line = lines[i]!;
    if (line.indent > indent) {
      i++;
      continue;
    }
    const text = line.text;
    const childIndent = lines[i + 1]?.indent ?? indent;
    const block = () => {
      const r = parsePyBlock(lines, i + 1, Math.max(childIndent, indent + 1), names, fns);
      i = r.next;
      return r.nodes;
    };

    let m: RegExpExecArray | null;
    if ((m = /^def\s+(\w+)\s*\(([^)]*)\)\s*:$/.exec(text))) {
      const name = m[1]!;
      const body = block();
      const existing = fns.find((f) => f.name === name);
      if (existing) existing.body = body;
      else fns.push({ id: names.get(name.toLowerCase()) ?? uid(), name, body });
      continue;
    }
    if ((m = /^if\s+(.+):$/.exec(text))) {
      if (/^__name__\s*==/.test(m[1]!)) {
        block();
        continue;
      }
      const node = makeNode("if") as Extract<SNode, { kind: "if" }>;
      node.cond = m[1]!.trim();
      node.then = block();
      while (i < lines.length && lines[i]!.indent === indent && /^elif\s+(.+):$/.test(lines[i]!.text)) {
        const em = /^elif\s+(.+):$/.exec(lines[i]!.text)!;
        const inner = makeNode("if") as Extract<SNode, { kind: "if" }>;
        inner.cond = em[1]!.trim();
        const ci = lines[i + 1]?.indent ?? indent;
        const r = parsePyBlock(lines, i + 1, Math.max(ci, indent + 1), names, fns);
        inner.then = r.nodes;
        i = r.next;
        node.else = [inner];
      }
      if (i < lines.length && lines[i]!.indent === indent && /^else\s*:$/.test(lines[i]!.text)) {
        const ci = lines[i + 1]?.indent ?? indent;
        const r = parsePyBlock(lines, i + 1, Math.max(ci, indent + 1), names, fns);
        if (node.else.length && node.else[0]!.kind === "if")
          (node.else[0] as Extract<SNode, { kind: "if" }>).else = r.nodes;
        else node.else = r.nodes;
        i = r.next;
      }
      nodes.push(node);
      continue;
    }
    if ((m = /^while\s+(.+):$/.exec(text))) {
      const node = makeNode("while") as Extract<SNode, { kind: "while" }>;
      node.cond = m[1]!.trim();
      node.body = block();
      nodes.push(node);
      continue;
    }
    if ((m = /^for\s+(.+):$/.exec(text))) {
      const node = makeNode("for") as Extract<SNode, { kind: "for" }>;
      node.cond = m[1]!.trim();
      node.body = block();
      nodes.push(node);
      continue;
    }
    if ((m = /^match\s+(.+):$/.exec(text))) {
      const node = makeNode("switch") as Extract<SNode, { kind: "switch" }>;
      node.expr = m[1]!.trim();
      node.cases = [];
      node.defaultCase = emptyCase("default");
      const bodyIndent = Math.max(lines[i + 1]?.indent ?? indent + 1, indent + 1);
      i++;
      while (i < lines.length && lines[i]!.indent >= bodyIndent) {
        const cm = /^case\s+(.+):$/.exec(lines[i]!.text);
        if (!cm) {
          i++;
          continue;
        }
        const label = cm[1]!.trim();
        const ci = lines[i + 1]?.indent ?? bodyIndent + 1;
        const r = parsePyBlock(lines, i + 1, Math.max(ci, bodyIndent + 1), names, fns);
        i = r.next;
        if (label === "_") node.defaultCase.body = r.nodes;
        else node.cases.push({ id: uid(), label, body: r.nodes });
      }
      if (!node.cases.length) node.cases = [emptyCase("A")];
      nodes.push(node);
      continue;
    }
    if (/^(pass|\.\.\.)$/.test(text)) {
      i++;
      continue;
    }
    if (/^(import|from)\s/.test(text)) {
      i++;
      continue;
    }
    nodes.push(leafNode(text, names));
    i++;
  }
  return { nodes, next: i };
}

/* ------------------------------------------------------------------ */

const looksPython = (src: string) =>
  /^\s*def\s+\w+\s*\(/m.test(src) || (/:\s*$/m.test(src) && !/[{}]/.test(src));

function collectNames(src: string): string[] {
  const names: string[] = [];
  const re = /(?:^|\n)\s*(?:export\s+|public\s+|private\s+|protected\s+|static\s+|final\s+|async\s+)*(?:function|def|void|int|float|double|char|bool|boolean|long|short|String)\s+([A-Za-z_]\w*)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) if (!names.includes(m[1]!)) names.push(m[1]!);
  return names;
}

export function importCode(src: string, docName = "Imported"): ImportResult {
  const warnings: string[] = [];
  const declared = collectNames(src);
  const names = new Map<string, string>();
  declared.forEach((n) => names.set(n.toLowerCase(), uid()));

  const fns: StruktoFunction[] = [];
  let loose: SNode[] = [];

  if (looksPython(src)) {
    const r = parsePyBlock(pyLines(src), 0, 0, names, fns);
    loose = r.nodes;
  } else {
    const p: CParser = { toks: tokenize(src), i: 0 };
    loose = parseCSeqInner(p, names, fns, false);
  }

  // pick the entry point
  let main = fns.find((f) => f.name.toLowerCase() === "main");
  if (!main) {
    main = { id: uid(), name: "main", body: loose.length ? loose : [statement("")] };
    fns.unshift(main);
  } else if (loose.length) {
    main.body = [...main.body, ...loose.filter((n) => !(n.kind === "call" && n.funcId === main!.id))];
  }

  const doc: StruktoDoc = {
    version: 1,
    format: "stkg",
    name: docName,
    mainId: main.id,
    functions: {},
  };
  for (const fn of fns) {
    fn.name = uniqueFunctionName(doc, fn.name, fn.id);
    doc.functions[fn.id] = fn;
  }

  // rewire calls to functions we never saw a definition for
  const known = new Set(Object.keys(doc.functions));
  Object.values(doc.functions).forEach((fn) => {
    const fix = (list: SNode[]) => {
      list.forEach((n) => {
        if (n.kind === "call" && !known.has(n.funcId)) warnings.push(n.funcId);
        if (n.kind === "if") {
          fix(n.then);
          fix(n.else);
        } else if (n.kind === "while" || n.kind === "dowhile" || n.kind === "for") fix(n.body);
        else if (n.kind === "switch") {
          n.cases.forEach((c) => fix(c.body));
          fix(n.defaultCase.body);
        }
      });
    };
    fix(fn.body);
  });

  if (!Object.keys(doc.functions).length) throw new Error("no code");
  return { doc, warnings };
}
