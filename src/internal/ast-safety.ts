export function assertNoNullNodesInArrays(node: any): void {
  const seen = new WeakSet<object>();
  const visit = (cur: any, path: string) => {
    if (!cur) return;
    if (Array.isArray(cur)) {
      for (let i = 0; i < cur.length; i++) {
        if (cur[i] === null) {
          throw new Error(`Null AST node in array at ${path}[${i}]`);
        }
        visit(cur[i], `${path}[${i}]`);
      }
      return;
    }
    if (typeof cur !== "object") return;
    if (seen.has(cur as object)) return;
    seen.add(cur as object);
    for (const [k, v] of Object.entries(cur)) {
      if (v === null) continue;
      if (typeof v === "object") visit(v, `${path}.${k}`);
    }
  };
  visit(node, "root");
}
