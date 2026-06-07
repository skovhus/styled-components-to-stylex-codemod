/**
 * Emits wrapper component implementations and stylex.props usage.
 * Core concepts: JSX construction, prop forwarding, and style merging.
 */
import type {
  ASTNode,
  Collection,
  Identifier,
  JSCodeshift,
  JSXAttribute,
  JSXSpreadAttribute,
  Property,
  RestElement,
} from "jscodeshift";
import type {
  ImportSource,
  StyleMergerConfig,
  ThemeHookConfig,
  WrappedComponentInterfaceResult,
} from "../../adapter.js";
import type { StyledDecl, VariantDimension } from "../transform-types.js";
import type {
  TypeScriptComponentMetadata,
  TypeScriptPrepassMetadata,
  TypeScriptPropMetadata,
} from "../prepass/typescript-analysis.js";
import { emitStyleMerging } from "./style-merger.js";
import type { ExportInfo, ExpressionKind, InlineStyleProp, WrapperPropDefaults } from "./types.js";
import {
  appendAttrsProvidedPropOmissions,
  type AttrsProvidedPropOptions,
  TAG_TO_HTML_ELEMENT,
  VOID_TAGS,
} from "./type-helpers.js";
import { isIdentifierNode } from "../utilities/jscodeshift-utils.js";
import { resolveExistingFilePath } from "../utilities/path-utils.js";
import { transformedComponentAcceptsSx } from "../utilities/sx-surface.js";
import { findTypeScriptComponentMetadata } from "../utilities/typescript-metadata.js";
import { mergeWrappedComponentInterface } from "../utilities/wrapped-component-interface.js";
import { typeContainsPolymorphicAs } from "../utilities/polymorphic-as-detection.js";
import type { FunctionParams, JsxAttr, JsxTagName, StatementKind } from "./jsx-builders.js";
import * as jb from "./jsx-builders.js";
import type { LogicalExpressionOperand } from "./variant-condition.js";
import * as vc from "./variant-condition.js";
import * as seb from "./style-expr-builders.js";
import {
  expressionReferencesComponentAlias,
  inlineTypeNeedsElementGeneric,
  isExternalStyleOrSxPropName,
  isExternalStylePropName,
  jsxNameFromString,
  UNIVERSAL_PROP_TYPES,
} from "./wrapper-emitter-helpers.js";
import {
  joinIntersection,
  keyofExprForType,
  stringifyTsType,
  toTypeKey,
  withChildren,
} from "./wrapper-type-text.js";
import { getExplicitPropNames } from "./wrapper-explicit-prop-names.js";

export type { JsxAttr, JsxTagName, StatementKind };

export const SX_PROP_TYPE_TEXT = "sx?: stylex.StyleXStyles";

type TsTypeAnnotationInput = Parameters<JSCodeshift["tsTypeAnnotation"]>[0];
type BlockStatementBody = Parameters<JSCodeshift["blockStatement"]>[0];
type AstNodeOrNull = ASTNode | null | undefined;

type WrapperEmitterArgs = {
  root: Collection<ASTNode>;
  j: JSCodeshift;
  filePath: string;
  localSource: string;
  wrapperDecls: StyledDecl[];
  wrapperNames: Set<string>;
  patternProp: (keyName: string, valueId?: ASTNode) => Property;
  exportedComponents: Map<string, ExportInfo>;
  stylesIdentifier: string;
  styleMerger: StyleMergerConfig | null;
  themeHook: ThemeHookConfig;
  themeHookLocalName: string;
  emptyStyleKeys?: Set<string>;
  ancestorSelectorParents?: Set<string>;
  /** Maps styleKey → marker variable name for scoped markers (sibling + cross-file) */
  crossFileMarkers?: Map<string, string>;
  /** Style keys that use sibling markers (scoped marker replaces defaultMarker) */
  siblingMarkerKeys?: Set<string>;
  /** Parent style keys that need defaultMarker() (have at least one override without a scoped marker) */
  parentsNeedingDefaultMarker?: Set<string>;
  useSxProp: boolean;
  /** Import map of local identifiers to their import source. Used to query adapter
   * hooks about wrapped imported components. */
  importMap?: Map<string, { importedName: string; source: ImportSource }>;
  sourceOverrides?: ReadonlyMap<string, string>;
  typeScriptMetadata?: TypeScriptPrepassMetadata;
  /** Optional adapter hook describing the public interface of an imported component
   * being wrapped via `styled(Component)`. */
  wrappedComponentInterface?: (ctx: {
    localName: string;
    importSource: string;
    importedName: string;
    filePath: string;
  }) => WrappedComponentInterfaceResult | undefined;
};

export class WrapperEmitter {
  readonly root: Collection<ASTNode>;
  readonly j: JSCodeshift;
  readonly filePath: string;
  readonly localSource: string;
  readonly wrapperDecls: StyledDecl[];
  readonly wrapperNames: Set<string>;
  readonly patternProp: (keyName: string, valueId?: ASTNode) => Property;
  readonly exportedComponents: Map<string, ExportInfo>;
  readonly stylesIdentifier: string;
  readonly styleMerger: StyleMergerConfig | null;
  readonly themeHook: ThemeHookConfig;
  readonly themeHookLocalName: string;
  readonly emptyStyleKeys: Set<string>;
  readonly ancestorSelectorParents: Set<string>;
  readonly crossFileMarkers: Map<string, string>;
  readonly siblingMarkerKeys: Set<string>;
  readonly parentsNeedingDefaultMarker: Set<string>;
  readonly useSxProp: boolean;
  readonly importMap: Map<string, { importedName: string; source: ImportSource }>;
  readonly sourceOverrides?: ReadonlyMap<string, string>;
  readonly typeScriptMetadata?: TypeScriptPrepassMetadata;
  readonly wrappedComponentInterface?: (ctx: {
    localName: string;
    importSource: string;
    importedName: string;
    filePath: string;
  }) => WrappedComponentInterfaceResult | undefined;

  // For plain JS/JSX and Flow transforms, skip emitting TS syntax entirely for now.
  readonly emitTypes: boolean;

  // Local caches (were in `usage.ts`)
  private usedAttrsCache = new Map<string, Set<string>>();
  private jsxCallsitesCache = new Map<string, { hasAny: boolean }>();
  private jsxChildrenUsageCache = new Map<string, boolean>();
  private usedAsValueCache = new Map<string, boolean>();
  private aliasedJsxSpreadUsageCache = new Map<string, boolean>();
  private forwardedAsUsageCache = new Map<string, boolean>();

  constructor(args: WrapperEmitterArgs) {
    this.root = args.root;
    this.j = args.j;
    this.filePath = args.filePath;
    this.localSource = args.localSource;
    this.wrapperDecls = args.wrapperDecls;
    this.wrapperNames = args.wrapperNames;
    this.patternProp = args.patternProp;
    this.exportedComponents = args.exportedComponents;
    this.stylesIdentifier = args.stylesIdentifier;
    this.styleMerger = args.styleMerger;
    this.themeHook = args.themeHook;
    this.themeHookLocalName = args.themeHookLocalName;
    this.emptyStyleKeys = args.emptyStyleKeys ?? new Set<string>();
    this.ancestorSelectorParents = args.ancestorSelectorParents ?? new Set<string>();
    this.crossFileMarkers = args.crossFileMarkers ?? new Map<string, string>();
    this.siblingMarkerKeys = args.siblingMarkerKeys ?? new Set<string>();
    this.parentsNeedingDefaultMarker = args.parentsNeedingDefaultMarker ?? new Set<string>();
    this.useSxProp = args.useSxProp;
    this.importMap = args.importMap ?? new Map();
    this.sourceOverrides = args.sourceOverrides;
    this.typeScriptMetadata = args.typeScriptMetadata;
    this.wrappedComponentInterface = args.wrappedComponentInterface;
    this.emitTypes = this.filePath.endsWith(".ts") || this.filePath.endsWith(".tsx");
  }

  /**
   * Returns true when the wrapped imported component for `styled(Foo)`
   * accepts a StyleX `sx` prop, per the adapter `wrappedComponentInterface` hook.
   * Falls back to false for local components or when the adapter does not
   * configure the hook.
   */
  wrappedComponentAcceptsSxProp(componentLocalName: string): boolean {
    const componentInterface = this.wrappedComponentInterfaceFor(componentLocalName);
    return componentInterface?.acceptsSx === true && componentInterface.sxTarget !== "inner";
  }

