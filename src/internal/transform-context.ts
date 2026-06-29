/**
 * Shared transform context passed through pipeline steps.
 * Core concepts: adapter wiring, parsing helpers, and shared state.
 */
import type { API, FileInfo } from "jscodeshift";

import type {
  Adapter,
  ImportSource,
  ImportSpec,
  ResolveValueContext,
  ResolveValueDirectionalResult,
  ResolveValueResult,
} from "../adapter.js";
import { setUseLogicalProperties } from "./css-prop-mapping.js";
import { assertValidAdapter } from "./public-api-validation.js";
import type { WarningLog } from "./logger.js";
import { parseExpr as parseExprImpl } from "./transform-parse-expr.js";
import { createResolveAdapterSafe } from "./transform-resolve-value.js";
import {
  rewriteCssVarsInAstNodeRoot as rewriteCssVarsInAstNodeRootImpl,
  rewriteCssVarsInStyleObject as rewriteCssVarsInStyleObjectImpl,
} from "./transform-css-vars.js";
import {
  getStaticPropertiesFromImport as getStaticPropertiesFromImportImpl,
  patternProp as patternPropImpl,
} from "./transform-utils.js";
import type {
  LocalElementOverrideCandidate,
  LocalStylexVarRef,
  StyledDecl,
  TransformOptions,
} from "./transform-types.js";
import type { RelationOverride } from "./lower-rules/state.js";

export type ExportInfo = { exportName: string; isDefault: boolean; isSpecifier: boolean };

export class TransformContext {
  file: FileInfo;
  api: API;
  options: TransformOptions;
  j: API["jscodeshift"];
  root: ReturnType<API["jscodeshift"]>;
  warnings: WarningLog[];
  hasChanges: boolean;
  adapter: Adapter;
  resolverImports: Map<string, ImportSpec>;
  resolveValueSafe: (ctx: ResolveValueContext) => ResolveValueResult | undefined;
  resolveValueDirectionalSafe: (
    ctx: ResolveValueContext,
  ) => ResolveValueResult | ResolveValueDirectionalResult | undefined;
  resolveCallSafe: Adapter["resolveCall"];
  resolveSelectorSafe: Adapter["resolveSelector"];
  resolveBaseComponent?: Adapter["resolveBaseComponent"];
  resolveValueBailRef: { value: boolean };
  patternProp: (keyName: string, valueId?: any) => any;
  getStaticPropertiesFromImport: (source: ImportSource, componentName: string) => string[];
  parseExpr: (exprSource: string) => any;
  localStylexVars: Map<string, LocalStylexVarRef>;
  getOrCreateLocalStylexVar: (
    cssName: string,
    defaultValue: string | number | null,
  ) => LocalStylexVarRef;
  rewriteCssVarsInStyleObject: (
    obj: Record<string, unknown>,
    definedVars: Map<string, string>,
    varsToDrop: Set<string>,
    cssProperty?: string,
  ) => void;
  rewriteCssVarsInAstNode: (
    node: { type: string },
    definedVars: Map<string, string>,
    varsToDrop: Set<string>,
    cssProperty?: string,
  ) => void;

