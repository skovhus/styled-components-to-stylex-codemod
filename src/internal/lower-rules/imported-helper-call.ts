/**
 * Helpers extracted from rule-interpolated-declaration.ts.
 * Keep behavior identical to the original inline definitions.
 */
import type { CallResolveContext, ImportSpec } from "../../adapter.js";
import { isRelativeSpecifier } from "../utilities/path-utils.js";
import { dirname, resolve as pathResolve } from "node:path";

type ResolvedStylesCallMeta = {
  imports?: ImportSpec[];
  resolveCallResult?: unknown;
  resolveCallContext?: CallResolveContext;
};

export function isUnchangedImportedHelperStyleCall(
  res: ResolvedStylesCallMeta,
  exprAst: unknown,
  originalExpr: unknown,
): boolean {
  const resolveResult = res.resolveCallResult;
  const resolveContext = res.resolveCallContext;
  const typedResult =
    resolveResult && typeof resolveResult === "object"
      ? (resolveResult as { cssText?: string; imports?: unknown[] })
      : null;
  if (!typedResult || !resolveContext || typedResult.cssText) {
    return false;
  }
  if (!isCallExpressionLike(exprAst) || !isCallExpressionLike(originalExpr)) {
    return false;
  }
  if (calleeKey(exprAst.callee) !== calleeKey(originalExpr.callee)) {
    return false;
  }
  return !redirectsOriginalCalleeToDifferentSource(res, resolveContext);
}

function redirectsOriginalCalleeToDifferentSource(
  res: ResolvedStylesCallMeta,
  resolveContext: CallResolveContext,
): boolean {
  const imports =
    res.imports ??
    (res.resolveCallResult && typeof res.resolveCallResult === "object"
      ? (res.resolveCallResult as { imports?: ImportSpec[] }).imports
      : undefined) ??
    [];
  const matchingImport = imports.find((importSpec) =>
    importSpec.names.some(
      (name) =>
        name.imported === resolveContext.calleeImportedName ||
        name.local === resolveContext.calleeImportedName,
    ),
  );
  return Boolean(matchingImport && !sourcesReferToSameImport(matchingImport.from, resolveContext));
}

function sourcesReferToSameImport(
  left: ImportSpec["from"],
  resolveContext: CallResolveContext,
): boolean {
  const right = resolveContext.calleeSource;
  if (left.value === right.value) {
    return true;
  }
  return (
    specifierMatchesAbsolutePath(left, right, resolveContext.callSiteFilePath) ||
    specifierMatchesAbsolutePath(right, left, resolveContext.callSiteFilePath)
  );
}

function specifierMatchesAbsolutePath(
  maybeSpecifier: ImportSpec["from"] | CallResolveContext["calleeSource"],
  maybeAbsolute: ImportSpec["from"] | CallResolveContext["calleeSource"],
  callSiteFilePath: string,
): boolean {
  if (maybeSpecifier.kind !== "specifier" || maybeAbsolute.kind !== "absolutePath") {
    return false;
  }
  const specifier = maybeSpecifier.value.replace(/\\/g, "/");
  if (!isRelativeSpecifier(specifier)) {
    return false;
  }
  const resolvedSpecifier = pathResolve(dirname(callSiteFilePath), specifier).replace(/\\/g, "/");
  const absolutePath = maybeAbsolute.value.replace(/\\/g, "/");
  return importPathCandidates(resolvedSpecifier).some((candidate) => absolutePath === candidate);
}

function importPathCandidates(resolvedSpecifier: string): string[] {
  const extensions = ["", ".ts", ".tsx", ".js", ".jsx", ".mts", ".mjs", ".cts", ".cjs"];
  return extensions.flatMap((extension) => [
    `${resolvedSpecifier}${extension}`,
    `${resolvedSpecifier}/index${extension}`,
  ]);
}

function isCallExpressionLike(node: unknown): node is { type: "CallExpression"; callee: unknown } {
  return (
    !!node && typeof node === "object" && (node as { type?: string }).type === "CallExpression"
  );
}

function calleeKey(callee: unknown): string | null {
  const node = callee as {
    type?: string;
    name?: string;
    object?: unknown;
    property?: { type?: string; name?: string };
    computed?: boolean;
  };
  if (node?.type === "Identifier" && node.name) {
    return node.name;
  }
  if (
    node?.type === "MemberExpression" &&
    node.computed !== true &&
    node.property?.type === "Identifier" &&
    node.property.name
  ) {
    const objectKey = calleeKey(node.object);
    return objectKey ? `${objectKey}.${node.property.name}` : null;
  }
  return null;
}