  wrappedComponentInterfaceFor(
    componentLocalName: string,
  ): WrappedComponentInterfaceResult | undefined {
    if (!this.useSxProp) {
      return undefined;
    }
    const importInfo = this.importMap.get(componentLocalName);
    const typedComponent = this.typeScriptComponentMetadataFor(componentLocalName);
    const typedInterface = typedComponent?.supportsSxProp
      ? {
          acceptsSx: true,
          ...(typedComponent.sxTarget ? { sxTarget: typedComponent.sxTarget } : {}),
          sxExcludedProperties: typedComponent.sxExcludedProperties,
          sxAllowedProperties: typedComponent.sxAllowedProperties,
        }
      : undefined;
    if (importInfo) {
      const adapterResult = this.wrappedComponentInterface?.({
        localName: componentLocalName,
        importSource: importInfo.source.value,
        importedName: importInfo.importedName,
        filePath: this.filePath,
      });
      if (adapterResult !== undefined) {
        return mergeWrappedComponentInterface(adapterResult, typedInterface);
      }
    }
    if (typedComponent) {
      if (typedInterface) {
        return typedInterface;
      }
      if (!this.hasSourceOverrideFor(componentLocalName)) {
        return { acceptsSx: false };
      }
    }
    const acceptsSx =
      importInfo?.source.kind === "absolutePath" &&
      transformedComponentAcceptsSx({
        absolutePath: importInfo.source.value,
        componentNames:
          importInfo.importedName === "default"
            ? [componentLocalName, importInfo.importedName]
            : [importInfo.importedName],
        sourceOverrides: this.sourceOverrides,
      });
    return acceptsSx ? { acceptsSx: true } : undefined;
  }

  propsTypeNameFor(localName: string): string {
    return `${localName}Props`;
  }

  getUsedAttrs(localName: string): Set<string> {
    const cached = this.usedAttrsCache.get(localName);
    if (cached) {
      return cached;
    }
    const attrs = new Set<string>();
    const { root, j } = this;
    const collectFromOpening = (
      opening:
        | (ASTNode & {
            attributes?: Array<JSXAttribute | JSXSpreadAttribute>;
          })
        | null,
    ) => {
      const attrNodes = (opening?.attributes ?? []) as Array<JSXAttribute | JSXSpreadAttribute>;
      for (const a of attrNodes) {
        if (!a) {
          continue;
        }
        if (a.type === "JSXSpreadAttribute") {
          // Unknown props shape -> treat as "needs intrinsic props"
          attrs.add("*");
          continue;
        }
        if (a.type === "JSXAttribute" && a.name?.type === "JSXIdentifier") {
          attrs.add(a.name.name);
        }
      }
    };
    root
      .find(j.JSXElement, {
        openingElement: { name: { type: "JSXIdentifier", name: localName } },
      } as any)
      .forEach((p: any) => collectFromOpening(p.node.openingElement));
    root
      .find(j.JSXSelfClosingElement, { name: { type: "JSXIdentifier", name: localName } } as any)
      .forEach((p: any) => collectFromOpening(p.node));
    this.usedAttrsCache.set(localName, attrs);
    return attrs;
  }

  hasForwardedAsUsage(localName: string, visiting: Set<string> = new Set<string>()): boolean {
    const cached = this.forwardedAsUsageCache.get(localName);
    if (cached !== undefined) {
      return cached;
    }
    if (visiting.has(localName)) {
      return false;
    }
    visiting.add(localName);

    if (this.getUsedAttrs(localName).has("forwardedAs")) {
      this.forwardedAsUsageCache.set(localName, true);
      visiting.delete(localName);
      return true;
    }

    for (const wrapperDecl of this.wrapperDecls) {
      if (wrapperDecl.base.kind !== "component" || wrapperDecl.base.ident !== localName) {
        continue;
      }
      if (this.hasForwardedAsUsage(wrapperDecl.localName, visiting)) {
        this.forwardedAsUsageCache.set(localName, true);
        visiting.delete(localName);
        return true;
      }
    }

    visiting.delete(localName);
    this.forwardedAsUsageCache.set(localName, false);
    return false;
  }

  getJsxCallsites(localName: string): { hasAny: boolean } {
    const cached = this.jsxCallsitesCache.get(localName);
    if (cached) {
      return cached;
    }
    const { root, j } = this;
    const hasAny =
      root
        .find(j.JSXElement, {
          openingElement: { name: { type: "JSXIdentifier", name: localName } },
        } as any)
        .size() > 0 ||
      root
        .find(j.JSXSelfClosingElement, { name: { type: "JSXIdentifier", name: localName } } as any)
        .size() > 0;
    const out = { hasAny };
    this.jsxCallsitesCache.set(localName, out);
    return out;
  }

  hasJsxChildrenUsage(localName: string): boolean {
    const cached = this.jsxChildrenUsageCache.get(localName);
    if (cached !== undefined) {
      return cached;
    }
    const { root, j } = this;
    const hasChildren =
      root
        .find(j.JSXElement, {
          openingElement: { name: { type: "JSXIdentifier", name: localName } },
        } as any)
        .filter((p: any) => {
          const children = (p.node as any).children ?? [];
          return (children as any[]).some((c: any) => {
            if (!c) {
              return false;
            }
            if (c.type === "JSXText") {
              return String(c.value ?? "").trim().length > 0;
            }
            if (c.type === "JSXExpressionContainer") {
              return c.expression?.type !== "JSXEmptyExpression";
            }
            return true;
          });
        })
        .size() > 0;
    this.jsxChildrenUsageCache.set(localName, hasChildren);
    return hasChildren;
  }

  isUsedAsValueInFile(localName: string): boolean {
    const cached = this.usedAsValueCache.get(localName);
    if (cached !== undefined) {
      return cached;
    }
    const { root, j } = this;
    // Conservative: treat JSX expression usage as "used as value"
    // e.g. outerElementType={OuterWrapper}
    const inJsxExpr =
      root
        .find(j.JSXExpressionContainer, {
          expression: { type: "Identifier", name: localName },
        } as any)
        .size() > 0;
    this.usedAsValueCache.set(localName, inJsxExpr);
    return inJsxExpr;
  }

  isUsedAsValue(d: StyledDecl): boolean {
    return Boolean(d.usedAsValue) || this.isUsedAsValueInFile(d.localName);
  }

  isBroadValueUsage(d: StyledDecl): boolean {
    return this.isUsedAsValue(d) && d.valueUsageKind !== "elementTypeProp";
  }

  requiresRestForValueUsage(d: StyledDecl): boolean {
    return this.isUsedAsValueInFile(d.localName) || this.hasAliasedJsxSpreadUsage(d.localName);
  }

  private hasAliasedJsxSpreadUsage(localName: string): boolean {
    const cached = this.aliasedJsxSpreadUsageCache.get(localName);
    if (cached !== undefined) {
      return cached;
    }

    const { root, j } = this;
    const aliasNames = new Set<string>([localName]);
    let changed = true;
    while (changed) {
      changed = false;
      root.find(j.VariableDeclarator).forEach((p) => {
        const { id, init } = p.node;
        if (id.type !== "Identifier" || aliasNames.has(id.name) || !init) {
          return;
        }
        if (expressionReferencesComponentAlias(init, aliasNames)) {
          aliasNames.add(id.name);
          changed = true;
        }
      });
    }
    aliasNames.delete(localName);

    const hasSpread =
      aliasNames.size > 0 &&
      [...aliasNames].some(
        (aliasName) =>
          root
            .find(j.JSXElement, {
              openingElement: { name: { type: "JSXIdentifier", name: aliasName } },
            } as any)
            .filter((p) =>
              (
                (p.node.openingElement.attributes ?? []) as Array<JSXAttribute | JSXSpreadAttribute>
              ).some((attr) => attr.type === "JSXSpreadAttribute"),
            )
            .size() > 0,
      );

    this.aliasedJsxSpreadUsageCache.set(localName, hasSpread);
    return hasSpread;
  }

  /**
   * Decide whether a wrapper component should accept/merge external `className`/`style`.
   */
  shouldAllowClassNameProp(d: StyledDecl): boolean {
    if (d.consumerUsesClassName ?? d.supportsExternalStyles) {
      return true;
    }
    if (d.consumerUsesSpread) {
      return this.spreadMayContainProp(d, "className");
    }
    if (this.isBroadValueUsage(d)) {
      return true;
    }
    const used = this.getUsedAttrs(d.localName);
    return used.has("*") || used.has("className");
  }

  shouldAllowStyleProp(d: StyledDecl): boolean {
    if (d.consumerUsesStyle ?? d.supportsExternalStyles) {
      return true;
    }
    if (d.consumerUsesSpread) {
      return this.spreadMayContainProp(d, "style");
    }
    if (d.valueUsageKind === "elementTypeProp") {
      return true;
    }
    if (this.isBroadValueUsage(d)) {
      return true;
    }
    const used = this.getUsedAttrs(d.localName);
    return used.has("*") || used.has("style");
  }

  shouldAllowSxProp(d: StyledDecl): boolean {
    if (d.valueUsageKind === "elementTypeProp") {
      return (d.supportsExternalStyles ?? false) || d.typeScriptSupportsSxProp === true;
    }
    return (
      (d.supportsExternalStyles ?? false) ||
      d.typeScriptSupportsSxProp === true ||
      this.shouldAllowClassNameProp(d) ||
      this.shouldAllowStyleProp(d)
    );
  }

  typedComponentHasProp(componentLocalName: string, propName: string): boolean {
    const metadata = this.typeScriptComponentMetadataFor(componentLocalName);
    if (!metadata) {
      return false;
    }
    if (metadata.kind === "styled" && isExternalStylePropName(propName)) {
      return false;
    }
    if (isExternalStyleOrSxPropName(propName)) {
      return metadata.explicitPropNames.includes(propName);
    }
    return metadata.hasIndexSignature || metadata.props.some((prop) => prop.name === propName);
  }

  hasTypeScriptComponentMetadata(componentLocalName: string): boolean {
    return this.typeScriptComponentMetadataFor(componentLocalName) !== undefined;
  }