  preserveReactImport = false;
  styledImports?: any;
  styledDefaultImport?: string;
  styledLocalNames: Set<string>;
  isStyledTag: (tag: any) => boolean;
  keyframesLocal?: string;
  keyframesNames: Set<string>;
  keyframesAliases?: Map<string, string>;
  importMap?: Map<string, { importedName: string; source: ImportSource }>;
  cssLocal?: string;
  cssHelpers?: any;
  stringMappingFns?: Map<
    string,
    {
      param: string;
      testParam: string;
      whenValue: string;
      thenValue: string;
      elseValue: string;
    }
  >;
  styledDecls?: StyledDecl[];
  hasUniversalSelectors?: boolean;
  universalSelectorLoc?: { line: number; column: number } | null;
  resolvedStyleObjects?: Map<string, unknown>;
  relationOverrides?: RelationOverride[];
  ancestorSelectorParents?: Set<string>;
  emptyStyleKeys?: Set<string>;
  stylesIdentifier?: string;
  stylesInsertPosition?: "end" | "afterImports";
  /**
   * When set, the file already contains `const <name> = stylex.create({...})` and
   * the codemod will append new style entries into that existing object expression
   * instead of emitting a new declaration. Enables incremental migration where some
   * components are already on StyleX and new entries should merge into the same
   * `styles` object.
   */
  existingStylexStylesTarget?: {
    /** Binding name of the existing `stylex.create` declaration (e.g. "styles") */
    name: string;
    /** The ObjectExpression node passed to `stylex.create(...)` — appended to in place */
    objectExpression: unknown;
    /** Property keys already present in the existing object (used to detect collisions) */
    existingKeys: Set<string>;
  };
  declByLocal?: Map<string, StyledDecl>;
  extendedBy?: Map<string, string[]>;
  exportedComponents?: Map<string, ExportInfo>;
  wrapperNames?: Set<string>;
  staticPropertyAssignments?: Map<string, any[]>;
  staticPropertyNames?: Map<string, string[]>;
  resolverImportAliases?: Map<string, string>;
  newImportLocalNames?: Set<string>;
  newImportSourcesByLocal?: Map<string, Set<string>>;
  needsReactImport?: boolean;
  needsReactNamespaceImport?: boolean;
  /** Cross-file selector usages where this file is the consumer */
  crossFileSelectorUsages?: import("./transform-types.js").CrossFileSelectorUsage[];
  /** Component names in this file that need a global selector bridge className */
  bridgeComponentNames?: Set<string>;
  /** Prepass prop usage inventory for styled components defined in this file. */
  propUsageByComponent?: import("./transform-types.js").CrossFileInfo["propUsageByComponent"];
  /** Marker variable names generated for cross-file parent components and sibling selectors (parentStyleKey → markerName) */
  crossFileMarkers?: Map<string, string>;
  /** Style keys that use sibling markers (scoped marker replaces defaultMarker) */
  siblingMarkerKeys?: Set<string>;
  /** Parent style keys that need defaultMarker() (have at least one override without a scoped marker) */
  parentsNeedingDefaultMarker?: Set<string>;
  /** Adjacent-sibling selectors (`& + &`) deferred for same-file JSX adjacency analysis. */
  deferredAdjacentSiblingWarnings?: Array<{
    localName: string;
    overrideStyleKey: string;
    loc?: { line: number; column: number } | null;
  }>;
  /** Same-file element-selector overrides deferred for local JSX topology proof. */
  deferredLocalElementWarnings?: Array<{
    localName: string;
    override: LocalElementOverrideCandidate;
  }>;
  /** Sidecar .stylex.ts files (defineMarker declarations), populated by emitStylesStep */
  sidecarFiles?: import("./transform-types.js").SidecarFile[];
  /** Bridge components emitted for unconverted consumer selectors. */
  bridgeResults?: import("./transform-types.js").BridgeComponentResult[];
  /** Transient prop renames for exported components (for consumer patching). */
  transientPropRenames?: import("./transform-types.js").TransientPropRenameResult[];
  /** Inline @keyframes extracted from styled component templates: JS identifier name → frame objects */
  inlineKeyframes?: Map<string, Record<string, Record<string, unknown>>>;
  /** Maps CSS @keyframes names to sanitized JS identifier names (e.g. "fade-in" → "fadeIn") */
  inlineKeyframeNameMap?: Map<string, string>;

