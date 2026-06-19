/**
 * Step: mark non-leaf styled declarations as skipped when leaves-only mode is on.
 * Runs after {@link resolveBaseComponentsStep} so adapter-inlined intrinsic bases count as leaves.
 */
import { readFileSync } from "node:fs";
import { resolve as pathResolve } from "node:path";
import {
  findImportSource,
  resolveBarrelReExportBinding,
  type Resolve,
} from "../prepass/extract-external-interface.js";
import { hasUniversalSelectorInRules } from "../css-ir.js";
import { UNSUPPORTED_SHOULD_FORWARD_PROP_WARNING } from "../logger.js";
import {
  CONTINUE,
  type StepResult,
  type StyledDecl,
  type TransformOptions,
} from "../transform-types.js";
import { TransformContext } from "../transform-context.js";
import { findDefaultExportedLocalName } from "../utilities/default-export-name.js";
import { toRealPath } from "../utilities/path-utils.js";

export function applyLeavesOnlyPolicyStep(ctx: TransformContext): StepResult {
  if (ctx.options.transformMode !== "leavesOnly" || !ctx.styledDecls?.length) {
    return CONTINUE;
  }

  const keys = ctx.options.globalLeafKeys;
  const resolveModule = ctx.options.resolveModule;
  const source = ctx.file.source;
  const filePath = ctx.file.path;
  const isStyledLeafDecl = buildStyledDeclLeafTest({
    filePath,
    source,
    styledDecls: ctx.styledDecls,
    globalLeafKeys: keys,
    resolveModule,
  });

  for (const decl of ctx.styledDecls) {
    if (decl.isCssHelper || decl.skipTransform) {
      continue;
    }
    if (!isStyledLeafDecl(decl)) {
      decl.skipTransform = true;
      continue;
    }
    if (decl.hasUnparseableShouldForwardProp) {
      decl.skipTransform = true;
      ctx.warnings.push({
        severity: "warning",
        type: UNSUPPORTED_SHOULD_FORWARD_PROP_WARNING,
        loc: decl.loc,
      });
      continue;
    }
    if (hasUniversalSelectorInRules(decl.rules)) {
      decl.skipTransform = true;
      ctx.warnings.push({
        severity: "warning",
        type: "Universal selectors (`*`) are currently unsupported",
        loc: decl.loc,
      });
    }
  }

  return CONTINUE;
}

function buildStyledDeclLeafTest(args: {
  filePath: string;
  source: string;
  styledDecls: StyledDecl[];
  globalLeafKeys?: Set<string>;
  resolveModule: TransformOptions["resolveModule"];
}): (decl: StyledDecl) => boolean {
  const { filePath, source, styledDecls, globalLeafKeys, resolveModule } = args;
  const declByLocalName = new Map(styledDecls.map((decl) => [decl.localName, decl]));
  const leafCache = new Map<string, boolean>();
  const absFile = pathResolve(filePath);
  const fileReal = toRealPath(absFile);

  const resolveLeaf: (decl: StyledDecl, visiting: Set<string>) => boolean = (decl, visiting) => {
    const cached = leafCache.get(decl.localName);
    if (cached !== undefined) {
      return cached;
    }
    if (visiting.has(decl.localName)) {
      leafCache.set(decl.localName, false);
      return false;
    }
    if (decl.base.kind === "intrinsic") {
      leafCache.set(decl.localName, true);
      return true;
    }

    visiting.add(decl.localName);
    const localBase = declByLocalName.get(decl.base.ident);
    const result = localBase
      ? resolveLeaf(localBase, visiting)
      : isImportedLeafBinding(
          source,
          decl.base.ident,
          globalLeafKeys,
          resolveModule,
          absFile,
          fileReal,
        );
    visiting.delete(decl.localName);
    leafCache.set(decl.localName, result);
    return result;
  };

  return (decl: StyledDecl) => resolveLeaf(decl, new Set<string>());
}

function isImportedLeafBinding(
  source: string,
  ident: string,
  globalLeafKeys: Set<string> | undefined,
  resolveModule: TransformOptions["resolveModule"],
  absFile: string,
  fileReal: string,
): boolean {
  const importInfo = findImportSource(source, ident);
  if (!importInfo) {
    return globalLeafKeys?.has(`${fileReal}:${ident}`) ?? false;
  }
  if (!resolveModule || !globalLeafKeys) {
    return false;
  }

  const resolve: Resolve = (specifier, fromFile) =>
    resolveModule(pathResolve(fromFile), specifier) ?? null;

  const initialDefFile = resolve(importInfo.source, absFile);
  if (!initialDefFile) {
    return false;
  }

  const cachedRead = (p: string): string => readFileSync(p, "utf-8");
  const exportNameForBarrel = importInfo.isDefault ? "default" : importInfo.exportedName;
  const reExport = resolveBarrelReExportBinding(
    initialDefFile,
    exportNameForBarrel,
    resolve,
    cachedRead,
  );
  const defFile = reExport?.filePath ?? initialDefFile;
  const exportedName = reExport?.exportedName ?? importInfo.exportedName;

  return importedLeafKeyExists(
    globalLeafKeys,
    toRealPath(defFile),
    exportedName,
    exportedName === "default" || importInfo.isDefault,
    cachedRead,
  );
}

function importedLeafKeyExists(
  globalLeafKeys: Set<string>,
  defFile: string,
  exportedName: string,
  allowDefaultFallback: boolean,
  cachedRead: (path: string) => string,
): boolean {
  if (globalLeafKeys.has(`${defFile}:${exportedName}`)) {
    return true;
  }
  if (!allowDefaultFallback) {
    return false;
  }
  const defaultName = findDefaultExportedLocalName(cachedRead(defFile));
  return defaultName ? globalLeafKeys.has(`${defFile}:${defaultName}`) : false;
}
