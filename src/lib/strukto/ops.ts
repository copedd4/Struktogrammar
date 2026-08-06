import { useCallback, useMemo } from "react";
import { findNode, makeNode, newCase, newFunction, reId, resolveList, uniqueFunctionName } from "./model";
import { useStrukto } from "./store";
import type { SNode, StruktoDoc } from "./types";

export function useOps() {
  const { mutate, doc } = useStrukto();

  const insert = useCallback(
    (funcId: string, key: string, index: number, node: SNode) => {
      mutate((d) => {
        const fn = d.functions[funcId];
        if (!fn) return;
        const list = resolveList(fn, key);
        if (!list) return;
        list.splice(Math.max(0, Math.min(index, list.length)), 0, node);
      }, "histInsert");
    },
    [mutate],
  );

  const remove = useCallback(
    (funcId: string, nodeId: string) => {
      mutate((d) => {
        const fn = d.functions[funcId];
        if (!fn) return;
        const hit = findNode(fn.body, nodeId);
        if (hit) hit.list.splice(hit.index, 1);
      }, "histDelete");
    },
    [mutate],
  );

  /** Delete a block but splice its nested children into its place. */
  const removeKeepChildren = useCallback(
    (funcId: string, nodeId: string) => {
      mutate((d) => {
        const fn = d.functions[funcId];
        if (!fn) return;
        const hit = findNode(fn.body, nodeId);
        if (!hit) return;
        hit.list.splice(hit.index, 1, ...childBlocks(hit.node));
      }, "histDelete");
    },
    [mutate],
  );

  const update = useCallback(
    (funcId: string, nodeId: string, patch: (n: SNode) => void) => {
      mutate((d) => {
        const fn = d.functions[funcId];
        if (!fn) return;
        const hit = findNode(fn.body, nodeId);
        if (hit) patch(hit.node);
      }, "histEdit");
    },
    [mutate],
  );

  const move = useCallback(
    (funcId: string, nodeId: string, key: string, index: number) => {
      mutate((d) => {
        const fn = d.functions[funcId];
        if (!fn) return;
        const hit = findNode(fn.body, nodeId);
        if (!hit) return;
        // Prevent dropping a block into its own subtree.
        const target = resolveList(fn, key);
        if (!target) return;
        const insideSelf = (list: SNode[]): boolean =>
          list === target || list.some((n) => n.id === nodeId && containsList(n, target));
        if (containsList(hit.node, target) || insideSelf([hit.node])) {
          if (containsList(hit.node, target)) return;
        }
        const [node] = hit.list.splice(hit.index, 1);
        if (!node) return;
        const finalList = resolveList(fn, key);
        if (!finalList) {
          hit.list.splice(hit.index, 0, node);
          return;
        }
        let i = index;
        if (finalList === hit.list && hit.index < index) i -= 1;
        finalList.splice(Math.max(0, Math.min(i, finalList.length)), 0, node);
      }, "histMove");
    },
    [mutate],
  );

  const duplicate = useCallback(
    (funcId: string, nodeId: string) => {
      mutate((d) => {
        const fn = d.functions[funcId];
        if (!fn) return;
        const hit = findNode(fn.body, nodeId);
        if (hit) hit.list.splice(hit.index + 1, 0, reId(hit.node));
      }, "histDuplicate");
    },
    [mutate],
  );

  const addCase = useCallback(
    (funcId: string, switchId: string, index: number) => {
      mutate((d) => {
        const fn = d.functions[funcId];
        if (!fn) return;
        const hit = findNode(fn.body, switchId);
        if (hit && hit.node.kind === "switch") {
          const label = String.fromCharCode(65 + hit.node.cases.length);
          hit.node.cases.splice(index, 0, newCase(label));
        }
      }, "histAddCase");
    },
    [mutate],
  );

  const removeCase = useCallback(
    (funcId: string, switchId: string, caseId: string) => {
      mutate((d) => {
        const fn = d.functions[funcId];
        if (!fn) return;
        const hit = findNode(fn.body, switchId);
        if (hit && hit.node.kind === "switch")
          hit.node.cases = hit.node.cases.filter((c) => c.id !== caseId);
      }, "histRemoveCase");
    },
    [mutate],
  );

  const renameCase = useCallback(
    (funcId: string, switchId: string, caseId: string, label: string) => {
      mutate((d) => {
        const fn = d.functions[funcId];
        if (!fn) return;
        const hit = findNode(fn.body, switchId);
        if (hit && hit.node.kind === "switch") {
          if (hit.node.defaultCase.id === caseId) hit.node.defaultCase.label = label;
          const c = hit.node.cases.find((x) => x.id === caseId);
          if (c) c.label = label;
        }
      }, "histRenameCase");
    },
    [mutate],
  );

  const createFunction = useCallback(
    (name: string, onCreated?: (id: string) => void) => {
      const fn = newFunction(name);
      mutate((d) => {
        fn.name = uniqueFunctionName(d, name);
        d.functions[fn.id] = { ...fn };
      }, "histNewFunction");
      onCreated?.(fn.id);
      return fn.id;
    },
    [mutate],
  );

  const renameFunction = useCallback(
    (funcId: string, name: string) => {
      mutate((d) => {
        if (d.functions[funcId]) d.functions[funcId].name = uniqueFunctionName(d, name, funcId);
      }, "histRenameFunction");
    },
    [mutate],
  );

  const deleteFunctionDefinition = useCallback(
    (funcId: string) => {
      mutate((d) => {
        delete d.functions[funcId];
      }, "histDeleteFunction");
    },
    [mutate],
  );

  const setOrphaned = useCallback(
    (funcId: string, orphaned: boolean) => {
      mutate((d) => {
        if (d.functions[funcId]) d.functions[funcId].orphaned = orphaned;
      }, "histDeleteFunction");
    },
    [mutate],
  );

  /** Insert a function block plus a fresh definition for it. */
  const insertFunctionBlock = useCallback(
    (funcId: string, key: string, index: number, name: string) => {
      mutate((d: StruktoDoc) => {
        const def = newFunction(uniqueFunctionName(d, name));
        d.functions[def.id] = def;
        const owner = d.functions[funcId];
        if (!owner) return;
        const list = resolveList(owner, key);
        list?.splice(index, 0, makeNode("call", { funcId: def.id }));
      }, "histInsert");
    },
    [mutate],
  );


  /** Merge functions from an imported document into the current one. */
  const importFunctions = useCallback(
    (imported: StruktoDoc, onDone?: (id: string | null) => void) => {
      const isBlank = (n: SNode): boolean =>
        (n.kind === "statement" || n.kind === "comment") && !(n.text ?? "").trim();
      const mainFn = imported.mainId ? imported.functions[imported.mainId] : undefined;
      const skipMain =
        !!mainFn && mainFn.name.trim().toLowerCase() === "main" && mainFn.body.every(isBlank);
      const ids = Object.keys(imported.functions).filter((id) => !(skipMain && id === imported.mainId));
      mutate((d) => {
        for (const id of ids) {
          const fn = imported.functions[id];
          if (!fn) continue;
          d.functions[id] = { ...fn, name: uniqueFunctionName(d, fn.name) };
        }
      }, "histNewFunction");
      onDone?.((skipMain ? null : imported.mainId) ?? ids[0] ?? null);
    },
    [mutate],
  );

  /** Delete a function definition and every call block that references it. */
  const deleteFunctionEverywhere = useCallback(
    (funcId: string) => {
      mutate((d) => {
        delete d.functions[funcId];
        const purge = (list: SNode[]) => {
          for (let i = list.length - 1; i >= 0; i--) {
            const n = list[i]!;
            if (n.kind === "call" && n.funcId === funcId) {
              list.splice(i, 1);
              continue;
            }
            if (n.kind === "if") {
              purge(n.then);
              purge(n.else);
            } else if (n.kind === "while" || n.kind === "dowhile" || n.kind === "for") {
              purge(n.body);
            } else if (n.kind === "switch") {
              n.cases.forEach((c) => purge(c.body));
              purge(n.defaultCase.body);
            }
          }
        };
        Object.values(d.functions).forEach((fn) => purge(fn.body));
      }, "histDeleteFunction");
    },
    [mutate],
  );

  /** Move a node into a different function's list (used when reparenting across diagrams). */
  const moveTo = useCallback(
    (srcFuncId: string, nodeId: string, dstFuncId: string, key: string, index: number) => {
      mutate((d) => {
        const src = d.functions[srcFuncId];
        const dst = d.functions[dstFuncId];
        if (!src || !dst) return;
        const hit = findNode(src.body, nodeId);
        if (!hit) return;
        const [node] = hit.list.splice(hit.index, 1);
        if (!node) return;
        const list = resolveList(dst, key);
        if (!list) {
          hit.list.splice(hit.index, 0, node);
          return;
        }
        list.splice(Math.max(0, Math.min(index, list.length)), 0, node);
      }, "histMove");
    },
    [mutate],
  );

  /** Reorder switch cases (default always stays last). */
  const moveCase = useCallback(
    (funcId: string, switchId: string, caseId: string, toIndex: number) => {
      mutate((d) => {
        const fn = d.functions[funcId];
        if (!fn) return;
        const hit = findNode(fn.body, switchId);
        if (!hit || hit.node.kind !== "switch") return;
        const from = hit.node.cases.findIndex((c) => c.id === caseId);
        if (from < 0) return;
        const [c] = hit.node.cases.splice(from, 1);
        if (!c) return;
        const target = from < toIndex ? toIndex - 1 : toIndex;
        hit.node.cases.splice(Math.max(0, Math.min(target, hit.node.cases.length)), 0, c);
      }, "histReorderCase");
    },
    [mutate],
  );

  return useMemo(
    () => ({
      doc,
      insert,
      remove,
      removeKeepChildren,
      update,
      move,
      moveTo,
      moveCase,
      duplicate,
      addCase,
      removeCase,
      renameCase,
      createFunction,
      renameFunction,
      deleteFunctionDefinition,
      deleteFunctionEverywhere,
      importFunctions,
      setOrphaned,
      insertFunctionBlock,
    }),
    [doc, insert, remove, removeKeepChildren, update, move, duplicate, moveTo, moveCase, addCase, removeCase, renameCase, createFunction, renameFunction, deleteFunctionDefinition, deleteFunctionEverywhere, importFunctions, setOrphaned, insertFunctionBlock],
  );
}

/** Nested blocks directly contained in a container node, in visual order. */
export function childBlocks(node: SNode): SNode[] {
  if (node.kind === "if") return [...node.then, ...node.else];
  if (node.kind === "while" || node.kind === "dowhile" || node.kind === "for") return [...node.body];
  if (node.kind === "switch")
    return [...node.cases.flatMap((c) => c.body), ...node.defaultCase.body];
  return [];
}

function containsList(node: SNode, list: SNode[]): boolean {
  const lists: SNode[][] = [];
  const collect = (n: SNode) => {
    if (n.kind === "if") lists.push(n.then, n.else);
    if (n.kind === "while" || n.kind === "dowhile" || n.kind === "for") lists.push(n.body);
    if (n.kind === "switch") {
      n.cases.forEach((c) => lists.push(c.body));
      lists.push(n.defaultCase.body);
    }
    if (n.kind === "if") [...n.then, ...n.else].forEach(collect);
    else if (n.kind === "while" || n.kind === "dowhile" || n.kind === "for") n.body.forEach(collect);
    else if (n.kind === "switch") {
      n.cases.forEach((c) => c.body.forEach(collect));
      n.defaultCase.body.forEach(collect);
    }
  };
  collect(node);
  return lists.includes(list);
}
