/**
 * Shared transform context passed through pipeline steps.
 * Core concepts: adapter wiring, parsing helpers, and shared state.
 */
import type { API, FileInfo } from "jscodeshift";

import type { Adapter, ImportSource, ImportSpec } from "../adapter.js";
import { assertValidAdapter } from "./public-api-validation.js";
import type { WarningLog } from "./logger.js";
import { parseExpr as parseExprImpl } from "./transform-parse-expr.js";
import { createResolveAdapterSafe } from "./transform-resolve-value.js";
import { rewriteCssVarsInStyleObject as rewriteCssVarsInStyleObjectImpl } from "./transform-css-vars.js";
import {
  getStaticPropertiesFromImport as getStaticPropertiesFromImportImpl,
  patternProp as patternPropImpl,
} from "./transform-utils.js";
import type { TransformOptions } from "./transform-types.js";
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
  resolveValueSafe: Adapter["resolveValue"];
  resolveCallSafe: Adapter["resolveCall"];
  resolveSelectorSafe: Adapter["resolveSelector"];
  resolveValueBailRef: { value: boolean };
  patternProp: (keyName: string, valueId?: any) => any;
  getStaticPropertiesFromImport: (source: ImportSource, componentName: string) => string[];
  parseExpr: (exprSource: string) => any;
  rewriteCssVarsInStyleObject: (
    obj: Record<string, unknown>,
    definedVars: Map<string, string>,
    varsToDrop: Set<string>,
  ) => void;

  preserveReactImport = false;
  styledImports?: any;
  styledDefaultImport?: string;
  styledLocalNames: Set<string>;
  isStyledTag: (tag: any) => boolean;
  keyframesLocal?: string;
  keyframesNames: Set<string>;
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
  styledDecls?: any[];
  hasUniversalSelectors?: boolean;
  universalSelectorLoc?: { line: number; column: number } | null;
  resolvedStyleObjects?: Map<string, unknown>;
  relationOverrides?: RelationOverride[];
  ancestorSelectorParents?: Set<string>;
  emptyStyleKeys?: Set<string>;
  stylesIdentifier?: string;
  stylesInsertPosition?: "end" | "afterImports";
  declByLocal?: Map<string, any>;
  extendedBy?: Map<string, string[]>;
  exportedComponents?: Map<string, ExportInfo>;
  wrapperNames?: Set<string>;
  staticPropertyAssignments?: Map<string, any[]>;
  staticPropertyNames?: Map<string, string[]>;
  resolverImportAliases?: Map<string, string>;
  newImportLocalNames?: Set<string>;
  newImportSourcesByLocal?: Map<string, Set<string>>;
  needsReactImport?: boolean;

  constructor(file: FileInfo, api: API, options: TransformOptions) {
    const j = api.jscodeshift;
    const root = j(file.source);
    const warnings: WarningLog[] = [];

    const adapter = options.adapter;
    assertValidAdapter(
      adapter,
      "transform(options) - missing `adapter` (if you run the jscodeshift transform directly, pass options.adapter)",
    );

    const resolverImports = new Map<string, ImportSpec>();
    const { resolveValueSafe, resolveCallSafe, resolveSelectorSafe, bailRef } =
      createResolveAdapterSafe({
        adapter,
        warnings,
      });

    const parseExpr = (exprSource: string): any => parseExprImpl(api, exprSource);

    const rewriteCssVarsInStyleObject = (
      obj: Record<string, unknown>,
      definedVars: Map<string, string>,
      varsToDrop: Set<string>,
    ): void =>
      rewriteCssVarsInStyleObjectImpl({
        obj,
        filePath: file.path,
        definedVars,
        varsToDrop,
        resolveValue: resolveValueSafe,
        addImport: (imp: ImportSpec) => resolverImports.set(JSON.stringify(imp), imp),
        parseExpr,
        j,
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
    this.resolveValueSafe = resolveValueSafe;
    this.resolveCallSafe = resolveCallSafe;
    this.resolveSelectorSafe = resolveSelectorSafe;
    this.resolveValueBailRef = bailRef;
    this.patternProp = patternProp;
    this.getStaticPropertiesFromImport = getStaticPropertiesFromImport;
    this.parseExpr = parseExpr;
    this.rewriteCssVarsInStyleObject = rewriteCssVarsInStyleObject;
    this.styledLocalNames = new Set<string>();
    this.isStyledTag = () => false;
    this.keyframesNames = new Set<string>();
  }

  markChanged(): void {
    this.hasChanges = true;
  }
}
