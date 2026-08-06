import { importCode } from "./src/lib/strukto/codeimport";
import { generateCode } from "./src/lib/strukto/codegen";
const src = `
void helper(void) {
  printf("hi");
}
int main(void) {
  int i = 0;
  helper();
  if (i > 0) {
    i--;
  } else if (i == 0) {
    i = 5;
  } else {
    i++;
  }
  while (i < 10) { i++; }
  do { i--; } while (i > 2);
  for (int k = 0; k < 3; k++) { printf("%d", k); }
  switch (i) {
    case 1: printf("one"); break;
    case 2: printf("two"); break;
    default: printf("other"); break;
  }
  return 0;
}
`;
const r = importCode(src);
console.log(generateCode(r.doc, "python"));
console.log("----");
console.log(generateCode(r.doc, "java"));
const py = generateCode(r.doc, "python");
console.log("=== reimport python ===");
console.log(generateCode(importCode(py).doc, "c"));
