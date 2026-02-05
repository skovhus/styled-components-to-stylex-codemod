/**
 * Pre-scans styled declarations to collect css helper defaults.
 * Core concepts: identify helper placeholders early and bail on unknown imports.
 */
import type { ASTNode } from "jscodeshift";
import type { DeclProcessingState } from "./decl-setup.js";
import { toStyleKey } from "../transform/helpers.js";
import { extractRootAndPath, getNodeLocStart } from "../utilities/jscodeshift-utils.js";

export function preScanCssHelperPlaceholders(ctx: DeclProcessingState): boolean {
  const { decl, cssHelperPropValues, state } = ctx;
  const {
    cssHelperNames,
    cssHelperValuesByKey,
    declByLocalName,
    cssHelperObjectMembers,
    importMap,
    resolveValue,
    resolveCall,
    filePath,
    warnings,
    markBail,
  } = state;

  // Pre-scan rules to detect css helper placeholders and populate cssHelperPropValues
  // BEFORE processing any pseudo selectors that might reference those properties.
  // Also detect imported css helpers (identifiers that aren't in cssHelperNames) and bail.
  let hasImportedCssHelper = false;
  for (const rule of decl.rules) {
    for (const d of rule.declarations) {
      if (!d.property && d.value.kind === "interpolated") {
        const slotPart = (
          d.value as { parts?: Array<{ kind: string; slotId?: number }> }
        ).parts?.find((p) => p.kind === "slot");
        if (slotPart && slotPart.kind === "slot" && slotPart.slotId !== undefined) {
          const expr = decl.templateExpressions[slotPart.slotId];
          if (
            expr &&
            typeof expr === "object" &&
            "type" in expr &&
            expr.type === "Identifier" &&
            "name" in expr &&
            typeof expr.name === "string"
          ) {
            // Check if it's a css helper defined in this file
            if (cssHelperNames.has(expr.name)) {
              const helperKey = toStyleKey(expr.name);
              const helperValues = cssHelperValuesByKey.get(helperKey);
              if (helperValues) {
                for (const [prop, value] of helperValues) {
                  cssHelperPropValues.set(prop, value);
                }
              }
            } else if (declByLocalName.has(expr.name)) {
              // Local styled component interpolation - handled later in rule processing.
            } else {
              // Check if this is an imported styled component mixin that the adapter can resolve
              const importEntry = importMap?.get(expr.name);
              if (importEntry) {
                const resolved = resolveValue({
                  kind: "importedValue",
                  importedName: importEntry.importedName,
                  source: importEntry.source,
                  filePath,
                  loc: getNodeLocStart(expr as ASTNode) ?? undefined,
                });
                if (resolved?.usage === "props") {
                  // Adapter resolved it as a style object - will be handled later
                  continue;
                }
              }
              // This might be an imported css helper - we can't determine its properties.
              // Mark for bail to avoid generating incorrect default values.
              hasImportedCssHelper = true;
            }
          }
          // Check for css helper function calls: ${getPrimaryStyles()}
          else if (
            expr &&
            typeof expr === "object" &&
            "type" in expr &&
            expr.type === "CallExpression" &&
            "callee" in expr &&
            expr.callee &&
            typeof expr.callee === "object" &&
            "type" in expr.callee &&
            expr.callee.type === "Identifier" &&
            "name" in expr.callee &&
            typeof expr.callee.name === "string" &&
            "arguments" in expr &&
            Array.isArray(expr.arguments) &&
            expr.arguments.length === 0
          ) {
            const calleeName = expr.callee.name;
            const helperDecl = declByLocalName.get(calleeName);
            if (helperDecl?.isCssHelper) {
              const helperValues = cssHelperValuesByKey.get(helperDecl.styleKey);
              if (helperValues) {
                for (const [prop, value] of helperValues) {
                  cssHelperPropValues.set(prop, value);
                }
              }
            } else {
              // Check for imported function call - try resolveCall first
              const importEntry = importMap?.get(calleeName);
              if (importEntry) {
                const resolved = resolveCall({
                  callSiteFilePath: filePath,
                  calleeImportedName: importEntry.importedName,
                  calleeSource: importEntry.source,
                  args: [],
                });
                if (!resolved) {
                  // Can't resolve this imported function call - bail for safety
                  hasImportedCssHelper = true;
                }
              }
            }
          }
          // Also check for member expression CSS helpers (e.g., buttonStyles.rootCss)
          else if (expr && typeof expr === "object" && "type" in expr) {
            const rootInfo = extractRootAndPath(expr);
            const firstPathPart = rootInfo?.path[0];
            if (rootInfo && rootInfo.path.length === 1 && firstPathPart) {
              const objectMemberMap = cssHelperObjectMembers.get(rootInfo.rootName);
              if (objectMemberMap) {
                const memberDecl = objectMemberMap.get(firstPathPart);
                if (memberDecl) {
                  const helperValues = cssHelperValuesByKey.get(memberDecl.styleKey);
                  if (helperValues) {
                    for (const [prop, value] of helperValues) {
                      cssHelperPropValues.set(prop, value);
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  // Bail if the declaration uses an imported css helper whose properties we can't determine.
  if (hasImportedCssHelper) {
    warnings.push({
      severity: "error",
      type: "Imported CSS helper mixins: cannot determine inherited properties for correct pseudo selector handling",
      loc: decl.loc,
    });
    markBail();
    return false;
  }

  return true;
}