  /**
   * Returns true when the wrapped component's prepass metadata proves it does
   * NOT accept the given external style prop (className/style/sx) — i.e. the prop is
   * missing from both explicit and resolved props AND the component has no
   * index signature. Used to decide whether to lift the prop onto the wrapper.
   *
   * `typedComponentHasProp` intentionally checks only `explicitPropNames` for
   * style props (we don't want every HTML-derived component treated as
   * "having" className), but for the lift decision we need the broader view:
   * even if className isn't explicitly declared, ExternalComponent that
   * extends `React.HTMLAttributes` still accepts it via inheritance, so no
   * lift is needed.
   *
   * Returns false when metadata is unavailable (conservative — defer to
   * existing emission logic rather than incorrectly lifting).
   */
  wrappedRejectsStyleProp(
    componentLocalName: string,
    propName: "className" | "style" | "sx",
  ): boolean {
    const metadata = this.typeScriptComponentMetadataFor(componentLocalName);
    if (!metadata) {
      return false;
    }
    if (metadata.hasIndexSignature) {
      return false;
    }
    if (metadata.explicitPropNames.includes(propName)) {
      return false;
    }
    if (metadata.props.some((prop) => prop.name === propName)) {
      return false;
    }
    return true;
  }

  typedComponentProp(componentLocalName: string, propName: string): TypeScriptPropMetadata | null {
    const metadata = this.typeScriptComponentMetadataFor(componentLocalName);
    if (
      !metadata ||
      (metadata.kind === "styled" && isExternalStylePropName(propName)) ||
      (isExternalStyleOrSxPropName(propName) && !metadata.explicitPropNames.includes(propName))
    ) {
      return null;
    }
    return metadata.props.find((prop) => prop.name === propName) ?? null;
  }

  private spreadMayContainProp(d: StyledDecl, propName: string): boolean {
    if (!d.typeScriptPropNames) {
      return true;
    }
    return d.typeScriptHasIndexSignature === true || d.typeScriptPropNames.has(propName);
  }

  private hasSourceOverrideFor(componentLocalName: string): boolean {
    const importInfo = this.importMap.get(componentLocalName);
    return (
      importInfo?.source.kind === "absolutePath" &&
      this.sourceOverrides?.has(resolveExistingFilePath(importInfo.source.value)) === true
    );
  }

  private typeScriptComponentMetadataFor(
    componentLocalName: string,
  ): TypeScriptComponentMetadata | undefined {
    const importInfo = this.importMap.get(componentLocalName);
    if (importInfo?.source.kind === "absolutePath") {
      const names =
        importInfo.importedName === "default"
          ? [componentLocalName, importInfo.importedName]
          : [importInfo.importedName];
      const byPath = findTypeScriptComponentMetadata(
        this.typeScriptMetadata,
        importInfo.source.value,
        names,
      );
      if (byPath) {
        return byPath;
      }
      return this.findTypeScriptComponentMetadataByName(names);
    }
    const local = findTypeScriptComponentMetadata(this.typeScriptMetadata, this.filePath, [
      componentLocalName,
    ]);
    if (local) {
      return local;
    }
    return undefined;
  }

  private findTypeScriptComponentMetadataByName(
    names: readonly string[],
  ): TypeScriptComponentMetadata | undefined {
    if (!this.typeScriptMetadata) {
      return undefined;
    }
    const nameSet = new Set(names);
    for (const file of this.typeScriptMetadata.files) {
      const match = file.components.find((component) => nameSet.has(component.name));
      if (match) {
        return match;
      }
    }
    return undefined;
  }

  shouldAllowAsPropForIntrinsic(d: StyledDecl, tagName: string): boolean {
    // Allow `as` prop when explicitly requested via adapter, even for void tags
    if (d.supportsAsProp) {
      return true;
    }
    // Auto-enable `as` for components extended by other styled components in the same file
    // (supportsExternalStyles is set but supportsAsProp was not explicitly set by the adapter).
    // Does NOT apply when wrapping another component (to avoid TS2590 union complexity).
    if (d.supportsExternalStyles && d.base.kind !== "component" && d.supportsAsProp === undefined) {
      return true;
    }
    // For void tags without explicit opt-in, don't allow `as` prop
    if (VOID_TAGS.has(tagName)) {
      return false;
    }
    const used = this.getUsedAttrs(d.localName);
    return used.has("as") || this.hasForwardedAsUsage(d.localName);
  }

  stringifyTsType(t: AstNodeOrNull): string | null {
    return stringifyTsType(t);
  }

  keyofExprForType(propsType: ASTNode | undefined, stringified: string | null): string | null {
    return keyofExprForType(propsType, stringified);
  }

  typeExistsInFile(typeName: string): boolean {
    const { root, j } = this;
    const typeAliases = root.find(j.TSTypeAliasDeclaration, {
      id: { type: "Identifier", name: typeName },
    } as any);
    if (typeAliases.size() > 0) {
      return true;
    }
    const interfaces = root.find(j.TSInterfaceDeclaration, {
      id: { type: "Identifier", name: typeName },
    } as any);
    return interfaces.size() > 0;
  }

  /**
   * Check if propsType is a simple type reference (e.g., `Props`) that exists in the file.
   * Returns the type name if it exists, null otherwise.
   *
   * This is used to determine if we should extend an existing user-defined type
   * rather than creating a new wrapper props type.
   */
  getExplicitTypeNameIfExists(propsType: ASTNode | undefined): string | null {
    if (!propsType) {
      return null;
    }
    const typedPropsType = propsType as ASTNode & {
      type?: string;
      typeName?: { type?: string; name?: string };
    };
    const isSimpleTypeRef =
      typedPropsType.type === "TSTypeReference" && typedPropsType.typeName?.type === "Identifier";
    if (!isSimpleTypeRef) {
      return null;
    }
    const typeName = typedPropsType.typeName?.name;
    if (!typeName) {
      return null;
    }
    return this.typeExistsInFile(typeName) ? typeName : null;
  }

  extendExistingInterface(typeName: string, baseTypeText: string): boolean {
    const { root, j } = this;
    if (!this.emitTypes) {
      return false;
    }
    const interfaces = root.find(j.TSInterfaceDeclaration, {
      id: { type: "Identifier", name: typeName },
    } as any);
    if (interfaces.size() === 0) {
      return false;
    }
    // Parse the base type into a TSExpressionWithTypeArguments node.
    // Intersection types (A & B) are not valid in `extends` clauses, so
    // gracefully fall back to type alias extension on parse failure.
    let extendsClause: unknown;
    try {
      const parsed = j(`interface X extends ${baseTypeText} {}`).get().node.program.body[0] as any;
      extendsClause = parsed?.extends?.[0];
    } catch {
      return false;
    }
    if (!extendsClause) {
      return false;
    }
    interfaces.forEach((path: any) => {
      const iface = path.node;
      // Don't add if already extends this type
      const existingExtends = iface.extends ?? [];
      const alreadyExtends = existingExtends.some((ext: any) => {
        const extStr = j(ext).toSource();
        return extStr === baseTypeText;
      });
      if (alreadyExtends) {
        return;
      }
      // Add the extends clause
      iface.extends = [...existingExtends, extendsClause];
    });
    return true;
  }

  injectMembersIntoInterface(typeName: string, memberTexts: string[]): boolean {
    const { root, j } = this;
    if (!this.emitTypes || memberTexts.length === 0) {
      return false;
    }
    const interfaces = root.find(j.TSInterfaceDeclaration, {
      id: { type: "Identifier", name: typeName },
    } as any);
    if (interfaces.size() === 0) {
      return false;
    }
    const membersSource = `interface _Tmp { ${memberTexts.join("; ")} }`;
    let newMembers: unknown[];
    try {
      const parsed = j(membersSource).get().node.program.body[0] as any;
      newMembers = parsed?.body?.body ?? [];
    } catch {
      return false;
    }
    if (newMembers.length === 0) {
      return false;
    }
    interfaces.forEach((path: any) => {
      const iface = path.node;
      const existingMembers = iface.body?.body ?? [];
      const existingNames = new Set(
        existingMembers
          .filter((m: any) => m?.type === "TSPropertySignature" && m.key?.type === "Identifier")
          .map((m: any) => m.key.name),
      );
      const filtered = newMembers.filter((m: any) => {
        if (m?.type !== "TSPropertySignature" || m.key?.type !== "Identifier") {
          return true;
        }
        return !existingNames.has(m.key.name);
      });
      if (filtered.length > 0) {
        iface.body.body = [...existingMembers, ...filtered];
      }
    });
    return true;
  }

  injectSxPropIntoExistingType(typeName: string): void {
    const injected = this.injectMembersIntoInterface(typeName, [SX_PROP_TYPE_TEXT]);
    if (!injected) {
      this.extendExistingTypeAlias(typeName, `{ ${SX_PROP_TYPE_TEXT} }`);
    }
  }