  constructor(file: FileInfo, api: API, options: TransformOptions) {
    const j = api.jscodeshift;
    const root = j(file.source);
    const warnings: WarningLog[] = [];

    const adapter = options.adapter;
    assertValidAdapter(
      adapter,
      "transform(options) - missing `adapter` (if you run the jscodeshift transform directly, pass options.adapter)",
    );

    setUseLogicalProperties(adapter.usePhysicalProperties === false);

    const resolverImports = new Map<string, ImportSpec>();
    const localStylexVars = new Map<string, LocalStylexVarRef>();
    const localStylexVarKeyFor = (cssName: string, defaultValue: string | number | null): string =>
      `${cssName}\u0000${defaultValue}`;
    let nextLocalStylexVarOrder = 0;
    const getOrCreateLocalStylexVar = (
      cssName: string,
      defaultValue: string | number | null,
    ): LocalStylexVarRef => {
      const mapKey = localStylexVarKeyFor(cssName, defaultValue);
      const existing = localStylexVars.get(mapKey);
      if (existing) {
        return existing;
      }
      const baseKeyName = cssName;
      const baseName = file.path.replace(/^.*[\\/]/, "").replace(/\.\w+$/, "");
      const filePrefix = baseName
        .split(/[^a-zA-Z0-9_$]+/)
        .filter(Boolean)
        .map((part, index) =>
          index === 0
            ? part.charAt(0).toLowerCase() + part.slice(1)
            : part.charAt(0).toUpperCase() + part.slice(1),
        )
        .join("");
      const groupName = `${filePrefix}Variables`;
      const usedKeyNames = new Set(
        [...localStylexVars.values()]
          .filter((ref) => ref.groupName === groupName)
          .map((ref) => ref.keyName),
      );
      let keyName = baseKeyName;
      let suffix = 1;
      while (usedKeyNames.has(keyName)) {
        keyName = `${baseKeyName}${suffix}`;
        suffix += 1;
      }
      const ref = {
        cssName,
        groupName,
        keyName,
        defaultValue,
        sourceOrder: nextLocalStylexVarOrder,
        sidecarFileName: `${baseName}.stylex`,
      };
      nextLocalStylexVarOrder += 1;
      localStylexVars.set(mapKey, ref);
      return ref;
    };
    const getLocalStylexVar = (
      cssName: string,
      defaultValue: string,
    ): LocalStylexVarRef | undefined =>
      localStylexVars.get(localStylexVarKeyFor(cssName, defaultValue));
    const {
      resolveValueSafe,
      resolveValueDirectionalSafe,
      resolveCallSafe,
      resolveSelectorSafe,
      bailRef,
    } = createResolveAdapterSafe({
      adapter,
      warnings,
    });

    const parseExpr = (exprSource: string): any => parseExprImpl(api, exprSource);

    const buildCssVarRewriteContext = (
      definedVars: Map<string, string>,
      varsToDrop: Set<string>,
    ) => ({
      filePath: file.path,
      definedVars,
      varsToDrop,
      localStylexVars,
      getLocalStylexVar,
      getOrCreateLocalStylexVar,
      resolveValue: resolveValueSafe,
      addImport: (imp: ImportSpec) => resolverImports.set(JSON.stringify(imp), imp),
      parseExpr,
      j,
    });

    const rewriteCssVarsInStyleObject = (
      obj: Record<string, unknown>,
      definedVars: Map<string, string>,
      varsToDrop: Set<string>,
      cssProperty?: string,
    ): void =>
      rewriteCssVarsInStyleObjectImpl({
        obj,
        ...(cssProperty ? { cssProperty } : {}),
        ...buildCssVarRewriteContext(definedVars, varsToDrop),
      });

    const rewriteCssVarsInAstNode = (
      node: { type: string },
      definedVars: Map<string, string>,
      varsToDrop: Set<string>,
      cssProperty?: string,
    ): void =>
      rewriteCssVarsInAstNodeRootImpl({
        node,
        ...(cssProperty ? { cssProperty } : {}),
        ...buildCssVarRewriteContext(definedVars, varsToDrop),
      });

    const patternProp = (keyName: string, valueId?: any) => patternPropImpl(j, keyName, valueId);
    const getStaticPropertiesFromImport = (source: ImportSource, componentName: string): string[] =>
      getStaticPropertiesFromImportImpl({ j, source, componentName });

    this.file = file;
    this.api = api;
    this.options = options;
    this.j = j;
    this.root = root;
    this.warnings = warnings;
    this.hasChanges = false;
    this.adapter = adapter;
    this.resolverImports = resolverImports;
    this.localStylexVars = localStylexVars;
    this.getOrCreateLocalStylexVar = getOrCreateLocalStylexVar;
    this.resolveValueSafe = resolveValueSafe;
    this.resolveValueDirectionalSafe = resolveValueDirectionalSafe;
    this.resolveCallSafe = resolveCallSafe;
    this.resolveSelectorSafe = resolveSelectorSafe;
    this.resolveBaseComponent = adapter.resolveBaseComponent;
    this.resolveValueBailRef = bailRef;
    this.patternProp = patternProp;
    this.getStaticPropertiesFromImport = getStaticPropertiesFromImport;
    this.parseExpr = parseExpr;
    this.rewriteCssVarsInStyleObject = rewriteCssVarsInStyleObject;
    this.rewriteCssVarsInAstNode = rewriteCssVarsInAstNode;
    this.styledLocalNames = new Set<string>();
    this.isStyledTag = () => false;
    this.keyframesNames = new Set<string>();
    this.keyframesAliases = new Map<string, string>();

    // Wire cross-file info from options
    if (options.crossFileInfo) {
      this.crossFileSelectorUsages = options.crossFileInfo.selectorUsages;
      this.bridgeComponentNames = options.crossFileInfo.bridgeComponentNames;
      this.propUsageByComponent = options.crossFileInfo.propUsageByComponent;
    }
  }

  markChanged(): void {
    this.hasChanges = true;
  }
}
