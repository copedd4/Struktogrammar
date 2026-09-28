import { emptyDoc, uid } from "./model";
import type { SNode, StruktoDoc, SwitchCase } from "./types";

const st = (text: string): SNode => ({ kind: "statement", id: uid(), text });
const cmt = (text: string): SNode => ({ kind: "comment", id: uid(), text });
const iff = (cond: string, then: SNode[], els: SNode[] = []): SNode => ({
  kind: "if",
  id: uid(),
  cond,
  then,
  else: els,
});
const loop = (kind: "while" | "dowhile" | "for", cond: string, body: SNode[]): SNode => ({
  kind,
  id: uid(),
  cond,
  body,
});
const cse = (label: string, body: SNode[]): SwitchCase => ({ id: uid(), label, body });
const sw = (expr: string, cases: SwitchCase[], def: SNode[]): SNode => ({
  kind: "switch",
  id: uid(),
  expr,
  cases,
  defaultCase: { id: uid(), label: "default", body: def },
});

function docWith(name: string, body: SNode[]): StruktoDoc {
  const doc = emptyDoc(name);
  doc.functions[doc.mainId]!.body = body;
  return doc;
}

export interface Template {
  id: string;
  titleKey: "tplBlank" | "tplFactorial" | "tplBubble" | "tplGrade" | "tplLogin";
  descKey: "tplBlankDesc" | "tplFactorialDesc" | "tplBubbleDesc" | "tplGradeDesc" | "tplLoginDesc";
  build: () => StruktoDoc;
}

export const templates: Template[] = [
  {
    id: "blank",
    titleKey: "tplBlank",
    descKey: "tplBlankDesc",
    build: () => emptyDoc("Untitled"),
  },
  {
    id: "factorial",
    titleKey: "tplFactorial",
    descKey: "tplFactorialDesc",
    build: () =>
      docWith("Factorial", [
        st("read n"),
        iff(
          "n < 0",
          [
            st('output "invalid input"'),
            { kind: "terminator", id: uid(), variant: "return", text: "-1" },
          ],
          [
            st("result ← 1"),
            loop("for", "i ← 2 to n", [st("result ← result * i")]),
            st("output result"),
          ],
        ),
      ]),
  },
  {
    id: "bubble",
    titleKey: "tplBubble",
    descKey: "tplBubbleDesc",
    build: () =>
      docWith("Bubble sort", [
        cmt("Sorts array a[0..n-1] ascending"),
        loop("for", "i ← 0 to n-2", [
          loop("for", "j ← 0 to n-2-i", [
            iff("a[j] > a[j+1]", [st("tmp ← a[j]"), st("a[j] ← a[j+1]"), st("a[j+1] ← tmp")]),
          ]),
        ]),
        st("output a"),
      ]),
  },
  {
    id: "grade",
    titleKey: "tplGrade",
    descKey: "tplGradeDesc",
    build: () =>
      docWith("Grade classification", [
        st("read points"),
        sw(
          "points",
          [
            cse("≥ 90", [st('grade ← "A"')]),
            cse("≥ 80", [st('grade ← "B"')]),
            cse("≥ 70", [st('grade ← "C"')]),
          ],
          [st('grade ← "F"')],
        ),
        st("output grade"),
      ]),
  },
  {
    id: "login",
    titleKey: "tplLogin",
    descKey: "tplLoginDesc",
    build: () => {
      const doc = docWith("Login", []);
      const fnId = uid();
      doc.functions[fnId] = {
        id: fnId,
        name: "checkPassword",
        params: "user, password",
        returns: "bool",
        body: [
          st("hash ← hash(password)"),
          iff("hash = stored", [st("valid ← true")], [st("valid ← false")]),
          { kind: "terminator", id: uid(), variant: "return", text: "valid" },
        ],
      };
      doc.functions[doc.mainId]!.body = [
        st("read user, password"),
        { kind: "call", id: uid(), funcId: fnId, args: "user, password" },
        iff("valid", [st('output "welcome"')], [st('output "access denied"')]),
      ];
      return doc;
    },
  },
];
