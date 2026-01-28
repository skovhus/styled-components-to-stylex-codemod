import { CONTINUE, type StepResult } from "../transform-types.js";
import { TransformContext } from "../transform-context.js";

/**
 * Reinserts static property assignments after generated wrapper functions.
 */
export function reinsertStaticPropsStep(ctx: TransformContext): StepResult {
  const { root, j } = ctx;
  const staticPropertyAssignments = ctx.staticPropertyAssignments;
  if (!staticPropertyAssignments) {
    return CONTINUE;
  }

  // Reinsert static property assignments after their corresponding wrapper functions.
  // For each styled component that has static properties, find its wrapper function
  // and insert the static property assignments immediately after it.
  for (const [componentName, statements] of staticPropertyAssignments.entries()) {
    if (statements.length === 0) {
      continue;
    }

    // Find the wrapper function for this component
    const wrapperFn = root.find(j.FunctionDeclaration, { id: { name: componentName } }).at(0);

    if (wrapperFn.size() > 0) {
      // Insert static property assignments after the function (handle export wrapper)
      const fnPath = wrapperFn.get();
      const parent = fnPath.parentPath;

      if (
        parent?.node?.type === "ExportNamedDeclaration" ||
        parent?.node?.type === "ExportDefaultDeclaration"
      ) {
        // Function is wrapped in export, insert after the export
        j(parent).insertAfter(statements);
      } else {
        // Function is standalone, insert after it
        wrapperFn.insertAfter(statements);
      }
    }
  }

  return CONTINUE;
}