  extendExistingTypeAlias(typeName: string, baseTypeText: string): boolean {
    const { root, j } = this;
    if (!this.emitTypes) {
      return false;
    }
    const typeAliases = root.find(j.TSTypeAliasDeclaration, {
      id: { type: "Identifier", name: typeName },
    } as any);
    if (typeAliases.size() === 0) {
      return false;
    }
    // Parse the base type into a TSType node
    const parsed = j(`type X = ${baseTypeText};`).get().node.program.body[0] as any;
    const baseTypeNode = parsed?.typeAnnotation;
    if (!baseTypeNode) {
      return false;
    }
    typeAliases.forEach((path: any) => {
      const alias = path.node;
      const existingType = alias.typeAnnotation;
      if (!existingType) {
        return;
      }
      // Check if already includes this base type to avoid duplicates
      if (existingType.type === "TSIntersectionType") {
        const types = existingType.types ?? [];
        const alreadyIncludes = types.some((t: any) => {
          const tStr = j(t).toSource();
          return tStr === baseTypeText;
        });
        if (alreadyIncludes) {
          return;
        }
        // Append to existing intersection (user's type first for readability)
        existingType.types = [...types, baseTypeNode];
      } else {
        // Convert to intersection type: ExistingType & BaseType
        alias.typeAnnotation = j.tsIntersectionType([existingType, baseTypeNode]);
      }
    });
    return true;
  }

  /**
   * Extend an existing type (interface or type alias) with additional type text.
   * Tries interface first, then falls back to type alias.
   * Returns true if the type was extended successfully.
   */
  extendExistingType(typeName: string, baseTypeText: string): boolean {
    if (this.extendExistingInterface(typeName, baseTypeText)) {
      return true;
    }
    return this.extendExistingTypeAlias(typeName, baseTypeText);
  }

  emitNamedPropsType(args: {
    localName: string;
    typeExprText: string;
    emitted: ASTNode[];
    genericParams?: string;
  }): boolean {
    const { localName, typeExprText, emitted, genericParams } = args;
    if (!this.emitTypes) {
      return false;
    }
    const typeName = this.propsTypeNameFor(localName);
    if (this.typeExistsInFile(typeName)) {
      return false;
    }
    const typeNamePattern = new RegExp(`\\b${typeName}\\b`);
    if (typeExprText.trim() === typeName || typeNamePattern.test(typeExprText)) {
      return false;
    }
    const typeNameWithParams = genericParams ? `${typeName}<${genericParams}>` : typeName;
    let stmt: ASTNode;
    try {
      stmt = this.j(`${`type ${typeNameWithParams} = ${typeExprText};`}`).get().node.program
        .body[0];
    } catch (e) {
      throw new Error(
        [
          `Failed to parse emitted props type for ${localName} (${this.filePath}).`,
          `Type name: ${typeNameWithParams}`,
          `Type expr: ${typeExprText}`,
          `Error: ${e instanceof Error ? e.message : String(e)}`,
        ].join("\n"),
      );
    }
    emitted.push(stmt);
    return true;
  }

  annotatePropsParam(propsParam: ASTNode, localName: string, inlineTypeText?: string): void {
    const { j } = this;
    if (!this.emitTypes) {
      return;
    }
    if (inlineTypeText) {
      let typeNode: TsTypeAnnotationInput | null = null;
      try {
        typeNode = j(`const x: ${inlineTypeText} = null`).get().node.program.body[0].declarations[0]
          .id.typeAnnotation.typeAnnotation;
      } catch (e) {
        throw new Error(
          [
            `Failed to parse inline props param type for ${localName} (${this.filePath}).`,
            `Inline type: ${inlineTypeText}`,
            `Error: ${e instanceof Error ? e.message : String(e)}`,
          ].join("\n"),
        );
      }
      if (!typeNode) {
        throw new Error(
          `Failed to parse inline props param type for ${localName} (${this.filePath}).`,
        );
      }
      (propsParam as any).typeAnnotation = j.tsTypeAnnotation(typeNode);
    } else {
      (propsParam as any).typeAnnotation = j.tsTypeAnnotation(
        j.tsTypeReference(j.identifier(this.propsTypeNameFor(localName))),
      );
    }
  }

  withChildren(innerTypeText: string): string {
    return withChildren(innerTypeText);
  }

  joinIntersection(...parts: Array<string | null | undefined>): string {
    return joinIntersection(...parts);
  }

  getExplicitPropNames(
    propsType: AstNodeOrNull,
    options?: { lookThroughPropsWithChildren?: boolean },
  ): Set<string> {
    return getExplicitPropNames(this.root, this.j, propsType, options);
  }

  inferredIntrinsicPropsTypeText(args: {
    d: StyledDecl;
    tagName: string;
    allowClassNameProp: boolean;
    allowStyleProp: boolean;
    allowSxProp?: boolean;
    skipProps?: Set<string>;
    /** Include ref in the narrow type. Only set to true when the component forwards ref (e.g., via {...rest}). */
    includeRef?: boolean;
    /**
     * When true, return a slim object literal for ALL tags (including void tags
     * like input/img) listing only the props that are actually used at callsites.
     * When false (default), void tags fall back to the broad element-attributes
     * type (e.g. `React.InputHTMLAttributes<…>`).
     */
    forceNarrow?: boolean;
  }): string {
    const {
      d,
      tagName,
      allowClassNameProp,
      allowStyleProp,
      allowSxProp,
      skipProps,
      includeRef,
      forceNarrow,
    } = args;

    const used = this.getUsedAttrs(d.localName);
    const needsBroadAttrs = used.has("*") || this.isBroadValueUsage(d);

    const lines: string[] = [];
    // Standard props go into Pick<ComponentProps<"tag">, ...> for proper types.
    // Custom props (sx, $-prefixed, data-*, forwardedAs) stay in the literal.
    const pickedAttrKeys: string[] = [];
    if (!needsBroadAttrs) {
      if (allowClassNameProp) {
        pickedAttrKeys.push("className");
      }
      if (allowStyleProp) {
        pickedAttrKeys.push("style");
      }
      if (allowSxProp) {
        lines.push(SX_PROP_TYPE_TEXT);
      }
      if (includeRef) {
        pickedAttrKeys.push("ref");
      }
      if (!VOID_TAGS.has(tagName)) {
        pickedAttrKeys.push("children");
      }
    } else if (allowSxProp) {
      lines.push(SX_PROP_TYPE_TEXT);
    }

    for (const attr of [...used].sort((a, b) => a.localeCompare(b))) {
      if (attr === "*" || attr === "children" || attr === "ref") {
        continue;
      }
      if (attr === "as") {
        continue;
      }
      if (attr === "forwardedAs") {
        lines.push("forwardedAs?: React.ElementType");
        continue;
      }
      if (attr === "className" || attr === "style") {
        continue;
      }
      if (skipProps?.has(attr)) {
        continue;
      }
      if (!attr.startsWith("$") && !attr.includes("-")) {
        if (!needsBroadAttrs) {
          pickedAttrKeys.push(attr);
        }
        // When needsBroadAttrs, ComponentProps base already covers this attr
        continue;
      }
      const attrType = attr.startsWith("data-") ? "boolean | string" : "any";
      lines.push(`${toTypeKey(attr)}?: ${attrType}`);
    }

    // When all picked keys can be inlined (universal types like className/style,
    // plus children and ref when forceNarrow), avoid Pick<ComponentProps> entirely.
    // Pick is only valuable for element-specific attrs (disabled, src, d, href).
    const canInline = (k: string): boolean =>
      k in UNIVERSAL_PROP_TYPES || k === "children" || (forceNarrow === true && k === "ref");
    const hasElementSpecificPicks = pickedAttrKeys.some((k) => !canInline(k));
    if (!hasElementSpecificPicks) {
      for (const k of pickedAttrKeys) {
        if (k in UNIVERSAL_PROP_TYPES) {
          lines.push(UNIVERSAL_PROP_TYPES[k]!);
        } else if (k === "ref") {
          const elementType = TAG_TO_HTML_ELEMENT[tagName] ?? "HTMLElement";
          lines.push(`ref?: React.Ref<${elementType}>`);
        }
      }
      // Keep children in Pick only when !forceNarrow (caller won't wrap)
      const keepChildren = !forceNarrow && pickedAttrKeys.includes("children");
      pickedAttrKeys.length = 0;
      if (keepChildren) {
        pickedAttrKeys.push("children");
      }
    }

    const literal =
      lines.length > 1
        ? `{\n  ${lines.join(",\n  ")}\n}`
        : lines.length === 1
          ? `{ ${lines[0]} }`
          : "{}";

    const intrinsicBase = `React.ComponentProps<"${tagName}">`;
    const intrinsicBaseOmitted: string[] = [];
    if (!allowClassNameProp) {
      intrinsicBaseOmitted.push('"className"');
    }
    if (!allowStyleProp) {
      intrinsicBaseOmitted.push('"style"');
    }
    if (!allowSxProp) {
      intrinsicBaseOmitted.push('"sx"');
    }
    const intrinsicBaseMaybeOmitted = intrinsicBaseOmitted.length
      ? `Omit<${intrinsicBase}, ${intrinsicBaseOmitted.join(" | ")}>`
      : intrinsicBase;
    const pickExpr =
      pickedAttrKeys.length > 0
        ? `Pick<${intrinsicBase}, ${pickedAttrKeys.map((k) => `"${k}"`).join(" | ")}>`
        : undefined;

    if (!needsBroadAttrs) {
      const narrowResult = this.joinIntersection(literal, pickExpr);
      // When forceNarrow is set, return without children — the caller wraps
      // with PropsWithChildren after merging all type parts.
      // However, when the Pick would list many element-specific attrs
      // (onClick, onKeyDown, etc.), use the broad ComponentProps instead
      // to avoid verbose, brittle types.
      if (forceNarrow) {
        if (hasElementSpecificPicks) {
          return intrinsicBaseMaybeOmitted;
        }
        return narrowResult;
      }
      if (VOID_TAGS.has(tagName)) {
        return this.joinIntersection(literal, intrinsicBaseMaybeOmitted);
      }
      return narrowResult;
    }

    const composed = this.joinIntersection(literal, intrinsicBaseMaybeOmitted);
    return VOID_TAGS.has(tagName) ? composed : this.withChildren(composed);
  }

