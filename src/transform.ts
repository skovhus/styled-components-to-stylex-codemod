/**
 * Main jscodeshift transform pipeline for styled-components to StyleX.
 * Core concepts: ordered transform steps, context orchestration, and logging.
 */
import type { API, FileInfo, Options } from "jscodeshift";
import { basename, dirname, join, resolve as pathResolve } from "node:path";
import { realpathSync } from "node:fs";

import { mergeMarkerDeclarations } from "./internal/merge-markers.js";
import { Logger } from "./internal/logger.js";
import { TransformContext } from "./internal/transform-context.js";
import type {
  ComponentPropUsageInfo,
  CrossFileInfo,
  CrossFileSelectorUsage,
  TransformOptions,
  TransformResult,
  TransformStep,
} from "./internal/transform-types.js";
import type { TypeScriptPrepassMetadata } from "./internal/prepass/typescript-analysis.js";
import { analyzeAfterEmitStep } from "./internal/transform-steps/analyze-after-emit.js";
import { analyzeBeforeEmitStep } from "./internal/transform-steps/analyze-before-emit.js";
import { applyPolicyGates } from "./internal/transform-steps/apply-policy-gates.js";
import { buildImportMapStep } from "./internal/transform-steps/build-import-map.js";
import { cleanupCssImportStep } from "./internal/transform-steps/cleanup-css-import.js";
import { collectStaticPropsStep } from "./internal/transform-steps/collect-static-props.js";
import { collectStyledDeclsStep } from "./internal/transform-steps/collect-styled-decls.js";
import {
  convertKeyframesStep,
  finalizeKeyframesStep,
} from "./internal/transform-steps/convert-keyframes.js";
import { detectCascadeConflictStep } from "./internal/transform-steps/detect-cascade-conflict.js";
import { detectPartialCascadeConflictStep } from "./internal/transform-steps/detect-partial-cascade-conflict.js";
import { detectStringMappingFnsStep } from "./internal/transform-steps/detect-string-mapping-fns.js";
import { detectUnsupportedPatternsStep } from "./internal/transform-steps/detect-unsupported-patterns.js";
import { resolveBaseComponentsStep } from "./internal/transform-steps/resolve-base-components.js";
import { applyLeavesOnlyPolicyStep } from "./internal/transform-steps/apply-leaves-only-policy.js";
import { markPartialImportedRootsStep } from "./internal/transform-steps/mark-partial-imported-roots.js";
import { rewriteCssHelpersStep } from "./internal/transform-steps/rewrite-css-helpers.js";
import { emitStylesStep } from "./internal/transform-steps/emit-styles.js";
import { emitBridgeExportsStep } from "./internal/transform-steps/emit-bridge-exports.js";
import { emitWrappersStep } from "./internal/transform-steps/emit-wrappers.js";
import { ensureMergerImportStep } from "./internal/transform-steps/ensure-merger-import.js";
import { ensureReactImportStep } from "./internal/transform-steps/ensure-react-import.js";
import { extractCssHelpersStep } from "./internal/transform-steps/extract-css-helpers.js";
import { finalize } from "./internal/transform-steps/finalize.js";
import { inlinePropConditionalCssHelpersStep } from "./internal/transform-steps/inline-prop-conditional-css-helpers.js";
import { lowerRulesStep } from "./internal/transform-steps/lower-rules.js";
import { postProcessStep } from "./internal/transform-steps/post-process.js";
import { preflight } from "./internal/transform-steps/preflight.js";
import { propagateSxFromClassNameStep } from "./internal/transform-steps/propagate-sx-from-classname.js";
import { reinsertStaticPropsStep } from "./internal/transform-steps/reinsert-static-props.js";
import { rewriteJsxStep } from "./internal/transform-steps/rewrite-jsx.js";
import { upgradePolymorphicAsPropTypesStep } from "./internal/transform-steps/upgrade-polymorphic-as-prop-types.js";
import { warnPartialMigrationIncompleteStep } from "./internal/transform-steps/warn-partial-migration-incomplete.js";
import { toRealPath } from "./internal/utilities/path-utils.js";

