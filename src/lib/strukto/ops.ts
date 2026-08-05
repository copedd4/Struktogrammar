import { useCallback, useMemo } from "react";
import { findNode, makeNode, newCase, newFunction, reId, resolveList } from "./model";
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
      });
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
      });
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
      });
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
      });
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
      });
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
      });
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
      });
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
      });
    },
    [mutate],
  );

  const createFunction = useCallback(
    (name: string, onCreated?: (id: string) => void) => {
      const fn = newFunction(name);
      mutate((d) => {
        d.functions[fn.id] = fn;
      });
      onCreated?.(fn.id);
      return fn.id;
    },
    [mutate],
  );

  const renameFunction = useCallback(
    (funcId: string, name: string) => {
      mutate((d) => {
        if (d.functions[funcId]) d.functions[funcId].name = name;
      });
    },
    [mutate],
  );

  const deleteFunctionDefinition = useCallback(
    (funcId: string) => {
      mutate((d) => {
        delete d.functions[funcId];
      });
    },
    [mutate],
  );

  const setOrphaned = useCallback(
    (funcId: string, orphaned: boolean) => {
      mutate((d) => {
        if (d.functions[funcId]) d.functions[funcId].orphaned = orphaned;
      });
    },
    [mutate],
  );

  /** Insert a function block plus a fresh definition for it. */
  const insertFunctionBlock = useCallback(
    (funcId: string, key: string, index: number, name: string) => {
      mutate((d: StruktoDoc) => {
        const def = newFunction(name);
        d.functions[def.id] = def;
        const owner = d.functions[funcId];
        if (!owner) return;
        const list = resolveList(owner, key);
        list?.splice(index, 0, makeNode("call", { funcId: def.id }));
      });
    },
    [mutate],
  );

  return useMemo(
    () => ({
      doc,
      insert,
      remove,
      update,
      move,
      duplicate,
      addCase,
      removeCase,
      renameCase,
      createFunction,
      renameFunction,
      deleteFunctionDefinition,
      setOrphaned,
      insertFunctionBlock,
    }),
    [doc, insert, remove, update, move, duplicate, addCase, removeCase, renameCase, createFunction, renameFunction, deleteFunctionDefinition, setOrphaned, insertFunctionBlock],
  );
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
