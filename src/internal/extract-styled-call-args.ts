import type { Collection } from "jscodeshift";
import { capitalize } from "./utilities/string-utils.js";

/**
 * Extract CallExpression arguments from styled() calls into separate variable declarations.
 *
 * Transforms:
 *   const AnimatedStyled = styled(motion.create(BaseComponent))`...`;
 *
 * Into:
 *   const MotionBaseComponent = motion.create(BaseComponent);
 *   const AnimatedStyled = styled(MotionBaseComponent)`...`;
 *
 * This makes the styled() call match the supported `styled(Identifier)` pattern.
 *
 * @returns true if any extractions were made
 */
export function extractStyledCallArgs(args: {
  root: Collection<unknown>;
  j: typeof import("jscodeshift");
  styledDefaultImport: string | undefined;
}): boolean {
  const { root, j, styledDefaultImport } = args;

  if (!styledDefaultImport) {
    return false;
  }

  let hasChanges = false;

  // Find all TaggedTemplateExpressions that are styled(CallExpression)`...`
  root
    .find(j.VariableDeclarator, {
      init: { type: "TaggedTemplateExpression" },
    } as object)
    .forEach((p) => {
      const id = p.node.id;
      const init = p.node.init;
      if (id.type !== "Identifier" || !init || init.type !== "TaggedTemplateExpression") {
        return;
      }

      const tag = init.tag;

      // Check if this is styled(CallExpression)`...`
      if (
        tag.type !== "CallExpression" ||
        tag.callee?.type !== "Identifier" ||
        tag.callee.name !== styledDefaultImport ||
        tag.arguments?.length !== 1
      ) {
        return;
      }
      const callArg = tag.arguments[0];
      if (callArg?.type !== "CallExpression") {
        return;
      }

      // Generate a name for the extracted variable
      // e.g., styled(motion.create(BaseComponent)) -> MotionBaseComponent
      const extractedName = generateExtractedVarName(callArg, id.name);

      // Create the extracted variable declaration
      const extractedDecl = j.variableDeclaration("const", [
        j.variableDeclarator(j.identifier(extractedName), callArg),
      ]);

      // Replace the CallExpression in styled() with the new identifier
      tag.arguments[0] = j.identifier(extractedName);

      // Insert the new declaration before the current VariableDeclaration
      // p is the VariableDeclarator path
      // p.parentPath is the "declarations" array path
      // p.parentPath.parentPath is the VariableDeclaration path
      // p.parentPath.parentPath.parentPath is the body array path (or Program)
      const declArrayPath = p.parentPath; // declarations array
      const varDeclPath = declArrayPath?.parentPath; // VariableDeclaration
      const bodyArrayPath = varDeclPath?.parentPath; // body array or Program

      if (
        varDeclPath?.node?.type === "VariableDeclaration" &&
        Array.isArray(bodyArrayPath?.value)
      ) {
        const idx = bodyArrayPath.value.indexOf(varDeclPath.node);
        if (idx >= 0) {
          bodyArrayPath.value.splice(idx, 0, extractedDecl);
          hasChanges = true;
        }
      }
    });

  return hasChanges;
}

/**
 * Generate a reasonable variable name for the extracted call expression.
 *
 * Examples:
 *   motion.create(BaseComponent) -> MotionBaseComponent
 *   someLib.wrap(Foo) -> WrappedFoo
 *   createAnimated(Box) -> AnimatedBox
 */
function generateExtractedVarName(
  callExpr: { callee: unknown; arguments: unknown[] },
  styledName: string,
): string {
  const callee = callExpr.callee as {
    type: string;
    object?: { type: string; name?: string };
    property?: { type: string; name?: string };
    name?: string;
  };

  // Try to get a meaningful prefix from the callee
  let prefix = "";
  if (callee.type === "MemberExpression") {
    // motion.create -> "Motion"
    const objName = callee.object?.type === "Identifier" ? callee.object.name : null;
    if (objName) {
      prefix = capitalize(objName);
    }
  } else if (callee.type === "Identifier" && callee.name) {
    // createAnimated -> "Animated" (strip common prefixes like "create", "make", "build")
    const name = callee.name;
    const stripped = name.replace(/^(create|make|build|wrap)/i, "");
    prefix = stripped ? capitalize(stripped) : capitalize(name);
  }

  // Try to get the base component name from arguments
  const arg0 = callExpr.arguments[0] as { type: string; name?: string } | undefined;
  let baseName = "";
  if (arg0?.type === "Identifier" && arg0.name) {
    baseName = arg0.name;
  }

  // Combine prefix and base name, or fall back to using the styled component name
  if (prefix && baseName) {
    return `${prefix}${baseName}`;
  } else if (baseName) {
    return `Wrapped${baseName}`;
  } else if (prefix) {
    // Use the styled component name with prefix
    return `${prefix}Base`;
  }

  // Fallback: use the styled component name with a suffix
  return `${styledName}Base`;
}