export type {
  BridgeComponentResult,
  TransformOptions,
  TransformResult,
} from "./internal/transform-types.js";

/**
 * Transform styled-components to StyleX
 *
 * This is a sample transform that serves as a starting point.
 * You'll need to implement the actual transformation logic based on your needs.
 */
export default function transform(file: FileInfo, api: API, options: Options): string | null {
  try {
    const transformOptions = options as TransformOptions & { silent?: boolean };
    const result = transformWithWarnings(file, api, transformOptions);
    Logger.logWarnings(result.warnings, file.path, { silent: transformOptions.silent === true });

    // Store sidecar .stylex.ts content in the options side-channel for the runner to write
    if (result.sidecarFiles && result.sidecarFiles.length > 0) {
      const sidecarFilesMap = (options as Record<string, unknown>).sidecarFiles as
        | Map<string, string>
        | undefined;
      if (sidecarFilesMap) {
        const defaultPath = join(
          dirname(file.path),
          `${basename(file.path).replace(/\.\w+$/, "")}.stylex.ts`,
        );
        for (const sidecar of result.sidecarFiles) {
          const sidecarPath = sidecar.filePath ?? defaultPath;
          // Merge with existing content when multiple files write to the same sidecar path
          const existing = sidecarFilesMap.get(sidecarPath);
          sidecarFilesMap.set(
            sidecarPath,
            existing ? mergeMarkerDeclarations(existing, sidecar.content) : sidecar.content,
          );
        }
      }
    }

    // Store bridge results in the options side-channel for post-transform consumer patching.
    // Use realpath to match the prepass key normalization (handles symlinks).
    if (result.bridgeResults && result.bridgeResults.length > 0) {
      const bridgeResultsMap = (options as Record<string, unknown>).bridgeResults as
        | Map<string, import("./internal/transform-types.js").BridgeComponentResult[]>
        | undefined;
      if (bridgeResultsMap) {
        bridgeResultsMap.set(toRealPath(file.path), result.bridgeResults);
      }
    }

    // Store transient prop renames for post-transform consumer patching
    if (result.transientPropRenames && result.transientPropRenames.length > 0) {
      const transientPropRenamesMap = (options as Record<string, unknown>).transientPropRenames as
        | Map<string, import("./internal/transform-types.js").TransientPropRenameResult[]>
        | undefined;
      if (transientPropRenamesMap) {
        transientPropRenamesMap.set(toRealPath(file.path), result.transientPropRenames);
      }
    }

    // Track successfully transformed files so bailed consumers can be bridge-patched
    if (result.code !== null) {
      const transformedFiles = (options as Record<string, unknown>).transformedFiles as
        | Set<string>
        | undefined;
      if (transformedFiles) {
        transformedFiles.add(toRealPath(file.path));
      }
      const transformedComponents = (options as Record<string, unknown>).transformedComponents as
        | Map<string, Set<string>>
        | undefined;
      if (transformedComponents && result.transformedComponentNames) {
        transformedComponents.set(toRealPath(file.path), new Set(result.transformedComponentNames));
      }
    }

    return result.code;
  } catch (e) {
    if (!Logger.isErrorLogged(e)) {
      const msg = `Transform failed: ${e instanceof Error ? e.message : String(e)}`;
      Logger.logError(msg, file.path);
    }
    throw e;
  }
}

/**
 * Transform with detailed warnings returned (for testing)
 */
export function transformWithWarnings(
  file: FileInfo,
  api: API,
  options: TransformOptions,
): TransformResult {
  // Extract per-file cross-file info from the global prepass result
  const enrichedOptions = extractCrossFileInfoForFile(file.path, options);

  if (shouldAttemptStrictFullConversionFirst(file, api, enrichedOptions)) {
    const strictResult = runTransformPipeline(file, api, {
      ...enrichedOptions,
      allowPartialMigration: false,
    });
    if (strictResult.code !== null) {
      return strictResult;
    }
  }

  return runTransformPipeline(file, api, enrichedOptions);
}