  /**
   * Resolves a component's explicit TSTypeReference props type.
   * Returns `{ name, full }` where `name` is the bare identifier (e.g., "FlexProps")
   * and `full` is the stringified type including type arguments (e.g., "Props<\"button\">").
   */
  resolveWrappedExplicitPropsTypeRef(componentName: string): { name: string; full: string } | null {
    const decl = this.wrapperDecls.find((d2) => d2.localName === componentName);
    if (!decl?.propsType) {
      return null;
    }
    const pt = decl.propsType as ASTNode & {
      type?: string;
      typeName?: { type?: string; name?: string };
    };
    if (pt.type === "TSTypeReference" && pt.typeName?.type === "Identifier" && pt.typeName.name) {
      const full = this.stringifyTsType(pt);
      if (full) {
        return { name: pt.typeName.name, full };
      }
    }
    return null;
  }

  /** Resolves the default intrinsic tag by tracing through the component chain. */
  resolveWrappedDefaultTag(componentName: string): string | null {
    const visited = new Set<string>();
    let current = componentName;
    for (;;) {
      if (visited.has(current)) {
        return null;
      }
      visited.add(current);
      const decl = this.wrapperDecls.find((d2) => d2.localName === current);
      if (!decl) {
        return null;
      }
      if (decl.base.kind === "intrinsic") {
        return decl.base.tagName;
      }
      if (decl.base.kind === "component") {
        current = decl.base.ident;
      } else {
        return null;
      }
    }
  }

  /**
   * Builds a base props type for a wrapped component.
   * When the wrapped component is a generic function (e.g., Flex<C>), uses its explicit
   * props type directly because `React.ComponentPropsWithRef<typeof GenericComponent>`
   * resolves to `any`. Falls back to the standard `typeof` form otherwise.
   *
   * @param componentName - The name of the wrapped component
   * @param excludeTypeName - Optional type name to exclude to avoid self-referential types.
   *   When the caller's explicit props type equals the wrapped component's props type,
   *   pass the caller's type name here to fall back to the `typeof` form.
   */
  componentPropsBaseType(componentName: string, excludeTypeName?: string): string {
    if (!this.wrappedComponentWillBeGeneric(componentName)) {
      return `React.ComponentPropsWithRef<typeof ${componentName}>`;
    }
    const typeRef = this.resolveWrappedExplicitPropsTypeRef(componentName);
    // P1 fix: Avoid self-referential types by falling back to `typeof` when the
    // wrapped component's props type name matches the caller's explicit props type.
    if (typeRef && excludeTypeName && typeRef.name === excludeTypeName) {
      return `React.ComponentPropsWithRef<typeof ${componentName}>`;
    }
    // P2 fix: Use the full type with arguments (e.g., Props<"button">)
    const defaultTag = typeRef ? this.resolveWrappedDefaultTag(componentName) : null;
    if (typeRef && defaultTag) {
      return `${typeRef.full} & Omit<React.ComponentPropsWithRef<"${defaultTag}">, keyof ${typeRef.full}>`;
    }
    return `React.ComponentPropsWithRef<typeof ${componentName}>`;
  }

  /**
   * Checks if a component in wrapperDecls will be emitted as a generic function.
   * A component is generic when it has `as` prop support AND its existing props type
   * doesn't already declare `as` (components with existing `as` stay non-generic).
   */
  wrappedComponentWillBeGeneric(componentName: string): boolean {
    const decl = this.wrapperDecls.find((d) => d.localName === componentName);
    if (!decl) {
      return false;
    }
    const hasAsSupport = this.wrapperNames.has(componentName) || !!decl.supportsAsProp;
    if (!hasAsSupport) {
      return false;
    }
    // Components with existing `as` in their props type stay non-generic
    // (the intrinsic emitter uses the simple path for these)
    if (
      decl.propsType &&
      typeContainsPolymorphicAs({ root: this.root, j: this.j, typeNode: decl.propsType })
    ) {
      return false;
    }
    return true;
  }

  inferredComponentWrapperPropsTypeText(args: {
    d: StyledDecl;
    allowClassNameProp: boolean;
    allowStyleProp: boolean;
    allowSxProp?: boolean;
    wrappedComponentIsInternalWrapper?: boolean;
    wrappedComponentIsStyledWrapper?: boolean;
    hasExplicitPropsType?: boolean;
    forceClassNameOptional?: boolean;
    forceStyleOptional?: boolean;
    wrappedComponent?: string;
    forwardedAsPropTypeText?: string;
    attrsProvidedPropOptions?: AttrsProvidedPropOptions;
  }): string {
    const {
      d,
      allowClassNameProp,
      allowStyleProp,
      allowSxProp,
      wrappedComponentIsInternalWrapper,
      wrappedComponentIsStyledWrapper,
      hasExplicitPropsType,
      forceClassNameOptional,
      forceStyleOptional,
      wrappedComponent,
      forwardedAsPropTypeText = "React.ElementType",
      attrsProvidedPropOptions,
    } = args;
    const lines: string[] = [];
    // When external styles are EXPLICITLY enabled via adapter (d.supportsExternalStyles) and
    // the wrapped component is NOT one of our generated wrappers, add className/style to the type.
    // External components may not include these props in their type definition, so we need to
    // explicitly add them to avoid TypeScript errors when destructuring.
    // Note: We only add these when supportsExternalStyles is true, not when allowClassNameProp
    // is true for other reasons (like spread props usage), because in those cases the wrapped
    // component likely already has className/style in its props.
    // Skip adding here if there's an explicit props type - it will be merged there instead.
    const shouldAddStyleProps =
      d.supportsExternalStyles && !wrappedComponentIsInternalWrapper && !hasExplicitPropsType;
    // Lift className/style onto the wrapper's prop type when the wrapper will
    // destructure them from `props` (allowClassNameProp/allowStyleProp) but the
    // wrapped component's prepass metadata proves it does NOT accept them.
    // Without this, the inherited `React.ComponentPropsWithRef<typeof Wrapped>`
    // lacks those keys and the destructure produces TS2339. Only applies when
    // no explicit propsType (with one, the lift happens via
    // injectStylePropsIntoTypeLiteralString in emit-component.ts).
    //
    // Uses `wrappedRejectsStyleProp` (broad check: explicitPropNames + props
    // array + hasIndexSignature) rather than `typedComponentHasProp` (narrow:
    // explicitPropNames only). The narrow check would incorrectly lift onto
    // any component extending React.HTMLAttributes — which DOES accept
    // className via inheritance even though it isn't explicitly declared.
    const liftableContext =
      !hasExplicitPropsType && !wrappedComponentIsInternalWrapper && Boolean(wrappedComponent);
    const liftClassNameForUnsupportedWrapped =
      liftableContext &&
      allowClassNameProp &&
      this.wrappedRejectsStyleProp(wrappedComponent!, "className");
    const liftStyleForUnsupportedWrapped =
      liftableContext && allowStyleProp && this.wrappedRejectsStyleProp(wrappedComponent!, "style");
    const shouldAddOwnSxProp =
      !hasExplicitPropsType && !wrappedComponentIsStyledWrapper && allowSxProp;
    // When forceClassNameOptional/forceStyleOptional is set, the wrapped component has
    // className/style that may be required. We need to explicitly add them as optional
    // so the wrapper doesn't inherit requiredness from the wrapped component.
    if (
      (shouldAddStyleProps && allowClassNameProp) ||
      forceClassNameOptional ||
      liftClassNameForUnsupportedWrapped
    ) {
      lines.push("className?: string");
    }
    if (
      (shouldAddStyleProps && allowStyleProp) ||
      forceStyleOptional ||
      liftStyleForUnsupportedWrapped
    ) {
      lines.push("style?: React.CSSProperties");
    }
    if (shouldAddOwnSxProp) {
      lines.push(SX_PROP_TYPE_TEXT);
    }
    if (this.hasForwardedAsUsage(d.localName)) {
      lines.push(`forwardedAs?: ${forwardedAsPropTypeText}`);
    }
    const propsTarget = d.attrsInfo?.attrsAsTag ?? (d.base as any).ident;
    const base = this.componentPropsBaseType(propsTarget);
    const omitted: string[] = [];
    const renamedPropTypes: string[] = [];
    // When forcing optional, always omit from base to prevent inheriting requiredness
    if (!allowClassNameProp || forceClassNameOptional) {
      omitted.push('"className"');
    }
    if (!allowStyleProp || forceStyleOptional) {
      omitted.push('"style"');
    }
    appendAttrsProvidedPropOmissions(omitted, d.attrsInfo, attrsProvidedPropOptions);
    // When transient props are renamed ($prop → prop), omit the original $-prefixed
    // props from the base type and re-add them with their new names.
    // This is needed when the base component's type includes the $-prefixed prop
    // (via transientOmitFromBase) or the component is exported (for v6 forwarding safety).
    if (
      d.transientPropRenames &&
      d.transientPropRenames.size > 0 &&
      !d.transientPropRenamesInherited
    ) {
      const propsToOmit =
        (d.isExported ?? false)
          ? new Set(d.transientPropRenames.keys())
          : (d.transientOmitFromBase ?? new Set<string>());
      for (const original of propsToOmit) {
        omitted.push(`"${original}"`);
      }
      // Only add renamed prop types from the base component when there is no explicit
      // wrapper type. When there is an explicit type, the renamed props are already there.
      if (!hasExplicitPropsType && propsToOmit.size > 0) {
        // Emit renamed props as mapped types that preserve optionality:
        // { [K in "$isOpen" as "isOpen"]: Base[K] } keeps `?` if Base has `$isOpen?`.
        // These are emitted as separate intersection members since mapped types
        // can't coexist with regular members in the same type literal.
        for (const [original, renamed] of d.transientPropRenames) {
          if (propsToOmit.has(original)) {
            renamedPropTypes.push(`{ [K in "${original}" as "${renamed}"]: ${base}[K] }`);
          }
        }
      }
    }
    const literal = lines.length > 0 ? `{ ${lines.join(", ")} }` : "{}";
    const omittedUnique = [...new Set(omitted)];
    const baseMaybeOmitted = omittedUnique.length
      ? `Omit<${base}, ${omittedUnique.join(" | ")}>`
      : base;
    return this.joinIntersection(
      literal !== "{}" ? literal : null,
      baseMaybeOmitted,
      ...renamedPropTypes,
    );
  }

