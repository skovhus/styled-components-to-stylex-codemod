/**
 * AST safety checks for null nodes and structural issues.
 * Core concepts: recursive validation and error reporting.
 */

/** AST node types whose `elements` array legitimately contains `null` (holes/elisions). */
const ARRAY_ELEMENT_HOLE_TYPES = new Set(["ArrayPattern", "ArrayExpression"]);

export function assertNoNullNodesInArrays(node: unknown): void {
  const seen = new WeakSet<object>();
  const visit = (cur: unknown, path: string, allowNulls: boolean) => {
    if (cur === null || cur === undefined) {
      return;
    }
    if (Array.isArray(cur)) {
      for (let i = 0; i < cur.length; i++) {
        if (cur[i] === null) {
          if (!allowNulls) {
            throw new Error(`Null AST node in array at ${path}[${i}]`);
          }
          continue;
        }
        visit(cur[i], `${path}[${i}]`, false);
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
    const nodeType = (cur as Record<string, unknown>).type;
    const hasValidElementHoles =
      typeof nodeType === "string" && ARRAY_ELEMENT_HOLE_TYPES.has(nodeType);
    for (const [k, v] of Object.entries(cur as Record<string, unknown>)) {
      if (v === null) {
        continue;
      }
      if (typeof v === "object") {
        visit(v, `${path}.${k}`, hasValidElementHoles && k === "elements");
      }
    }
  };
  visit(node, "root", false);
}