// --- Non-exported helpers ---

function shouldAttemptStrictFullConversionFirst(
  file: FileInfo,
  api: API,
  options: TransformOptions,
): boolean {
  return (
    options.allowPartialMigration === true &&
    options.transformMode !== "leavesOnly" &&
    !hasImportedRootStyledStaticAssignment(file, api)
  );
}

function runTransformPipeline(
  file: FileInfo,
  api: API,
  options: TransformOptions,
): TransformResult {
  const ctx = new TransformContext(file, api, options);
  const pipeline: TransformStep[] = [
    preflight,
    applyPolicyGates,
    convertKeyframesStep,
    buildImportMapStep,
    extractCssHelpersStep,
    detectStringMappingFnsStep,
    collectStyledDeclsStep,
    inlinePropConditionalCssHelpersStep,
    resolveBaseComponentsStep,
    applyLeavesOnlyPolicyStep,
    markPartialImportedRootsStep,
    detectUnsupportedPatternsStep,
    detectCascadeConflictStep,
    lowerRulesStep,
    finalizeKeyframesStep,
    detectPartialCascadeConflictStep,
    analyzeBeforeEmitStep,
    rewriteCssHelpersStep,
    emitStylesStep,
    analyzeAfterEmitStep,
    collectStaticPropsStep,
    rewriteJsxStep,
    emitWrappersStep,
    emitBridgeExportsStep,
    propagateSxFromClassNameStep,
    upgradePolymorphicAsPropTypesStep,
    ensureMergerImportStep,
    reinsertStaticPropsStep,
    postProcessStep,
    cleanupCssImportStep,
    ensureReactImportStep,
    warnPartialMigrationIncompleteStep,
  ];

  for (const step of pipeline) {
    const outcome = step(ctx);
    if (outcome.kind === "return") {
      return outcome.result;
    }
  }

  return finalize(ctx);
}

type AstLike = {
  type?: string;
  name?: string;
  value?: unknown;
  source?: AstLike;
  specifiers?: AstLike[];
  local?: AstLike;
  imported?: AstLike;
  init?: AstLike | null;
  id?: AstLike | null;
  tag?: AstLike;
  callee?: AstLike;
  arguments?: AstLike[];
  object?: AstLike;
  expression?: AstLike;
  left?: AstLike;
};

function hasImportedRootStyledStaticAssignment(file: FileInfo, api: API): boolean {
  const j = api.jscodeshift;
  const root = j(file.source);
  const styledLocalNames = collectStyledImportLocalNames(root, j);
  if (styledLocalNames.size === 0) {
    return false;
  }

  const importedLocalNames = collectImportedLocalNames(root, j);
  if (importedLocalNames.size === 0) {
    return false;
  }

  const importedRootStyledDecls = collectImportedRootStyledDeclNames({
    root,
    j,
    styledLocalNames,
    importedLocalNames,
  });
  if (importedRootStyledDecls.size === 0) {
    return false;
  }

  let hasAssignment = false;
  root.find(j.AssignmentExpression).forEach((path) => {
    if (hasAssignment) {
      return;
    }
    const left = unwrapAstExpression(path.node.left as AstLike);
    if (left.type !== "MemberExpression" && left.type !== "OptionalMemberExpression") {
      return;
    }
    const object = unwrapAstExpression(left.object);
    if (object.type === "Identifier" && object.name && importedRootStyledDecls.has(object.name)) {
      hasAssignment = true;
    }
  });

  return hasAssignment;
}