  isPropRequiredInPropsTypeLiteral(propsType: any, propName: string): boolean {
    const { root, j } = this;
    const checkInLiteral = (literal: any): boolean | null => {
      if (!literal || literal.type !== "TSTypeLiteral") {
        return null;
      }
      for (const m of literal.members ?? []) {
        if (!m || m.type !== "TSPropertySignature") {
          continue;
        }
        const k: any = m.key;
        const name =
          k?.type === "Identifier"
            ? k.name
            : k?.type === "StringLiteral"
              ? k.value
              : k?.type === "Literal" && typeof k.value === "string"
                ? k.value
                : null;
        if (name !== propName) {
          continue;
        }
        return m.optional !== true;
      }
      return null;
    };

    const checkInInterfaceBody = (body: any[]): boolean | null => {
      for (const member of body) {
        if (member?.type !== "TSPropertySignature") {
          continue;
        }
        const k: any = member.key;
        const name = k?.type === "Identifier" ? k.name : null;
        if (name !== propName) {
          continue;
        }
        return member.optional !== true;
      }
      return null;
    };

    if (propsType?.type === "TSTypeLiteral") {
      const result = checkInLiteral(propsType);
      return result === true;
    }

    if (propsType?.type === "TSTypeReference" && propsType.typeName?.type === "Identifier") {
      const typeName = propsType.typeName.name;
      const interfaceDecl = root
        .find(j.TSInterfaceDeclaration)
        .filter((p) => (p.node as any).id?.name === typeName);
      if (interfaceDecl.size() > 0) {
        const body = interfaceDecl.get().node.body?.body ?? [];
        const result = checkInInterfaceBody(body);
        if (result !== null) {
          return result;
        }
      }

      const typeAlias = root
        .find(j.TSTypeAliasDeclaration)
        .filter((p) => (p.node as any).id?.name === typeName);
      if (typeAlias.size() > 0) {
        const typeAnnotation = typeAlias.get().node.typeAnnotation;
        const result = checkInLiteral(typeAnnotation);
        if (result !== null) {
          return result;
        }
      }
    }

    return false;
  }

