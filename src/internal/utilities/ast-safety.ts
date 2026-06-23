/**
 * AST safety checks for null nodes and structural issues.
 * Core concepts: recursive validation and error reporting.
 */

/**
 * `JSON.stringify` replacer that drops noisy AST positional metadata
 * (`loc`/`tokens`/`comments`/`start`/`end`) and replaces circular references
 * with `"[Circular]"`, so AST nodes can be serialized for logging or as a
 * stable structural key. Create a fresh replacer per `stringify` call — it
 * keeps per-serialization state.
 */
export function createAstSafeJsonReplacer(): (key: string, value: unknown) => unknown {
  const seen = new WeakSet<object>();
  return (key, value) => {
    if (
      key === "loc" ||
      key === "tokens" ||
      key === "comments" ||
      key === "start" ||
      key === "end"
    ) {
      return undefined;
    }
    if (value && typeof value === "object") {
      if (seen.has(value)) {
        return "[Circular]";
      }
      seen.add(value);
    }
    return value;
  };
}

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