function collectStyledImportLocalNames(
  root: ReturnType<API["jscodeshift"]>,
  j: API["jscodeshift"],
): Set<string> {
  const names = new Set<string>();
  root.find(j.ImportDeclaration).forEach((path) => {
    const node = path.node as AstLike;
    if (node.source?.value !== "styled-components") {
      return;
    }
    for (const specifier of node.specifiers ?? []) {
      if (specifier.type === "ImportDefaultSpecifier" && specifier.local?.name) {
        names.add(specifier.local.name);
        continue;
      }
      if (
        specifier.type === "ImportSpecifier" &&
        specifier.imported?.name === "styled" &&
        specifier.local?.name
      ) {
        names.add(specifier.local.name);
      }
    }
  });
  return names;
}

function collectImportedLocalNames(
  root: ReturnType<API["jscodeshift"]>,
  j: API["jscodeshift"],
): Set<string> {
  const names = new Set<string>();
  root.find(j.ImportDeclaration).forEach((path) => {
    const node = path.node as AstLike;
    if (node.source?.value === "styled-components") {
      return;
    }
    for (const specifier of node.specifiers ?? []) {
      if (specifier.local?.name) {
        names.add(specifier.local.name);
      }
    }
  });
  return names;
}

function collectImportedRootStyledDeclNames(args: {
  root: ReturnType<API["jscodeshift"]>;
  j: API["jscodeshift"];
  styledLocalNames: Set<string>;
  importedLocalNames: Set<string>;
}): Set<string> {
  const { root, j, styledLocalNames, importedLocalNames } = args;
  const names = new Set<string>();
  root.find(j.VariableDeclarator).forEach((path) => {
    const node = path.node as AstLike;
    if (node.id?.type !== "Identifier" || !node.id.name || !node.init) {
      return;
    }
    const styledArg = findStyledCallArgument(node.init, styledLocalNames);
    const rootName = styledArg ? rootIdentifierName(styledArg) : undefined;
    if (rootName && importedLocalNames.has(rootName)) {
      names.add(node.id.name);
    }
  });
  return names;
}

function findStyledCallArgument(node: AstLike, styledLocalNames: Set<string>): AstLike | undefined {
  const current = unwrapAstExpression(node);
  if (current.type === "TaggedTemplateExpression" && current.tag) {
    return findStyledCallArgument(current.tag, styledLocalNames);
  }
  if (current.type === "CallExpression") {
    const callee = current.callee ? unwrapAstExpression(current.callee) : undefined;
    if (callee?.type === "Identifier" && callee.name && styledLocalNames.has(callee.name)) {
      return current.arguments?.[0];
    }
    if (callee) {
      return findStyledCallArgument(callee, styledLocalNames);
    }
  }
  if (
    (current.type === "MemberExpression" || current.type === "OptionalMemberExpression") &&
    current.object
  ) {
    return findStyledCallArgument(current.object, styledLocalNames);
  }
  return undefined;
}

function rootIdentifierName(node: AstLike): string | undefined {
  const current = unwrapAstExpression(node);
  if (current.type === "Identifier") {
    return current.name;
  }
  if (
    (current.type === "MemberExpression" || current.type === "OptionalMemberExpression") &&
    current.object
  ) {
    return rootIdentifierName(current.object);
  }
  return undefined;
}

function unwrapAstExpression(node: AstLike | undefined): AstLike {
  let current = node;
  while (
    current?.type === "TSAsExpression" ||
    current?.type === "TSInstantiationExpression" ||
    current?.type === "TSNonNullExpression" ||
    current?.type === "TypeCastExpression" ||
    current?.type === "ParenthesizedExpression"
  ) {
    current = current.expression;
  }
  return current ?? {};
}

/**
 * Shape of the global prepass result attached to jscodeshift options by runTransform.
 * This is an untyped passthrough from jscodeshift's options bag, so we define
 * the expected shape here to avoid scattered inline type assertions.
 */
interface GlobalPrepassResult {
  selectorUsages: Map<string, CrossFileSelectorUsage[]>;
  componentsNeedingGlobalSelectorBridge: Map<string, Set<string>>;
  propUsageByFile?: Map<string, Map<string, ComponentPropUsageInfo>>;
  styledDefFiles?: Map<string, Set<string>>;
  stylexComponentFiles?: Map<string, Set<string>>;
  globalLeafKeys?: Set<string>;
  transformedFiles?: Set<string>;
  transformedComponents?: Map<string, Set<string>>;
  typeScriptMetadata?: TypeScriptPrepassMetadata;
}