  emitMinimalWrapper(args: {
    localName: string;
    tagName: string;
    propsTypeName?: string;
    inlineTypeText?: string;
    styleArgs: ExpressionKind[];
    destructureProps: string[];
    propDefaults?: WrapperPropDefaults;
    allowClassNameProp?: boolean;
    allowStyleProp?: boolean;
    allowAsProp?: boolean;
    includeRefProp?: boolean;
    includeRest?: boolean;
    defaultAttrs?: Array<{ jsxProp: string; attrName: string; value: unknown }>;
    dynamicAttrs?: Array<{ jsxProp: string; attrName: string; defaultValue?: unknown }>;
    conditionalAttrs?: Array<{ jsxProp: string; attrName: string; value: unknown }>;
    invertedBoolAttrs?: Array<{ jsxProp: string; attrName: string }>;
    staticAttrs?: Record<string, unknown>;
    attrsStaticStyleExpr?: ExpressionKind;
    inlineStyleProps?: InlineStyleProp[];
    /** Component reference from `.attrs({ as: Component })` — overrides the rendered tag. */
    attrsAsTag?: string;
    /** Bridge class variable name to reference in the className expression. */
    bridgeClassVar?: string;
  }): ASTNode[] {
    const {
      localName,
      tagName,
      propsTypeName,
      inlineTypeText,
      styleArgs,
      destructureProps,
      propDefaults,
      allowClassNameProp = false,
      allowStyleProp = false,
      allowAsProp = false,
      includeRefProp = false,
      includeRest = true,
      defaultAttrs = [],
      dynamicAttrs = [],
      conditionalAttrs = [],
      invertedBoolAttrs = [],
      staticAttrs = {},
      attrsStaticStyleExpr,
      inlineStyleProps = [],
      attrsAsTag,
      bridgeClassVar,
    } = args;

    const { j } = this;
    const expandedDestructureProps = new Set(destructureProps.filter(Boolean));
    const collectCondIdentifiers = (node: ASTNode | null | undefined): void => {
      if (!node) {
        return;
      }
      if (isIdentifierNode(node)) {
        if (node.name !== "undefined") {
          expandedDestructureProps.add(node.name);
        }
        return;
      }
      if (
        node.type === "MemberExpression" &&
        !(node as any).computed &&
        (node as any).object.type === "Identifier" &&
        (node as any).object.name === "props" &&
        (node as any).property.type === "Identifier"
      ) {
        expandedDestructureProps.add((node as any).property.name);
        return;
      }
      if ("left" in (node as any) && (node as any).left) {
        collectCondIdentifiers((node as any).left as ASTNode);
      }
      if ("right" in (node as any) && (node as any).right) {
        collectCondIdentifiers((node as any).right as ASTNode);
      }
      if ("argument" in (node as any) && (node as any).argument) {
        collectCondIdentifiers((node as any).argument as ASTNode);
      }
      if ("test" in (node as any) && (node as any).test) {
        collectCondIdentifiers((node as any).test as ASTNode);
      }
      if ("consequent" in (node as any) && (node as any).consequent) {
        collectCondIdentifiers((node as any).consequent as ASTNode);
      }
      if ("alternate" in (node as any) && (node as any).alternate) {
        collectCondIdentifiers((node as any).alternate as ASTNode);
      }
    };
    for (const arg of styleArgs) {
      if (arg?.type === "LogicalExpression" && (arg as any).operator === "&&") {
        collectCondIdentifiers((arg as any).left as ASTNode);
      }
    }

    const isVoidTag = VOID_TAGS.has(tagName);
    const allowForwardedAsProp = this.getUsedAttrs(localName).has("forwardedAs");
    const needsPolymorphicTypeParams =
      this.emitTypes && (allowAsProp || inlineTypeNeedsElementGeneric(inlineTypeText));
    const propsId = j.identifier("props");

    let restId: Identifier | null = includeRest ? j.identifier("rest") : null;
    const passChildrenThroughRest = jb.shouldPassChildrenThroughRest({
      includeChildren: !isVoidTag,
      includeRest,
      restId,
      destructureProps,
      defaultAttrs,
      dynamicAttrs,
      staticAttrs,
    });

    const patternProps: Array<Property | RestElement> = [];
    if (allowAsProp) {
      patternProps.push(
        j.property.from({
          kind: "init",
          key: j.identifier("as"),
          value: j.assignmentPattern(j.identifier("Component"), j.literal(tagName)),
          shorthand: false,
        }) as Property,
      );
    }
    if (allowForwardedAsProp) {
      patternProps.push(this.patternProp("forwardedAs"));
    }
    if (!isVoidTag && !passChildrenThroughRest) {
      patternProps.push(this.patternProp("children"));
    }
    const shouldForwardRefExplicitly = includeRefProp && !includeRest;
    if (shouldForwardRefExplicitly) {
      patternProps.push(this.patternProp("ref"));
    }
    if (allowClassNameProp) {
      patternProps.push(this.patternProp("className"));
    }
    if (allowStyleProp) {
      patternProps.push(this.patternProp("style"));
    }
    for (const name of expandedDestructureProps) {
      if (
        name !== "children" &&
        name !== "style" &&
        name !== "className" &&
        name !== "forwardedAs" &&
        name !== "ref"
      ) {
        const defaultVal = propDefaults?.get(name);
        if (defaultVal !== undefined) {
          patternProps.push(jb.buildShorthandDefaultPatternProp(j, name, defaultVal));
        } else {
          patternProps.push(this.patternProp(name));
        }
      }
    }

    // Add defaultAttrs props to destructuring WITHOUT default values.
    // We use nullish coalescing (??) in the JSX attribute instead of destructuring
    // defaults because destructuring only defaults on undefined, while ?? also handles null.
    for (const a of defaultAttrs) {
      if (!expandedDestructureProps.has(a.jsxProp)) {
        patternProps.push(this.patternProp(a.jsxProp));
      }
    }
    for (const attr of dynamicAttrs) {
      if (!expandedDestructureProps.has(attr.jsxProp)) {
        patternProps.push(this.patternProp(attr.jsxProp));
      }
    }

    if (includeRest && restId) {
      patternProps.push(j.restElement(restId));
    }
    const usePropsDirectlyForRest =
      includeRest && patternProps.length === 1 && patternProps[0]?.type === "RestElement";
    const useChildrenParamDestructure = this.isChildrenOnlyDestructurePattern(patternProps);
    if (usePropsDirectlyForRest) {
      restId = propsId;
    }

    const propsParam = useChildrenParamDestructure
      ? this.buildChildrenOnlyParam(
          inlineTypeText ??
            (propsTypeName
              ? `${propsTypeName}${needsPolymorphicTypeParams ? "<C>" : ""}`
              : undefined),
        )
      : j.identifier("props");
    if (!useChildrenParamDestructure) {
      this.annotateMinimalWrapperParam(propsParam, {
        localName,
        tagName,
        inlineTypeText,
        propsTypeName,
        needsPolymorphicTypeParams,
      });
    }

    const classNameId = j.identifier("className");
    const styleId = j.identifier("style");
    const staticClassName = staticAttrs.className;
    const hasStaticAsFallback = allowForwardedAsProp && Object.hasOwn(staticAttrs, "as");
    const staticAsFallback = hasStaticAsFallback ? staticAttrs.as : undefined;
    const filteredStaticAttrs = (() => {
      if (allowForwardedAsProp) {
        const { className: _omitClassName, as: _omitAs, ...rest } = staticAttrs;
        return rest;
      }
      const { className: _omitClassName, ...rest } = staticAttrs;
      return rest;
    })();
    const staticClassNameExpr = seb.buildStaticClassNameExpr(j, staticClassName, bridgeClassVar);
    const merging = emitStyleMerging({
      j,
      emitter: this,
      styleArgs,
      classNameId,
      styleId,
      allowClassNameProp,
      allowStyleProp,
      inlineStyleProps,
      staticStyleExpr: attrsStaticStyleExpr,
      staticClassNameExpr,
      isIntrinsicElement: !allowAsProp,
    });

    const jsxAttrs: Array<JSXAttribute | JSXSpreadAttribute> = [];

    // For defaultAttrs, use nullish coalescing (??) to apply the default value.
    // This preserves the original semantics of `props.X ?? defaultValue` which
    // defaults both undefined AND null, unlike destructuring defaults.
    for (const a of defaultAttrs) {
      jsxAttrs.push(
        j.jsxAttribute(
          j.jsxIdentifier(a.attrName),
          j.jsxExpressionContainer(
            j.logicalExpression("??", j.identifier(a.jsxProp), this.literalExpr(a.value)),
          ),
        ),
      );
    }

    for (const cond of conditionalAttrs) {
      const literalValue =
        typeof cond.value === "string" ||
        typeof cond.value === "number" ||
        typeof cond.value === "boolean"
          ? cond.value
          : String(cond.value);
      jsxAttrs.push(
        j.jsxAttribute(
          j.jsxIdentifier(cond.attrName),
          j.jsxExpressionContainer(
            j.conditionalExpression(
              j.identifier(cond.jsxProp),
              typeof literalValue === "boolean"
                ? j.booleanLiteral(literalValue)
                : j.literal(literalValue),
              j.identifier("undefined"),
            ),
          ),
        ),
      );
    }

    for (const inv of invertedBoolAttrs) {
      jsxAttrs.push(
        j.jsxAttribute(
          j.jsxIdentifier(inv.attrName),
          j.jsxExpressionContainer(
            j.binaryExpression("!==", j.identifier(inv.jsxProp), j.booleanLiteral(true)),
          ),
        ),
      );
    }
    if (shouldForwardRefExplicitly) {
      jsxAttrs.push(
        j.jsxAttribute(j.jsxIdentifier("ref"), j.jsxExpressionContainer(j.identifier("ref"))),
      );
    }

    if (includeRest && restId) {
      jsxAttrs.push(j.jsxSpreadAttribute(restId));
    }

    jsxAttrs.push(
      ...jb.buildDynamicAttrsFromProps(j, {
        dynamicAttrs,
        propExprFor: (prop) => j.identifier(prop),
      }),
    );

    jsxAttrs.push(...jb.buildStaticAttrsFromRecord(j, filteredStaticAttrs));
    if (allowForwardedAsProp) {
      const forwardedAsValueExpr = hasStaticAsFallback
        ? j.logicalExpression("??", j.identifier("forwardedAs"), this.literalExpr(staticAsFallback))
        : j.identifier("forwardedAs");
      jsxAttrs.push(
        j.jsxAttribute(j.jsxIdentifier("as"), j.jsxExpressionContainer(forwardedAsValueExpr)),
      );
    }

    if (tagName === "button" && destructureProps.includes("disabled")) {
      jsxAttrs.push(
        j.jsxAttribute(
          j.jsxIdentifier("disabled"),
          j.jsxExpressionContainer(j.identifier("disabled")),
        ),
      );
    }

    if (merging.sxPropExpr) {
      jsxAttrs.push(
        j.jsxAttribute(j.jsxIdentifier("sx"), j.jsxExpressionContainer(merging.sxPropExpr)),
      );
    } else if (merging.jsxSpreadExpr) {
      jsxAttrs.push(j.jsxSpreadAttribute(merging.jsxSpreadExpr));
    }

    if (merging.classNameAttr) {
      jsxAttrs.push(
        j.jsxAttribute(
          j.jsxIdentifier("className"),
          j.jsxExpressionContainer(merging.classNameAttr),
        ),
      );
    }

    if (merging.styleAttr) {
      jsxAttrs.push(
        j.jsxAttribute(j.jsxIdentifier("style"), j.jsxExpressionContainer(merging.styleAttr)),
      );
    }

    const renderedTagName = allowAsProp ? "Component" : (attrsAsTag ?? tagName);
    const renderedJsxName = jsxNameFromString(j, renderedTagName);
    const openingEl = j.jsxOpeningElement(
      renderedJsxName,
      jsxAttrs,
      isVoidTag || passChildrenThroughRest,
    );
    const childrenExpr = j.identifier("children");
    const jsx = j.jsxElement(
      openingEl,
      isVoidTag || passChildrenThroughRest ? null : j.jsxClosingElement(renderedJsxName),
      isVoidTag || passChildrenThroughRest ? [] : [j.jsxExpressionContainer(childrenExpr)],
    );

    const bodyStmts: BlockStatementBody = [];
    if (!usePropsDirectlyForRest && !useChildrenParamDestructure) {
      bodyStmts.push(
        j.variableDeclaration("const", [
          j.variableDeclarator(j.objectPattern(patternProps), propsId),
        ]),
      );
    }
    if (merging.sxDecl) {
      bodyStmts.push(merging.sxDecl);
    }
    bodyStmts.push(j.returnStatement(jsx));

    const filteredBody = bodyStmts.filter(
      (stmt) => stmt && (stmt as any).type !== "EmptyStatement",
    );
    const fn = j.functionDeclaration(
      j.identifier(localName),
      [propsParam],
      j.blockStatement(filteredBody),
    );
    if (needsPolymorphicTypeParams) {
      (fn as any).typeParameters = jb.buildPolymorphicTypeParams(j, tagName);
    }
    return [fn];
  }

  parseVariantWhenToAst(when: string) {
    return vc.parseVariantWhenToAst(this.j, when);
  }

  collectConditionProps(args: {
    when: string;
    destructureProps?: string[];
    booleanProps?: ReadonlySet<string>;
    knownProps?: ReadonlySet<string>;
    nonPropRoots?: ReadonlySet<string>;
  }) {
    return vc.collectConditionProps(this.j, args);
  }

  makeConditionalStyleExpr(args: {
    cond: LogicalExpressionOperand;
    expr: ExpressionKind;
    isBoolean: boolean;
  }): ExpressionKind {
    return vc.makeConditionalStyleExpr(this.j, args);
  }

  buildExtraStylexPropsExprs(args: {
    entries: ReadonlyArray<{ when?: string; expr: ExpressionKind }>;
    destructureProps?: string[];
    booleanProps?: ReadonlySet<string>;
  }): ExpressionKind[] {
    return vc.buildExtraStylexPropsExprs(this.j, args);
  }

  buildExtraStylexPropsExprEntries(args: {
    entries: NonNullable<StyledDecl["extraStylexPropsArgs"]>;
    destructureProps?: string[];
    booleanProps?: ReadonlySet<string>;
  }): vc.ExtraStylexPropsExprEntry[] {
    return vc.buildExtraStylexPropsExprEntries(this.j, args);
  }

