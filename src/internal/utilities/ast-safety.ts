/**
 * AST safety checks for null nodes and structural issues.
 * Core concepts: recursive validation and error reporting.
 */
export function assertNoNullNodesInArrays(node: unknown): void {
  const seen = new WeakSet<object>();
  const visit = (cur: unknown, path: string) => {
    if (cur === null || cur === undefined) {
      return;
    }
    if (Array.isArray(cur)) {
      for (let i = 0; i < cur.length; i++) {
        if (cur[i] === null) {
          throw new Error(`Null AST node in array at ${path}[${i}]`);
        }
        visit(cur[i], `${path}[${i}]`);
      }
      return;
    }
    if (typeof cur !== "object") {
      return;
    }
    const curObj = cur as object;
    if (seen.has(curObj)) {
      return;
    }
    seen.add(curObj);
    for (const [k, v] of Object.entries(cur as Record<string, unknown>)) {
      if (v === null) {
        continue;
      }
      if (typeof v === "object") {
        visit(v, `${path}.${k}`);
      }
    }
  };
  visit(node, "root");
}
