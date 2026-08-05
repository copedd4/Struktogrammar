import type {
  BlockKind,
  SNode,
  StruktoDoc,
  StruktoFunction,
  SwitchCase,
  TerminatorVariant,
} from "./types";

export const uid = () => Math.random().toString(36).slice(2, 10);

/** A list of nodes is addressed by "<ownerId>:<slot>", root list is "root:body". */
export const ROOT_LIST = "root:body";
export const listKey = (ownerId: string, slot: string) => `${ownerId}:${slot}`;

export function newCase(label: string): SwitchCase {
  return { id: uid(), label, body: [] };
}

export function makeNode(kind: BlockKind, opts: { funcId?: string; variant?: TerminatorVariant } = {}): SNode {
  const id = uid();
  switch (kind) {
    case "statement":
      return { kind, id, text: "" };
    case "if":
      return { kind, id, cond: "", then: [], else: [] };
    case "while":
    case "dowhile":
    case "for":
      return { kind, id, cond: "", body: [] };
    case "switch":
      return {
        kind,
        id,
        expr: "",
        cases: [newCase("A"), newCase("B"), newCase("C")],
        defaultCase: { id: uid(), label: "default", body: [] },
      };
    case "call":
      return { kind, id, funcId: opts.funcId ?? "" };
    case "terminator":
      return { kind, id, variant: opts.variant ?? "break", text: "" };
    case "comment":
      return { kind, id, text: "" };
  }
}

export function emptyDoc(name = "Untitled"): StruktoDoc {
  const mainId = uid();
  return {
    version: 1,
    format: "stkg",
    name,
    mainId,
    functions: {
      [mainId]: { id: mainId, name: "main", body: [makeNode("statement")] },
    },
  };
}

export function newFunction(name: string): StruktoFunction {
  return { id: uid(), name, body: [] };
}

/** Function names are globally unique; returns `name`, or `name2`, `name3`… if taken. */
export function uniqueFunctionName(doc: StruktoDoc, desired: string, excludeId?: string): string {
  const base = desired.trim() || "function";
  const taken = new Set(
    Object.values(doc.functions)
      .filter((f) => f.id !== excludeId)
      .map((f) => f.name.trim().toLowerCase()),
  );
  if (!taken.has(base.toLowerCase())) return base;
  let i = 2;
  while (taken.has(`${base}${i}`.toLowerCase())) i++;
  return `${base}${i}`;
}

/** Resolve a list reference inside a (mutable) function body. */
export function resolveList(fn: StruktoFunction, key: string): SNode[] | null {
  if (key === ROOT_LIST) return fn.body;
  const [ownerId = "", slot = ""] = key.split(":");
  const found = findNode(fn.body, ownerId);
  if (!found) return null;
  const n = found.node;
  if (n.kind === "if") return slot === "else" ? n.else : n.then;
  if (n.kind === "while" || n.kind === "dowhile" || n.kind === "for") return n.body;
  if (n.kind === "switch") {
    if (slot === "default") return n.defaultCase.body;
    const c = n.cases.find((x) => x.id === slot);
    return c ? c.body : null;
  }
  return null;
}

export function findNode(
  body: SNode[],
  id: string,
): { node: SNode; list: SNode[]; index: number } | null {
  for (let i = 0; i < body.length; i++) {
    const n = body[i]!;
    if (n.id === id) return { node: n, list: body, index: i };
    for (const child of childLists(n)) {
      const hit = findNode(child, id);
      if (hit) return hit;
    }
  }
  return null;
}

export function childLists(n: SNode): SNode[][] {
  if (n.kind === "if") return [n.then, n.else];
  if (n.kind === "while" || n.kind === "dowhile" || n.kind === "for") return [n.body];
  if (n.kind === "switch") return [...n.cases.map((c) => c.body), n.defaultCase.body];
  return [];
}

export function walk(body: SNode[], visit: (n: SNode) => void) {
  for (const n of body) {
    visit(n);
    childLists(n).forEach((l) => walk(l, visit));
  }
}

export function reId(node: SNode): SNode {
  const clone = structuredClone(node);
  const fix = (n: SNode) => {
    n.id = uid();
    if (n.kind === "switch") {
      n.cases.forEach((c) => (c.id = uid()));
      n.defaultCase.id = uid();
    }
    childLists(n).forEach((l) => l.forEach(fix));
  };
  fix(clone);
  return clone;
}

export function countNodes(fn: StruktoFunction): number {
  let c = 0;
  walk(fn.body, () => c++);
  return c;
}

export function callsFunction(doc: StruktoDoc, funcId: string): string[] {
  const users: string[] = [];
  Object.values(doc.functions).forEach((f) => {
    walk(f.body, (n) => {
      if (n.kind === "call" && n.funcId === funcId && !users.includes(f.id)) users.push(f.id);
    });
  });
  return users;
}

export interface Issue {
  funcId: string;
  nodeId: string;
  message: "emptyCondition" | "emptyStatement" | "emptyCase" | "missingFunction";
}

export function validate(doc: StruktoDoc): Issue[] {
  const issues: Issue[] = [];
  Object.values(doc.functions).forEach((fn) => {
    if (fn.orphaned) return;
    walk(fn.body, (n) => {
      const push = (message: Issue["message"]) =>
        issues.push({ funcId: fn.id, nodeId: n.id, message });
      if (n.kind === "statement" && !n.text.trim()) push("emptyStatement");
      if ((n.kind === "if" || n.kind === "while" || n.kind === "dowhile" || n.kind === "for") && !n.cond.trim())
        push("emptyCondition");
      if (n.kind === "switch") {
        if (!n.expr.trim()) push("emptyCondition");
        if (n.cases.some((c) => !c.label.trim())) push("emptyCase");
      }
      if (n.kind === "call" && (!n.funcId || !doc.functions[n.funcId])) push("missingFunction");
    });
  });
  return issues;
}

/** Find the list key + index that contains a node. */
export function locate(fn: StruktoFunction, nodeId: string): { key: string; index: number } | null {
  const search = (list: SNode[], key: string): { key: string; index: number } | null => {
    for (let i = 0; i < list.length; i++) {
      const n = list[i]!;
      if (n.id === nodeId) return { key, index: i };
      if (n.kind === "if") {
        const a = search(n.then, listKey(n.id, "then")) ?? search(n.else, listKey(n.id, "else"));
        if (a) return a;
      } else if (n.kind === "while" || n.kind === "dowhile" || n.kind === "for") {
        const a = search(n.body, listKey(n.id, "body"));
        if (a) return a;
      } else if (n.kind === "switch") {
        for (const c of n.cases) {
          const a = search(c.body, listKey(n.id, c.id));
          if (a) return a;
        }
        const d = search(n.defaultCase.body, listKey(n.id, "default"));
        if (d) return d;
      }
    }
    return null;
  };
  return search(fn.body, ROOT_LIST);
}
