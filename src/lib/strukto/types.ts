export type NodeId = string;

export type TerminatorVariant = "break" | "return" | "continue";

export interface StatementNode {
  kind: "statement";
  id: NodeId;
  text: string;
}
export interface IfNode {
  kind: "if";
  id: NodeId;
  cond: string;
  then: SNode[];
  else: SNode[];
  collapsed?: boolean;
}
export interface LoopNode {
  kind: "while" | "dowhile" | "for";
  id: NodeId;
  cond: string;
  body: SNode[];
  collapsed?: boolean;
}
export interface SwitchCase {
  id: NodeId;
  label: string;
  body: SNode[];
}
export interface SwitchNode {
  kind: "switch";
  id: NodeId;
  expr: string;
  cases: SwitchCase[];
  defaultCase: SwitchCase;
  collapsed?: boolean;
}
export interface CallNode {
  kind: "call";
  id: NodeId;
  funcId: string;
  collapsed?: boolean;
  expanded?: boolean;
}
export interface TerminatorNode {
  kind: "terminator";
  id: NodeId;
  variant: TerminatorVariant;
  text: string;
}
export interface CommentNode {
  kind: "comment";
  id: NodeId;
  text: string;
}

export type SNode =
  | StatementNode
  | IfNode
  | LoopNode
  | SwitchNode
  | CallNode
  | TerminatorNode
  | CommentNode;

export type BlockKind = SNode["kind"];

export interface StruktoFunction {
  id: string;
  name: string;
  body: SNode[];
  orphaned?: boolean;
}

export interface StruktoDoc {
  version: 1;
  format: "stkg";
  name: string;
  mainId: string;
  functions: Record<string, StruktoFunction>;
}