  private literalExpr(value: unknown): ExpressionKind {
    return jb.literalExpr(this.j, value);
  }

  buildDefaultAttrsFromProps(args: {
    defaultAttrs: Array<{ jsxProp: string; attrName: string; value: unknown }>;
    propExprFor: (jsxProp: string) => ExpressionKind;
  }): JsxAttr[] {
    return jb.buildDefaultAttrsFromProps(this.j, args);
  }

  buildStaticValueAttrs(args: { attrs: Array<{ attrName: string; value: unknown }> }): JsxAttr[] {
    return jb.buildStaticValueAttrs(this.j, args);
  }

  buildConditionalAttrs(args: {
    conditionalAttrs: Array<{ jsxProp: string; attrName: string; value: unknown }>;
    testExprFor: (jsxProp: string) => ExpressionKind;
  }): JsxAttr[] {
    return jb.buildConditionalAttrs(this.j, args);
  }

  buildInvertedBoolAttrs(args: {
    invertedBoolAttrs: Array<{ jsxProp: string; attrName: string }>;
    testExprFor: (jsxProp: string) => ExpressionKind;
  }): JsxAttr[] {
    return jb.buildInvertedBoolAttrs(this.j, args);
  }

  buildDynamicAttrsFromProps(args: {
    dynamicAttrs: Array<{ jsxProp: string; attrName: string; defaultValue?: unknown }>;
    propExprFor: (jsxProp: string) => ExpressionKind;
  }): JsxAttr[] {
    return jb.buildDynamicAttrsFromProps(this.j, args);
  }

  buildStaticAttrsFromRecord(
    staticAttrs: Record<string, unknown>,
    options?: { booleanTrueAsShorthand?: boolean },
  ): JsxAttr[] {
    return jb.buildStaticAttrsFromRecord(this.j, staticAttrs, options);
  }

  buildAttrsFromAttrsInfo(args: {
    attrsInfo: StyledDecl["attrsInfo"];
    propExprFor: (prop: string) => ExpressionKind;
  }): JsxAttr[] {
    return jb.buildAttrsFromAttrsInfo(this.j, args);
  }

  appendMergingAttrs(attrs: JsxAttr[], merging: ReturnType<typeof emitStyleMerging>): void {
    jb.appendMergingAttrs(this.j, attrs, merging);
  }

  buildJsxElement(args: {
    tagName: string | JsxTagName;
    attrs: JsxAttr[];
    includeChildren: boolean;
    childrenExpr?: ExpressionKind;
  }): ASTNode {
    return jb.buildJsxElement(this.j, args);
  }

  buildWrapperFunction(args: {
    localName: string;
    params: FunctionParams;
    bodyStmts: StatementKind[];
    typeParameters?: unknown;
    moveTypeParamsFromParam?: Identifier;
  }): ASTNode {
    return jb.buildWrapperFunction(this.j, args);
  }

  buildChildrenOnlyParam(typeText?: string): FunctionParams[number] {
    if (!this.emitTypes) {
      return this.j.objectPattern([this.patternProp("children")]) as FunctionParams[number];
    }
    if (!typeText) {
      throw new Error("Missing props type for children-only wrapper parameter.");
    }
    return this.j(`function _({ children }: ${typeText}) {}`).get().node.program.body[0].params[0];
  }

  private annotateMinimalWrapperParam(
    propsParam: FunctionParams[number],
    args: {
      localName: string;
      tagName: string;
      inlineTypeText?: string;
      propsTypeName?: string;
      needsPolymorphicTypeParams: boolean;
    },
  ): void {
    const { localName, tagName, inlineTypeText, propsTypeName, needsPolymorphicTypeParams } = args;
    if (!this.emitTypes) {
      return;
    }
    if (inlineTypeText) {
      let typeNode: TsTypeAnnotationInput | null = null;
      try {
        typeNode = this.j(`const x: ${inlineTypeText} = null`).get().node.program.body[0]
          .declarations[0].id.typeAnnotation.typeAnnotation;
      } catch (e) {
        throw new Error(
          [
            `Failed to parse inline wrapper props type for ${localName} (${tagName}).`,
            `Inline type: ${inlineTypeText}`,
            `Error: ${e instanceof Error ? e.message : String(e)}`,
          ].join("\n"),
        );
      }
      if (!typeNode) {
        throw new Error(`Failed to parse inline wrapper props type for ${localName} (${tagName}).`);
      }
      (propsParam as any).typeAnnotation = this.j.tsTypeAnnotation(typeNode);
      return;
    }
    if (!propsTypeName) {
      throw new Error(`Missing propsTypeName for ${localName} (${tagName}).`);
    }
    if (needsPolymorphicTypeParams) {
      (propsParam as any).typeAnnotation = this.j(
        `const x: ${propsTypeName}<C> = null`,
      ).get().node.program.body[0].declarations[0].id.typeAnnotation;
      return;
    }
    (propsParam as any).typeAnnotation = this.j.tsTypeAnnotation(
      this.j.tsTypeReference(this.j.identifier(propsTypeName)),
    );
  }

  buildDestructurePatternProps(args: {
    baseProps: Array<Property | RestElement>;
    destructureProps: Array<string | null | undefined>;
    propDefaults?: WrapperPropDefaults;
    includeRest?: boolean;
    restId?: Identifier;
  }): Array<Property | RestElement> {
    return jb.buildDestructurePatternProps(this.j, this.patternProp, args);
  }

  shouldPassChildrenThroughRest(
    args: Parameters<typeof jb.shouldPassChildrenThroughRest>[0],
  ): boolean {
    return jb.shouldPassChildrenThroughRest(args);
  }

  isChildrenOnlyDestructurePattern(patternProps: Array<Property | RestElement>): boolean {
    return jb.isChildrenOnlyDestructurePattern(patternProps);
  }

  baseStyleExpr(d: StyledDecl) {
    return seb.baseStyleExpr(this.j, this.stylesIdentifier, d);
  }

  splitExtraStyleArgs(d: StyledDecl) {
    return seb.splitExtraStyleArgs(this.j, this.stylesIdentifier, d);
  }

  buildInterleavedExtraStyleArgs(d: StyledDecl, propsArgExprs: vc.ExtraStylexPropsExprEntry[]) {
    return seb.buildInterleavedExtraStyleArgs(this.j, this.stylesIdentifier, d, propsArgExprs);
  }

  /**
   * Build the initial `stylex.props()` style args from a declaration's extra
   * stylex.props() entries and extra style keys (interleaved via mixinOrder),
   * returning the base `styleArgs` plus the `afterVariantStyleArgs` that callers
   * append once variant conditionals have been emitted. When `destructureProps`
   * is provided, prop bindings discovered while lowering props args are recorded
   * there for the wrapper's destructuring pattern.
   */
  buildStyleArgsWithExtras(
    d: StyledDecl,
    destructureProps?: string[],
  ): { styleArgs: ExpressionKind[]; afterVariantStyleArgs: ExpressionKind[] } {
    const propsArgExprs = d.extraStylexPropsArgs
      ? this.buildExtraStylexPropsExprEntries({
          entries: d.extraStylexPropsArgs,
          ...(destructureProps ? { destructureProps } : {}),
        })
      : [];
    const {
      beforeBase: extraStyleArgs,
      afterBase: extraStyleArgsAfterBase,
      afterVariants: afterVariantStyleArgs,
    } = this.buildInterleavedExtraStyleArgs(d, propsArgExprs);
    const styleArgs = seb.buildInitialStyleArgs(
      this.j,
      this.stylesIdentifier,
      d,
      extraStyleArgs,
      extraStyleArgsAfterBase,
    );
    return { styleArgs, afterVariantStyleArgs };
  }

  splitAttrsInfo(
    attrsInfo: StyledDecl["attrsInfo"],
    bridgeClassVar?: string,
    extraClassNames?: StyledDecl["extraClassNames"],
  ) {
    return seb.splitAttrsInfo(this.j, attrsInfo, bridgeClassVar, extraClassNames);
  }

  buildVariantDimensionLookups(args: {
    dimensions: VariantDimension[];
    styleArgs: ExpressionKind[];
    destructureProps?: string[];
    propDefaults?: WrapperPropDefaults;
    namespaceBooleanProps?: string[];
    orderedEntries?: seb.OrderedStyleEntry[];
    knownProps?: ReadonlySet<string>;
  }): void {
    seb.buildVariantDimensionLookups(this.j, { ...args, stylesIdentifier: this.stylesIdentifier });
  }

  buildStyleFnExpressions(args: {
    d: StyledDecl;
    styleArgs: ExpressionKind[];
    destructureProps?: string[];
    propExprBuilder?: (jsxProp: string) => ExpressionKind;
    propsIdentifier?: ExpressionKind;
    orderedEntries?: seb.OrderedStyleEntry[];
  }): void {
    seb.buildStyleFnExpressions(this, args);
  }

  collectDestructurePropsFromStyleFns(args: {
    d: StyledDecl;
    styleArgs: ExpressionKind[];
    destructureProps: string[];
  }): void {
    seb.collectDestructurePropsFromStyleFns(this, args);
  }
}
