import { CONTINUE, returnResult, type StepResult } from "../transform-types.js";
import { TransformContext } from "../transform-context.js";

/**
 * Detects unsupported template patterns (component selectors, specificity hacks) and bails with warnings.
 */
export function detectUnsupportedPatternsStep(ctx: TransformContext): StepResult {
  const { root, j, warnings } = ctx;

  // Detect patterns that aren't directly representable in StyleX (or require semantic rewrites).
  // These warnings are used for per-fixture expectations and help guide manual follow-ups.
  let hasComponentSelector = false;
  let hasSpecificityHack = false;
  let componentSelectorLoc: { line: number; column: number } | null = null;
  let specificityHackLoc: { line: number; column: number } | null = null;

  root.find(j.TemplateLiteral).forEach((p) => {
    const tl = p.node;

    // Specificity hacks like `&&` / `&&&` inside styled template literals.
    for (const quasi of tl.quasis) {
      if (quasi.value.raw.includes("&&")) {
        hasSpecificityHack = true;
        if (!specificityHackLoc && quasi.loc?.start?.line !== undefined) {
          specificityHackLoc = {
            line: quasi.loc.start.line,
            column: quasi.loc.start.column ?? 0,
          };
        }
      }
    }

    // Component selector patterns like `${Link}:hover & { ... }`
    for (let i = 0; i < tl.expressions.length; i++) {
      const expr = tl.expressions[i];
      const after = tl.quasis[i + 1]?.value.raw ?? "";
      if (expr?.type === "Identifier" && after.includes(":hover &")) {
        hasComponentSelector = true;
        if (!componentSelectorLoc) {
          const loc = (expr as any).loc ?? tl.loc;
          if (loc?.start?.line !== undefined) {
            componentSelectorLoc = {
              line: loc.start.line,
              column: loc.start.column ?? 0,
            };
          }
        }
      }
    }
  });

  if (hasComponentSelector) {
    warnings.push({
      severity: "warning",
      type: "Component selectors like `${OtherComponent}:hover &` are not directly representable in StyleX. Manual refactor is required",
      loc: componentSelectorLoc,
    });

    // Policy: component selectors like `${OtherComponent}:hover &` require a semantic refactor.
    // Bail out to avoid producing incorrect output.
    return returnResult({ code: null, warnings }, "bail");
  }

  if (hasSpecificityHack) {
    warnings.push({
      severity: "warning",
      type: "Styled-components specificity hacks like `&&` / `&&&` are not representable in StyleX",
      loc: specificityHackLoc,
    });
    return returnResult({ code: null, warnings }, "bail");
  }

  return CONTINUE;
}