/**
 * Extract per-file cross-file info from the global prepass result stored in jscodeshift options.
 * The prepass result (if any) is passed via `options.crossFilePrepassResult` from runTransform.
 */
function extractCrossFileInfoForFile(
  filePath: string,
  options: TransformOptions,
): TransformOptions {
  // jscodeshift passes arbitrary options through; we access the prepass result
  // that runTransform attached. This is the one place we need an assertion
  // because jscodeshift's Options type doesn't know about our custom field.
  const prepass = (options as Record<string, unknown>).crossFilePrepassResult as
    | GlobalPrepassResult
    | undefined;

  if (!prepass) {
    return options;
  }

  // Normalize to the same path form the prepass used. The prepass resolves to
  // real paths (handling macOS /var → /private/var symlinks), so try pathResolve
  // first and fall back to realpathSync if the key isn't found.
  const absPath = resolveToPrepassKey(filePath, prepass);
  const selectorUsages = prepass.selectorUsages.get(absPath);
  const bridgeComponentNames = prepass.componentsNeedingGlobalSelectorBridge?.get(absPath);
  const propUsageByComponent = prepass.propUsageByFile?.get(absPath);

  const hasStyledDefFiles = prepass.styledDefFiles && prepass.styledDefFiles.size > 0;
  const hasStylexComponentFiles =
    prepass.stylexComponentFiles && prepass.stylexComponentFiles.size > 0;
  const hasPropUsage = propUsageByComponent && propUsageByComponent.size > 0;
  const hasGlobalLeafKeys = prepass.globalLeafKeys && prepass.globalLeafKeys.size > 0;
  const hasTransformedFiles = prepass.transformedFiles !== undefined;
  const hasTransformedComponents = prepass.transformedComponents !== undefined;
  const hasTypeScriptMetadata =
    prepass.typeScriptMetadata !== undefined && prepass.typeScriptMetadata.files.length > 0;

  if (
    (!selectorUsages || selectorUsages.length === 0) &&
    !bridgeComponentNames &&
    !hasPropUsage &&
    !hasStyledDefFiles &&
    !hasStylexComponentFiles &&
    !hasGlobalLeafKeys &&
    !hasTransformedFiles &&
    !hasTransformedComponents &&
    !hasTypeScriptMetadata
  ) {
    return options;
  }

  const crossFileInfo: CrossFileInfo = {
    selectorUsages: selectorUsages ?? [],
    bridgeComponentNames,
    propUsageByComponent,
    styledDefFiles: prepass.styledDefFiles,
    stylexComponentFiles: prepass.stylexComponentFiles,
    globalLeafKeys: prepass.globalLeafKeys,
    transformedFiles: prepass.transformedFiles,
    transformedComponents: prepass.transformedComponents,
    typeScriptMetadata: prepass.typeScriptMetadata,
  };

  return {
    ...options,
    crossFileInfo,
    globalLeafKeys: options.globalLeafKeys ?? prepass.globalLeafKeys,
  };
}

/**
 * Resolve a file path to the key form used by the prepass maps.
 * Tries pathResolve first; falls back to realpathSync if the key isn't found
 * (handles macOS /var → /private/var and similar symlink divergences).
 */
function resolveToPrepassKey(filePath: string, prepass: GlobalPrepassResult): string {
  const resolved = pathResolve(filePath);
  if (
    prepass.selectorUsages.has(resolved) ||
    prepass.componentsNeedingGlobalSelectorBridge?.has(resolved) ||
    prepass.propUsageByFile?.has(resolved)
  ) {
    return resolved;
  }
  try {
    const real = realpathSync(resolved);
    if (real !== resolved) {
      return real;
    }
  } catch {
    // File may not exist yet (e.g. dry-run); keep the resolved path
  }
  return resolved;
}
