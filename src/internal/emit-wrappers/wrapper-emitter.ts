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
  JSXMemberExpression,
  JSXSpreadAttribute,
  JSXIdentifier,
  Property,
  RestElement,
} from "jscodeshift";
import type { StyleMergerConfig } from "../../adapter.js";
import type { StyledDecl } from "../transform-types.js";
import { emitStyleMerging } from "./style-merger.js";
import type { ExportInfo, ExpressionKind, InlineStyleProp } from "./types.js";
import { TAG_TO_HTML_ELEMENT, VOID_TAGS } from "./type-helpers.js";
import type { VariantDimension } from "../transform-types.js";
import {
  buildStyleFnConditionExpr,
  collectIdentifiers,
  isIdentifierNode,
} from "../utilities/jscodeshift-utils.js";

type TsTypeAnnotationInput = Parameters<JSCodeshift["tsTypeAnnotation"]>[0];
type BlockStatementBody = Parameters<JSCodeshift["blockStatement"]>[0];
export type StatementKind = Parameters<JSCodeshift["blockStatement"]>[0][number];
export type JsxAttr = JSXAttribute | JSXSpreadAttribute;
export type JsxTagName = JSXIdentifier | JSXMemberExpression;
type LogicalExpressionOperand = Parameters<JSCodeshift["logicalExpression"]>[1];
type AstNodeOrNull = ASTNode | null | undefined;

export type WrapperEmitterArgs = {
  root: Collection<ASTNode>;
  j: JSCodeshift;
  filePath: string;
  wrapperDecls: StyledDecl[];
  wrapperNames: Set<string>;
  patternProp: (keyName: string, valueId?: ASTNode) => Property;
  exportedComponents: Map<string, ExportInfo>;
  stylesIdentifier: string;
  styleMerger: StyleMergerConfig | null;
  emptyStyleKeys?: Set<string>;
  ancestorSelectorParents?: Set<string>;
};

export class WrapperEmitter {
  readonly root: Collection<ASTNode>;
  readonly j: JSCodeshift;
  readonly filePath: string;
  readonly wrapperDecls: StyledDecl[];
  readonly wrapperNames: Set<string>;
  readonly patternProp: (keyName: string, valueId?: ASTNode) => Property;
  readonly exportedComponents: Map<string, ExportInfo>;
  readonly stylesIdentifier: string;
  readonly styleMerger: StyleMergerConfig | null;
  readonly emptyStyleKeys: Set<string>;
  readonly ancestorSelectorParents: Set<string>;

  // For plain JS/JSX and Flow transforms, skip emitting TS syntax entirely for now.
  readonly emitTypes: boolean;

  // Local caches (were in `usage.ts`)
  private usedAttrsCache = new Map<string, Set<string>>();
  private jsxCallsitesCache = new Map<string, { hasAny: boolean }>();
  private jsxChildrenUsageCache = new Map<string, boolean>();
  private usedAsValueCache = new Map<string, boolean>();

  constructor(args: WrapperEmitterArgs) {
    this.root = args.root;
    this.j = args.j;
    this.filePath = args.filePath;
    this.wrapperDecls = args.wrapperDecls;
    this.wrapperNames = args.wrapperNames;
    this.patternProp = args.patternProp;
    this.exportedComponents = args.exportedComponents;
    this.stylesIdentifier = args.stylesIdentifier;
    this.styleMerger = args.styleMerger;
    this.emptyStyleKeys = args.emptyStyleKeys ?? new Set<string>();
    this.ancestorSelectorParents = args.ancestorSelectorParents ?? new Set<string>();
    this.emitTypes = this.filePath.endsWith(".ts") || this.filePath.endsWith(".tsx");
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

  /**
   * Decide whether a wrapper component should accept/merge external `className`/`style`.
   */
  shouldAllowClassNameProp(d: StyledDecl): boolean {
    if (d.supportsExternalStyles) {
      return true;
    }
    if ((d as any).usedAsValue) {
      return true;
    }
    const used = this.getUsedAttrs(d.localName);
    return used.has("*") || used.has("className");
  }

  shouldAllowStyleProp(d: StyledDecl): boolean {
    if (d.supportsExternalStyles) {
      return true;
    }
    if ((d as any).usedAsValue) {
      return true;
    }
    const used = this.getUsedAttrs(d.localName);
    return used.has("*") || used.has("style");
  }

  shouldAllowAsPropForIntrinsic(d: StyledDecl, tagName: string): boolean {
    // Allow `as` prop when explicitly requested via adapter, even for void tags
    if (d.supportsAsProp) {
      return true;
    }
    if (d.supportsExternalStyles) {
      return true;
    }
    // For void tags without explicit opt-in, don't allow `as` prop
    if (VOID_TAGS.has(tagName)) {
      return false;
    }
    const used = this.getUsedAttrs(d.localName);
    return used.has("as") || used.has("forwardedAs");
  }

  private stringifyTsTypeName(n: AstNodeOrNull): string | null {
    if (!n) {
      return null;
    }
    if (isIdentifierNode(n)) {
      return n.name;
    }
    if (n.type === "TSQualifiedName") {
      const left = this.stringifyTsTypeName((n as any).left);
      const right = this.stringifyTsTypeName((n as any).right);
      return left && right ? `${left}.${right}` : null;
    }
    return null;
  }

  stringifyTsType(t: AstNodeOrNull): string | null {
    if (!t) {
      return null;
    }
    if (t.type === "TSTypeReference") {
      const base = this.stringifyTsTypeName((t as any).typeName);
      if (!base) {
        return null;
      }
      const params = (t as any).typeParameters?.params;
      if (Array.isArray(params) && params.length > 0) {
        const inner = params.map((p: any) => this.stringifyTsType(p)).filter(Boolean) as string[];
        if (inner.length === params.length) {
          return `${base}<${inner.join(", ")}>`;
        }
      }
      return base;
    }
    if (t.type === "TSTypeLiteral") {
      const members = Array.isArray((t as any).members) ? (t as any).members : [];
      const lines: string[] = [];
      for (const m of members) {
        if (!m || m.type !== "TSPropertySignature") {
          continue;
        }
        const key = (() => {
          const k = m.key;
          if (!k) {
            return null;
          }
          if (k.type === "Identifier") {
            return k.name;
          }
          if (k.type === "StringLiteral") {
            return JSON.stringify(k.value);
          }
          if (k.type === "Literal" && typeof k.value === "string") {
            return JSON.stringify(k.value);
          }
          return null;
        })();
        if (!key) {
          continue;
        }
        const ann = m.typeAnnotation?.typeAnnotation;
        const val = this.stringifyTsType(ann) ?? "any";
        const opt = m.optional ? "?" : "";
        lines.push(`  ${key}${opt}: ${val};`);
      }
      if (lines.length === 0) {
        return "{}";
      }
      return `{\n${lines.join("\n")}\n}`;
    }
    if (t.type === "TSUnionType") {
      const parts = ((t as any).types ?? [])
        .map((p: any) => this.stringifyTsType(p))
        .filter(Boolean) as string[];
      return parts.length === ((t as any).types ?? []).length ? parts.join(" | ") : null;
    }
    if (t.type === "TSIntersectionType") {
      const parts = ((t as any).types ?? [])
        .map((p: any) => this.stringifyTsType(p))
        .filter(Boolean) as string[];
      return parts.length === ((t as any).types ?? []).length ? parts.join(" & ") : null;
    }
    if (t.type === "TSLiteralType") {
      const lit = (t as any).literal;
      if (lit?.type === "StringLiteral") {
        return JSON.stringify(lit.value);
      }
      if (lit?.type === "NumericLiteral") {
        return String(lit.value);
      }
      if (lit?.type === "BooleanLiteral") {
        return lit.value ? "true" : "false";
      }
    }
    if (t.type === "TSIndexedAccessType") {
      const obj = this.stringifyTsType((t as any).objectType);
      const idx = this.stringifyTsType((t as any).indexType);
      return obj && idx ? `${obj}[${idx}]` : null;
    }
    const maybeKeyof = t as { type?: string; typeAnnotation?: AstNodeOrNull };
    if (maybeKeyof.type === "TSKeyofType") {
      const ref = this.stringifyTsType(maybeKeyof.typeAnnotation);
      return ref ? `keyof ${ref}` : null;
    }
    if ((t as any).type === "TSTypeOperator" && (t as any).operator === "keyof") {
      const ref = this.stringifyTsType((t as any).typeAnnotation);
      return ref ? `keyof ${ref}` : null;
    }
    if (t.type === "TSStringKeyword") {
      return "string";
    }
    if (t.type === "TSNumberKeyword") {
      return "number";
    }
    if (t.type === "TSBooleanKeyword") {
      return "boolean";
    }
    if (t.type === "TSAnyKeyword") {
      return "any";
    }
    if (t.type === "TSUndefinedKeyword") {
      return "undefined";
    }
    if (t.type === "TSNullKeyword") {
      return "null";
    }
    if (t.type === "TSVoidKeyword") {
      return "void";
    }
    if (t.type === "TSNeverKeyword") {
      return "never";
    }
    if (t.type === "TSUnknownKeyword") {
      return "unknown";
    }
    return null;
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
    // Parse the base type into a TSExpressionWithTypeArguments node
    const parsed = j(`interface X extends ${baseTypeText} {}`).get().node.program.body[0] as any;
    const extendsClause = parsed?.extends?.[0];
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
        // Add to existing intersection
        existingType.types = [baseTypeNode, ...types];
      } else {
        // Convert to intersection type: BaseType & ExistingType
        alias.typeAnnotation = j.tsIntersectionType([baseTypeNode, existingType]);
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

  annotatePropsParam(propsId: Identifier, localName: string, inlineTypeText?: string): void {
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
      (propsId as any).typeAnnotation = j.tsTypeAnnotation(typeNode);
    } else {
      (propsId as any).typeAnnotation = j.tsTypeAnnotation(
        j.tsTypeReference(j.identifier(this.propsTypeNameFor(localName))),
      );
    }
  }

  withChildren(innerTypeText: string): string {
    const t = innerTypeText.trim();
    if (t.startsWith("React.PropsWithChildren<")) {
      return t;
    }
    if (
      t.startsWith("React.ComponentProps<") ||
      t.startsWith("React.ComponentPropsWithRef<") ||
      t.startsWith("React.HTMLAttributes<") ||
      t.startsWith("React.AnchorHTMLAttributes<") ||
      t.startsWith("React.ButtonHTMLAttributes<") ||
      t.startsWith("React.InputHTMLAttributes<") ||
      t.startsWith("React.ImgHTMLAttributes<") ||
      t.startsWith("React.LabelHTMLAttributes<") ||
      t.startsWith("React.SelectHTMLAttributes<") ||
      t.startsWith("React.TextareaHTMLAttributes<") ||
      /^(Omit|Pick|Partial|Required|Readonly|ReadonlyArray|NonNullable|Extract|Exclude)<\s*React\.ComponentProps(?:WithRef)?</.test(
        t,
      ) ||
      /^(Omit|Pick|Partial|Required|Readonly|ReadonlyArray|NonNullable|Extract|Exclude)<\s*React\..*HTMLAttributes</.test(
        t,
      )
    ) {
      return t;
    }
    return `React.PropsWithChildren<${t}>`;
  }

  joinIntersection(...parts: Array<string | null | undefined>): string {
    const xs = parts
      .map((p) => (p ?? "").trim())
      .filter(Boolean)
      .filter((p) => p !== "{}");
    if (xs.length === 0) {
      return "{}";
    }
    if (xs.length === 1 && xs[0]) {
      return xs[0];
    }
    return xs.join(" & ");
  }

  private isValidTypeKeyIdentifier(name: string): boolean {
    return /^[$A-Z_][0-9A-Z_$]*$/i.test(name);
  }

  private toTypeKey(name: string): string {
    return this.isValidTypeKeyIdentifier(name) ? name : JSON.stringify(name);
  }

  reactIntrinsicAttrsType(tagName: string): string {
    switch (tagName) {
      case "a":
        return "React.AnchorHTMLAttributes<HTMLAnchorElement>";
      case "button":
        return "React.ButtonHTMLAttributes<HTMLButtonElement>";
      case "div":
        return "React.HTMLAttributes<HTMLDivElement>";
      case "input":
        return 'React.ComponentProps<"input">';
      case "img":
        return "React.ImgHTMLAttributes<HTMLImageElement>";
      case "label":
        return "React.LabelHTMLAttributes<HTMLLabelElement>";
      case "select":
        return "React.SelectHTMLAttributes<HTMLSelectElement>";
      case "span":
        return "React.HTMLAttributes<HTMLSpanElement>";
      case "textarea":
        return "React.TextareaHTMLAttributes<HTMLTextAreaElement>";
      default:
        return "React.HTMLAttributes<HTMLElement>";
    }
  }

  getExplicitPropNames(propsType: AstNodeOrNull): Set<string> {
    const names = new Set<string>();
    const { root, j } = this;

    const extractFromLiteral = (literal: AstNodeOrNull): void => {
      if (!literal || literal.type !== "TSTypeLiteral") {
        return;
      }
      for (const member of (literal as any).members ?? []) {
        if (member?.type !== "TSPropertySignature") {
          continue;
        }
        const key = member.key;
        const name =
          key?.type === "Identifier"
            ? key.name
            : key?.type === "StringLiteral"
              ? key.value
              : key?.type === "Literal" && typeof key.value === "string"
                ? key.value
                : null;
        if (name) {
          names.add(name);
        }
      }
    };

    const extractFromType = (type: AstNodeOrNull): void => {
      if (!type) {
        return;
      }
      if (type.type === "TSTypeLiteral") {
        extractFromLiteral(type);
      } else if (type.type === "TSIntersectionType") {
        for (const t of (type as any).types ?? []) {
          extractFromType(t);
        }
      } else if (type.type === "TSTypeReference" && (type as any).typeName?.type === "Identifier") {
        const typeName = (type as any).typeName.name;
        const interfaceDecl = root
          .find(j.TSInterfaceDeclaration)
          .filter((p) => (p.node as any).id?.name === typeName);
        if (interfaceDecl.size() > 0) {
          const body = interfaceDecl.get().node.body?.body ?? [];
          for (const member of body) {
            if (member?.type !== "TSPropertySignature") {
              continue;
            }
            const key = member.key;
            const name = key?.type === "Identifier" ? key.name : null;
            if (name) {
              names.add(name);
            }
          }
        }
        const typeAlias = root
          .find(j.TSTypeAliasDeclaration)
          .filter((p) => (p.node as any).id?.name === typeName);
        if (typeAlias.size() > 0) {
          extractFromType(typeAlias.get().node.typeAnnotation);
        }
      }
    };

    extractFromType(propsType);
    return names;
  }

  inferredIntrinsicPropsTypeText(args: {
    d: StyledDecl;
    tagName: string;
    allowClassNameProp: boolean;
    allowStyleProp: boolean;
    skipProps?: Set<string>;
  }): string {
    const { d, tagName, allowClassNameProp, allowStyleProp, skipProps } = args;
    const used = this.getUsedAttrs(d.localName);
    const needsBroadAttrs = used.has("*") || !!(d as any).usedAsValue;

    const lines: string[] = [];
    if (!needsBroadAttrs) {
      if (allowClassNameProp) {
        lines.push(`className?: string`);
      }
      if (allowStyleProp) {
        lines.push(`style?: React.CSSProperties`);
      }
      const elementType = TAG_TO_HTML_ELEMENT[tagName] ?? "HTMLElement";
      lines.push(`ref?: React.Ref<${elementType}>`);
    }

    for (const attr of [...used].sort((a, b) => a.localeCompare(b))) {
      if (attr === "*" || attr === "children") {
        continue;
      }
      if (attr === "as" || attr === "forwardedAs") {
        continue;
      }
      if (attr === "className" || attr === "style") {
        continue;
      }
      if (skipProps?.has(attr)) {
        continue;
      }
      lines.push(`${this.toTypeKey(attr)}?: any`);
    }

    const literal =
      lines.length > 1
        ? `{\n  ${lines.join(",\n  ")}\n}`
        : lines.length === 1
          ? `{ ${lines[0]} }`
          : "{}";

    if (!needsBroadAttrs) {
      if (VOID_TAGS.has(tagName)) {
        const base = this.reactIntrinsicAttrsType(tagName);
        const omitted: string[] = [];
        if (!allowClassNameProp) {
          omitted.push('"className"');
        }
        if (!allowStyleProp) {
          omitted.push('"style"');
        }
        return omitted.length ? `Omit<${base}, ${omitted.join(" | ")}>` : base;
      }
      return this.withChildren(literal);
    }

    const base = this.reactIntrinsicAttrsType(tagName);
    const omitted: string[] = [];
    if (!allowClassNameProp) {
      omitted.push('"className"');
    }
    if (!allowStyleProp) {
      omitted.push('"style"');
    }
    const baseMaybeOmitted = omitted.length ? `Omit<${base}, ${omitted.join(" | ")}>` : base;
    const composed = this.joinIntersection(baseMaybeOmitted, literal);
    return VOID_TAGS.has(tagName) ? composed : this.withChildren(composed);
  }

  inferredComponentWrapperPropsTypeText(args: {
    d: StyledDecl;
    allowClassNameProp: boolean;
    allowStyleProp: boolean;
  }): string {
    const { d, allowClassNameProp, allowStyleProp } = args;
    const lines: string[] = [];
    const literal = lines.length > 0 ? `{\n${lines.join("\n")}\n}` : "{}";
    const base = `React.ComponentPropsWithRef<typeof ${(d.base as any).ident}>`;
    const omitted: string[] = [];
    if (!allowClassNameProp) {
      omitted.push('"className"');
    }
    if (!allowStyleProp) {
      omitted.push('"style"');
    }
    const baseMaybeOmitted = omitted.length ? `Omit<${base}, ${omitted.join(" | ")}>` : base;
    return literal !== "{}" ? this.joinIntersection(baseMaybeOmitted, literal) : baseMaybeOmitted;
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
    propDefaults?: Map<string, string>;
    allowClassNameProp?: boolean;
    allowStyleProp?: boolean;
    allowAsProp?: boolean;
    includeRest?: boolean;
    defaultAttrs?: Array<{ jsxProp: string; attrName: string; value: unknown }>;
    conditionalAttrs?: Array<{ jsxProp: string; attrName: string; value: unknown }>;
    invertedBoolAttrs?: Array<{ jsxProp: string; attrName: string }>;
    staticAttrs?: Record<string, unknown>;
    inlineStyleProps?: InlineStyleProp[];
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
      includeRest = true,
      defaultAttrs = [],
      conditionalAttrs = [],
      invertedBoolAttrs = [],
      staticAttrs = {},
      inlineStyleProps = [],
    } = args;

    const { j } = this;
    const expandedDestructureProps = new Set(destructureProps.filter(Boolean));
    const collectCondIdentifiers = (node: ASTNode | null | undefined): void => {
      if (!node) {
        return;
      }
      if (isIdentifierNode(node)) {
        expandedDestructureProps.add(node.name);
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
    const propsParamId = j.identifier("props");
    const needsPolymorphicTypeParams =
      this.emitTypes && (allowAsProp || Boolean(inlineTypeText?.includes("<C")));
    if (this.emitTypes) {
      if (inlineTypeText) {
        let typeNode: TsTypeAnnotationInput | null = null;
        try {
          typeNode = j(`const x: ${inlineTypeText} = null`).get().node.program.body[0]
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
          throw new Error(
            `Failed to parse inline wrapper props type for ${localName} (${tagName}).`,
          );
        }
        (propsParamId as any).typeAnnotation = j.tsTypeAnnotation(typeNode);
      } else {
        if (!propsTypeName) {
          throw new Error(`Missing propsTypeName for ${localName} (${tagName}).`);
        }
        if (needsPolymorphicTypeParams) {
          (propsParamId as any).typeAnnotation = j(
            `const x: ${propsTypeName}<C> = null`,
          ).get().node.program.body[0].declarations[0].id.typeAnnotation;
        } else {
          (propsParamId as any).typeAnnotation = j.tsTypeAnnotation(
            j.tsTypeReference(j.identifier(propsTypeName)),
          );
        }
      }
    }
    const propsId = j.identifier("props");

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
    if (!isVoidTag) {
      patternProps.push(this.patternProp("children"));
    }
    if (allowClassNameProp) {
      patternProps.push(this.patternProp("className"));
    }
    if (allowStyleProp) {
      patternProps.push(this.patternProp("style"));
    }
    // Build a set of defaultAttrs prop names to check if we should skip destructuring defaults
    const defaultAttrsSet = new Set(defaultAttrs.map((a) => a.jsxProp));

    for (const name of expandedDestructureProps) {
      if (name !== "children" && name !== "style" && name !== "className") {
        const defaultVal = propDefaults?.get(name);
        // Don't add destructuring defaults for defaultAttrs props - we use ?? in JSX instead
        // to preserve nullish coalescing semantics (handles both undefined AND null)
        const isDefaultAttr = defaultAttrsSet.has(name);
        if (defaultVal && !isDefaultAttr) {
          patternProps.push(
            j.property.from({
              kind: "init",
              key: j.identifier(name),
              value: j.assignmentPattern(j.identifier(name), j.literal(defaultVal)),
              shorthand: false,
            }) as Property,
          );
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

    let restId: Identifier | null = includeRest ? j.identifier("rest") : null;
    if (includeRest && restId) {
      patternProps.push(j.restElement(restId));
    }
    const usePropsDirectlyForRest =
      includeRest && patternProps.length === 1 && patternProps[0]?.type === "RestElement";
    if (usePropsDirectlyForRest) {
      restId = propsId;
    }

    const classNameId = j.identifier("className");
    const styleId = j.identifier("style");
    const staticClassName =
      typeof staticAttrs.className === "string" ? staticAttrs.className : undefined;
    const { className: _omit, ...filteredStaticAttrs } = staticAttrs;
    const merging = emitStyleMerging({
      j,
      emitter: this,
      styleArgs,
      classNameId,
      styleId,
      allowClassNameProp,
      allowStyleProp,
      inlineStyleProps,
      staticClassNameExpr: staticClassName ? j.literal(staticClassName) : undefined,
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

    if (includeRest && restId) {
      jsxAttrs.push(j.jsxSpreadAttribute(restId));
    }

    for (const [key, value] of Object.entries(filteredStaticAttrs)) {
      if (typeof value === "string") {
        jsxAttrs.push(j.jsxAttribute(j.jsxIdentifier(key), j.literal(value)));
      } else if (typeof value === "boolean") {
        jsxAttrs.push(
          j.jsxAttribute(
            j.jsxIdentifier(key),
            value ? null : j.jsxExpressionContainer(j.literal(false)),
          ),
        );
      } else if (typeof value === "number") {
        jsxAttrs.push(
          j.jsxAttribute(j.jsxIdentifier(key), j.jsxExpressionContainer(j.literal(value))),
        );
      }
    }

    if (tagName === "button" && destructureProps.includes("disabled")) {
      jsxAttrs.push(
        j.jsxAttribute(
          j.jsxIdentifier("disabled"),
          j.jsxExpressionContainer(j.identifier("disabled")),
        ),
      );
    }

    if (merging.jsxSpreadExpr) {
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

    const renderedTagName = allowAsProp ? "Component" : tagName;
    const openingEl = j.jsxOpeningElement(j.jsxIdentifier(renderedTagName), jsxAttrs, isVoidTag);
    const jsx = j.jsxElement(
      openingEl,
      isVoidTag ? null : j.jsxClosingElement(j.jsxIdentifier(renderedTagName)),
      isVoidTag ? [] : [j.jsxExpressionContainer(j.identifier("children"))],
    );

    const bodyStmts: BlockStatementBody = [];
    if (!usePropsDirectlyForRest) {
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
      [propsParamId],
      j.blockStatement(filteredBody),
    );
    if (needsPolymorphicTypeParams) {
      (fn as any).typeParameters = j(
        `function _<C extends React.ElementType = "${tagName}">() { return null }`,
      ).get().node.program.body[0].typeParameters;
    }
    return [fn];
  }

  parseVariantWhenToAst(when: string): {
    cond: LogicalExpressionOperand;
    props: string[];
    isBoolean: boolean;
  } {
    const { j } = this;
    const isValidIdentifier = (name: string): boolean => /^[$A-Z_][0-9A-Z_$]*$/i.test(name);
    const buildMemberExpr = (raw: string): ExpressionKind | null => {
      if (!raw.includes(".")) {
        return null;
      }
      const parts = raw
        .split(".")
        .map((part) => part.trim())
        .filter(Boolean);
      if (parts.length < 2 || parts.some((part) => !isValidIdentifier(part))) {
        return null;
      }
      return parts
        .slice(1)
        .reduce<ExpressionKind>(
          (acc, part) => j.memberExpression(acc, j.identifier(part)),
          j.identifier(parts[0]!),
        );
    };
    const parsePropRef = (raw: string): { propName: string | null; expr: ExpressionKind } => {
      const trimmedRaw = raw.trim();
      if (!trimmedRaw) {
        return { propName: null, expr: j.identifier("undefined") };
      }
      if (trimmedRaw.includes(".")) {
        const parts = trimmedRaw
          .split(".")
          .map((part) => part.trim())
          .filter(Boolean);
        const last = parts[parts.length - 1];
        if (!last || !isValidIdentifier(last)) {
          return { propName: null, expr: j.identifier(trimmedRaw) };
        }
        const root = parts[0];
        if (root === "props" || root === "p") {
          const propRoot = parts[1];
          if (!propRoot || !isValidIdentifier(propRoot)) {
            return { propName: null, expr: j.identifier(trimmedRaw) };
          }
          const expr = parts
            .slice(2)
            .reduce<ExpressionKind>(
              (acc, part) => j.memberExpression(acc, j.identifier(part)),
              j.identifier(propRoot),
            );
          return { propName: propRoot, expr };
        }
        const memberExpr = buildMemberExpr(trimmedRaw);
        if (memberExpr) {
          return { propName: null, expr: memberExpr };
        }
        return { propName: null, expr: j.identifier(trimmedRaw) };
      }
      return { propName: trimmedRaw, expr: j.identifier(trimmedRaw) };
    };
    const trimmed = String(when ?? "").trim();
    if (!trimmed) {
      return { cond: j.identifier("true"), props: [], isBoolean: true };
    }

    // Handle negation with parentheses first: !(A || B) should strip outer negation
    // before checking for || to avoid incorrect splitting
    if (trimmed.startsWith("!(") && trimmed.endsWith(")")) {
      const inner = trimmed.slice(2, -1).trim();
      const innerParsed = this.parseVariantWhenToAst(inner);
      // Negation always produces boolean
      return {
        cond: j.unaryExpression("!", innerParsed.cond),
        props: innerParsed.props,
        isBoolean: true,
      };
    }

    if (trimmed.includes("&&")) {
      const parts = trimmed
        .split("&&")
        .map((s) => s.trim())
        .filter(Boolean);
      const parsed = parts.map((p) => this.parseVariantWhenToAst(p));
      const firstParsed = parsed[0];
      if (!firstParsed) {
        return { cond: j.identifier("true"), props: [], isBoolean: true };
      }
      const cond = parsed
        .slice(1)
        .reduce((acc, cur) => j.logicalExpression("&&", acc, cur.cond), firstParsed.cond);
      const props = [...new Set(parsed.flatMap((x) => x.props))];
      // Combined && is boolean only if all parts are boolean
      const isBoolean = parsed.every((p) => p.isBoolean);
      return { cond, props, isBoolean };
    }

    // Handle || conditions (e.g., for nested ternary default branches after negation stripped)
    if (trimmed.includes(" || ")) {
      const parts = trimmed
        .split(" || ")
        .map((s) => s.trim())
        .filter(Boolean);
      const parsed = parts.map((p) => this.parseVariantWhenToAst(p));
      const firstParsedOr = parsed[0];
      if (!firstParsedOr) {
        return { cond: j.identifier("true"), props: [], isBoolean: true };
      }
      const cond = parsed
        .slice(1)
        .reduce((acc, cur) => j.logicalExpression("||", acc, cur.cond), firstParsedOr.cond);
      const props = [...new Set(parsed.flatMap((x) => x.props))];
      // Combined || is boolean only if all parts are boolean
      const isBoolean = parsed.every((p) => p.isBoolean);
      return { cond, props, isBoolean };
    }

    // Handle simple negation without parentheses: !prop
    if (trimmed.startsWith("!")) {
      const inner = trimmed.slice(1).trim();
      const innerParsed = this.parseVariantWhenToAst(inner);
      // Negation always produces boolean
      return {
        cond: j.unaryExpression("!", innerParsed.cond),
        props: innerParsed.props,
        isBoolean: true,
      };
    }

    if (trimmed.includes("===") || trimmed.includes("!==")) {
      const op = trimmed.includes("!==") ? "!==" : "===";
      const [lhs, rhsRaw0] = trimmed.split(op).map((s) => s.trim());
      const rhsRaw = rhsRaw0 ?? "";
      const lhsInfo = parsePropRef(lhs ?? "");
      const rhs =
        rhsRaw?.startsWith('"') || rhsRaw?.startsWith("'")
          ? j.literal(JSON.parse(rhsRaw.replace(/^'/, '"').replace(/'$/, '"')))
          : /^-?\d+(\.\d+)?$/.test(rhsRaw)
            ? j.literal(Number(rhsRaw))
            : (buildMemberExpr(rhsRaw) ?? j.identifier(rhsRaw));
      const propName = lhsInfo.propName ?? "";
      // Comparison always produces boolean
      return {
        cond: j.binaryExpression(op as any, lhsInfo.expr, rhs),
        props: propName ? [propName] : [],
        isBoolean: true,
      };
    }

    // Simple identifier - NOT guaranteed to be boolean (could be "" or 0)
    const simple = parsePropRef(trimmed);
    return {
      cond: simple.expr,
      props: simple.propName ? [simple.propName] : [],
      isBoolean: false,
    };
  }

  collectConditionProps(args: { when: string; destructureProps?: string[] }): {
    cond: LogicalExpressionOperand;
    props: string[];
    isBoolean: boolean;
  } {
    const { when, destructureProps } = args;
    const parsed = this.parseVariantWhenToAst(when);
    if (destructureProps) {
      for (const p of parsed.props) {
        if (p && !destructureProps.includes(p)) {
          destructureProps.push(p);
        }
      }
    }
    return parsed;
  }

  /**
   * Creates a conditional style expression that's safe for stylex.props().
   * For boolean conditions, uses && (since false is valid for stylex.props).
   * For non-boolean conditions (could be "" or 0), uses ternary with undefined fallback.
   */
  makeConditionalStyleExpr(args: {
    cond: LogicalExpressionOperand;
    expr: ExpressionKind;
    isBoolean: boolean;
  }): ExpressionKind {
    const { j } = this;
    const { cond, expr, isBoolean } = args;
    if (isBoolean) {
      return j.logicalExpression("&&", cond, expr);
    }
    return j.conditionalExpression(cond, expr, j.identifier("undefined"));
  }

  private literalExpr(value: unknown): ExpressionKind {
    const { j } = this;
    if (typeof value === "boolean") {
      return j.booleanLiteral(value);
    }
    if (typeof value === "number") {
      return j.literal(value);
    }
    if (typeof value === "string") {
      return j.literal(value);
    }
    return j.literal(String(value));
  }

  buildDefaultAttrsFromProps(args: {
    defaultAttrs: Array<{ jsxProp: string; attrName: string; value: unknown }>;
    propExprFor: (jsxProp: string) => ExpressionKind;
  }): JsxAttr[] {
    const { j } = this;
    const { defaultAttrs, propExprFor } = args;
    return defaultAttrs.map((a) =>
      j.jsxAttribute(
        j.jsxIdentifier(a.attrName),
        j.jsxExpressionContainer(
          j.logicalExpression("??", propExprFor(a.jsxProp), this.literalExpr(a.value) as any),
        ),
      ),
    );
  }

  buildStaticValueAttrs(args: { attrs: Array<{ attrName: string; value: unknown }> }): JsxAttr[] {
    const { j } = this;
    const { attrs } = args;
    return attrs.map((a) => {
      if (typeof a.value === "string") {
        return j.jsxAttribute(j.jsxIdentifier(a.attrName), j.literal(a.value));
      }
      if (typeof a.value === "number") {
        return j.jsxAttribute(
          j.jsxIdentifier(a.attrName),
          j.jsxExpressionContainer(j.literal(a.value)),
        );
      }
      if (typeof a.value === "boolean") {
        return j.jsxAttribute(
          j.jsxIdentifier(a.attrName),
          j.jsxExpressionContainer(j.booleanLiteral(a.value)),
        );
      }
      return j.jsxAttribute(
        j.jsxIdentifier(a.attrName),
        j.jsxExpressionContainer(this.literalExpr(a.value)),
      );
    });
  }

  buildConditionalAttrs(args: {
    conditionalAttrs: Array<{ jsxProp: string; attrName: string; value: unknown }>;
    testExprFor: (jsxProp: string) => ExpressionKind;
  }): JsxAttr[] {
    const { j } = this;
    const { conditionalAttrs, testExprFor } = args;
    return conditionalAttrs.map((cond) =>
      j.jsxAttribute(
        j.jsxIdentifier(cond.attrName),
        j.jsxExpressionContainer(
          j.conditionalExpression(
            testExprFor(cond.jsxProp),
            this.literalExpr(cond.value),
            j.identifier("undefined"),
          ),
        ),
      ),
    );
  }

  buildInvertedBoolAttrs(args: {
    invertedBoolAttrs: Array<{ jsxProp: string; attrName: string }>;
    testExprFor: (jsxProp: string) => ExpressionKind;
  }): JsxAttr[] {
    const { j } = this;
    const { invertedBoolAttrs, testExprFor } = args;
    return invertedBoolAttrs.map((inv) =>
      j.jsxAttribute(
        j.jsxIdentifier(inv.attrName),
        j.jsxExpressionContainer(
          j.binaryExpression("!==", testExprFor(inv.jsxProp), j.booleanLiteral(true)),
        ),
      ),
    );
  }

  buildStaticAttrsFromRecord(
    staticAttrs: Record<string, unknown>,
    options?: { booleanTrueAsShorthand?: boolean },
  ): JsxAttr[] {
    const { j } = this;
    const booleanTrueAsShorthand = options?.booleanTrueAsShorthand ?? true;
    const attrs: JsxAttr[] = [];
    for (const [key, value] of Object.entries(staticAttrs)) {
      if (typeof value === "string") {
        attrs.push(j.jsxAttribute(j.jsxIdentifier(key), j.literal(value)));
      } else if (typeof value === "boolean") {
        if (value) {
          attrs.push(
            j.jsxAttribute(
              j.jsxIdentifier(key),
              booleanTrueAsShorthand ? null : j.jsxExpressionContainer(j.booleanLiteral(true)),
            ),
          );
        } else {
          attrs.push(
            j.jsxAttribute(j.jsxIdentifier(key), j.jsxExpressionContainer(j.literal(false))),
          );
        }
      } else if (typeof value === "number") {
        attrs.push(
          j.jsxAttribute(j.jsxIdentifier(key), j.jsxExpressionContainer(j.literal(value))),
        );
      }
    }
    return attrs;
  }

  /**
   * Build all attrs from attrsInfo in the correct order:
   * defaultAttrs, conditionalAttrs, invertedBoolAttrs, staticAttrs
   */
  buildAttrsFromAttrsInfo(args: {
    attrsInfo: StyledDecl["attrsInfo"];
    propExprFor: (prop: string) => ExpressionKind;
  }): JsxAttr[] {
    const { attrsInfo, propExprFor } = args;
    if (!attrsInfo) {
      return [];
    }
    return [
      ...this.buildDefaultAttrsFromProps({
        defaultAttrs: attrsInfo.defaultAttrs ?? [],
        propExprFor,
      }),
      ...this.buildConditionalAttrs({
        conditionalAttrs: attrsInfo.conditionalAttrs ?? [],
        testExprFor: propExprFor,
      }),
      ...this.buildInvertedBoolAttrs({
        invertedBoolAttrs: attrsInfo.invertedBoolAttrs ?? [],
        testExprFor: propExprFor,
      }),
      ...this.buildStaticAttrsFromRecord(attrsInfo.staticAttrs ?? {}),
    ];
  }

  appendMergingAttrs(attrs: JsxAttr[], merging: ReturnType<typeof emitStyleMerging>): void {
    const { j } = this;
    if (merging.classNameBeforeSpread && merging.classNameAttr) {
      attrs.push(
        j.jsxAttribute(
          j.jsxIdentifier("className"),
          j.jsxExpressionContainer(merging.classNameAttr),
        ),
      );
    }
    if (merging.jsxSpreadExpr) {
      attrs.push(j.jsxSpreadAttribute(merging.jsxSpreadExpr));
    }
    if (merging.classNameAttr && !merging.classNameBeforeSpread) {
      attrs.push(
        j.jsxAttribute(
          j.jsxIdentifier("className"),
          j.jsxExpressionContainer(merging.classNameAttr),
        ),
      );
    }
    if (merging.styleAttr) {
      attrs.push(
        j.jsxAttribute(j.jsxIdentifier("style"), j.jsxExpressionContainer(merging.styleAttr)),
      );
    }
  }

  buildJsxElement(args: {
    tagName: string | JsxTagName;
    attrs: JsxAttr[];
    includeChildren: boolean;
    childrenExpr?: ExpressionKind;
  }): ASTNode {
    const { j } = this;
    const { tagName, attrs, includeChildren, childrenExpr } = args;
    const jsxTag = typeof tagName === "string" ? j.jsxIdentifier(tagName) : (tagName as JsxTagName);
    const openingEl = j.jsxOpeningElement(jsxTag, attrs, !includeChildren);
    if (!includeChildren) {
      return j.jsxElement(openingEl, null, []);
    }
    const children = childrenExpr ? [j.jsxExpressionContainer(childrenExpr)] : [];
    return j.jsxElement(openingEl, j.jsxClosingElement(jsxTag), children);
  }

  buildWrapperFunction(args: {
    localName: string;
    params: Identifier[];
    bodyStmts: StatementKind[];
    typeParameters?: unknown;
    moveTypeParamsFromParam?: Identifier;
  }): ASTNode {
    const { j } = this;
    const { localName, params, bodyStmts, typeParameters, moveTypeParamsFromParam } = args;
    const filteredBody = bodyStmts.filter(
      (stmt) => stmt && (stmt as any).type !== "EmptyStatement",
    );
    const fn = j.functionDeclaration(
      j.identifier(localName),
      params,
      j.blockStatement(filteredBody),
    );
    if (typeParameters) {
      (fn as any).typeParameters = typeParameters;
    }
    if (moveTypeParamsFromParam && (moveTypeParamsFromParam as any).typeParameters) {
      (fn as any).typeParameters = (moveTypeParamsFromParam as any).typeParameters;
      (moveTypeParamsFromParam as any).typeParameters = undefined;
    }
    return fn;
  }

  buildDestructurePatternProps(args: {
    baseProps: Array<Property | RestElement>;
    destructureProps: Array<string | null | undefined>;
    propDefaults?: Map<string, string>;
    includeRest?: boolean;
    restId?: Identifier;
  }): Array<Property | RestElement> {
    const { j } = this;
    const { baseProps, destructureProps, propDefaults, includeRest = false, restId } = args;
    const patternProps: Array<Property | RestElement> = [...baseProps];

    for (const name of destructureProps.filter((n): n is string => Boolean(n))) {
      const defaultVal = propDefaults?.get(name);
      if (defaultVal) {
        patternProps.push(
          j.property.from({
            kind: "init",
            key: j.identifier(name),
            value: j.assignmentPattern(j.identifier(name), j.literal(defaultVal)),
            shorthand: false,
          }) as Property,
        );
      } else {
        patternProps.push(this.patternProp(name));
      }
    }

    if (includeRest && restId) {
      patternProps.push(j.restElement(restId));
    }

    return patternProps;
  }

  splitExtraStyleArgs(d: StyledDecl): {
    beforeBase: ExpressionKind[];
    afterBase: ExpressionKind[];
  } {
    const { j, stylesIdentifier } = this;
    const afterBaseKeys = new Set(d.extraStyleKeysAfterBase ?? []);
    const beforeBase: ExpressionKind[] = [];
    const afterBase: ExpressionKind[] = [];
    for (const key of d.extraStyleKeys ?? []) {
      const expr = j.memberExpression(j.identifier(stylesIdentifier), j.identifier(key));
      if (afterBaseKeys.has(key)) {
        afterBase.push(expr);
      } else {
        beforeBase.push(expr);
      }
    }
    return { beforeBase, afterBase };
  }

  splitAttrsInfo(attrsInfo: StyledDecl["attrsInfo"]): {
    attrsInfo: StyledDecl["attrsInfo"];
    staticClassNameExpr?: ExpressionKind;
  } {
    const { j } = this;
    const className = attrsInfo?.staticAttrs?.className;
    if (!attrsInfo) {
      return { attrsInfo, staticClassNameExpr: undefined };
    }
    const normalized = {
      ...attrsInfo,
      staticAttrs: attrsInfo.staticAttrs ?? {},
      conditionalAttrs: attrsInfo.conditionalAttrs ?? [],
    };
    if (typeof className !== "string") {
      return { attrsInfo: normalized, staticClassNameExpr: undefined };
    }
    const { className: _omit, ...rest } = normalized.staticAttrs;
    return {
      attrsInfo: {
        ...normalized,
        staticAttrs: rest,
      },
      staticClassNameExpr: j.literal(className) as ExpressionKind,
    };
  }

  /**
   * Build variant dimension lookup expressions for StyleX variants recipe pattern.
   * Generates:
   * - regular: variantsObj[prop] OR variantsObj[prop as keyof typeof variantsObj] ?? variantsObj.default
   * - namespace pair: boolProp ? disabledVariants[prop] : enabledVariants[prop]
   *
   * Optionally collects:
   * - `destructureProps`: props that must be destructured to use in expressions
   * - `propDefaults`: defaults for optional props (safe destructuring defaults)
   * - `namespaceBooleanProps`: boolean props that should be forwarded to wrapped components
   */
  buildVariantDimensionLookups(args: {
    dimensions: VariantDimension[];
    styleArgs: ExpressionKind[];
    destructureProps?: string[];
    propDefaults?: Map<string, string>;
    namespaceBooleanProps?: string[];
  }): void {
    const { j } = this;
    const { dimensions, styleArgs, destructureProps, propDefaults, namespaceBooleanProps } = args;

    // Group namespace dimensions by their boolean prop and propName
    const namespacePairs = new Map<
      string,
      { enabled?: VariantDimension; disabled?: VariantDimension }
    >();
    const regularDimensions: VariantDimension[] = [];

    for (const dim of dimensions) {
      if (dim.namespaceBooleanProp) {
        const key = `${dim.namespaceBooleanProp}:${dim.propName}`;
        const pair = namespacePairs.get(key) ?? {};
        if (dim.isDisabledNamespace) {
          pair.disabled = dim;
        } else {
          pair.enabled = dim;
        }
        namespacePairs.set(key, pair);
      } else {
        regularDimensions.push(dim);
      }
    }

    // Process regular (non-namespace) dimensions first
    for (const dim of regularDimensions) {
      if (destructureProps && !destructureProps.includes(dim.propName)) {
        destructureProps.push(dim.propName);
      }
      const variantsId = j.identifier(dim.variantObjectName);
      const propId = j.identifier(dim.propName);

      if (dim.defaultValue === "default") {
        const keyofExpr = {
          type: "TSTypeOperator",
          operator: "keyof",
          typeAnnotation: j.tsTypeQuery(j.identifier(dim.variantObjectName)),
        };
        const castProp = j.tsAsExpression(propId, keyofExpr as any);
        const lookup = j.memberExpression(variantsId, castProp, true /* computed */);
        const defaultAccess = j.memberExpression(
          j.identifier(dim.variantObjectName),
          j.identifier("default"),
        );
        styleArgs.push(j.logicalExpression("??", lookup, defaultAccess));
      } else {
        if (dim.defaultValue && dim.isOptional && propDefaults) {
          propDefaults.set(dim.propName, dim.defaultValue);
        }
        const lookup = j.memberExpression(variantsId, propId, true /* computed */);
        styleArgs.push(lookup);
      }
    }

    // Process namespace dimension pairs
    for (const [, pair] of namespacePairs) {
      const { enabled, disabled } = pair;
      if (!enabled || !disabled) {
        // Incomplete pair - emit each dimension separately as fallback
        for (const dim of [enabled, disabled]) {
          if (!dim) {
            continue;
          }
          if (destructureProps && !destructureProps.includes(dim.propName)) {
            destructureProps.push(dim.propName);
          }
          const lookup = j.memberExpression(
            j.identifier(dim.variantObjectName),
            j.identifier(dim.propName),
            true,
          );
          styleArgs.push(lookup);
        }
        continue;
      }

      const namespaceBooleanProp = enabled.namespaceBooleanProp;
      if (!namespaceBooleanProp) {
        // Skip if namespace boolean prop is not set
        continue;
      }

      if (destructureProps) {
        if (!destructureProps.includes(enabled.propName)) {
          destructureProps.push(enabled.propName);
        }
        if (!destructureProps.includes(namespaceBooleanProp)) {
          destructureProps.push(namespaceBooleanProp);
        }
      }

      if (namespaceBooleanProps && !namespaceBooleanProps.includes(namespaceBooleanProp)) {
        namespaceBooleanProps.push(namespaceBooleanProp);
      }

      if (
        enabled.defaultValue &&
        enabled.defaultValue !== "default" &&
        enabled.isOptional &&
        propDefaults
      ) {
        propDefaults.set(enabled.propName, enabled.defaultValue);
      }

      const boolPropId = j.identifier(namespaceBooleanProp);
      const propId = j.identifier(enabled.propName);

      const enabledLookup = j.memberExpression(
        j.identifier(enabled.variantObjectName),
        propId,
        true,
      );
      const disabledLookup = j.memberExpression(
        j.identifier(disabled.variantObjectName),
        propId,
        true,
      );

      styleArgs.push(j.conditionalExpression(boolPropId, disabledLookup, enabledLookup));
    }
  }

  /**
   * Build style function call expressions for dynamic prop-based styles.
   * This is a shared helper for handling `styleFnFromProps` consistently across
   * different wrapper types (component wrappers, intrinsic wrappers, etc.).
   *
   * @param args.d - The styled component declaration
   * @param args.styleArgs - Array to push generated style expressions into
   * @param args.destructureProps - Optional array to track props that need destructuring
   * @param args.propExprBuilder - Function to build the expression for accessing a prop
   * @param args.propsIdentifier - Identifier to use for "props" in __props case (defaults to "props")
   */
  buildStyleFnExpressions(args: {
    d: StyledDecl;
    styleArgs: ExpressionKind[];
    destructureProps?: string[];
    propExprBuilder?: (jsxProp: string) => ExpressionKind;
    propsIdentifier?: ExpressionKind;
  }): void {
    const { j, stylesIdentifier } = this;
    const { d, styleArgs, destructureProps } = args;
    const propsId = args.propsIdentifier ?? j.identifier("props");
    const propExprBuilder = args.propExprBuilder ?? ((prop: string) => j.identifier(prop));

    const styleFnPairs = d.styleFnFromProps ?? [];
    const explicitPropNames = d.propsType ? this.getExplicitPropNames(d.propsType) : null;
    const inferPropFromCallArg = (expr: ExpressionKind | null | undefined): string | null => {
      if (!expr || typeof expr !== "object") {
        return null;
      }
      const unwrap = (node: ExpressionKind): ExpressionKind => {
        let cur = node;
        while (cur && typeof cur === "object") {
          const t = (cur as { type?: string }).type;
          if (t === "ParenthesizedExpression") {
            cur = (cur as any).expression as ExpressionKind;
            continue;
          }
          if (t === "TSAsExpression" || t === "TSNonNullExpression") {
            cur = (cur as any).expression as ExpressionKind;
            continue;
          }
          if (t === "TemplateLiteral") {
            const exprs = (cur as any).expressions ?? [];
            if (exprs.length === 1) {
              cur = exprs[0] as ExpressionKind;
              continue;
            }
          }
          break;
        }
        return cur;
      };
      const unwrapped = unwrap(expr);
      if (unwrapped?.type === "Identifier") {
        return unwrapped.name;
      }
      if (unwrapped?.type === "ConditionalExpression") {
        const test = (unwrapped as any).test as ExpressionKind;
        if (test?.type === "Identifier") {
          return test.name;
        }
      }
      return null;
    };
    for (const p of styleFnPairs) {
      const propExpr = p.jsxProp === "__props" ? propsId : propExprBuilder(p.jsxProp);
      const callArg = p.callArg ?? propExpr;
      const call = j.callExpression(
        j.memberExpression(j.identifier(stylesIdentifier), j.identifier(p.fnKey)),
        [callArg],
      );

      // Track call arg identifier for destructuring if needed
      if (p.callArg?.type === "Identifier") {
        const name = p.callArg.name;
        if (name && destructureProps && !destructureProps.includes(name)) {
          destructureProps.push(name);
        }
      }
      if (p.callArg && destructureProps) {
        const inferred = inferPropFromCallArg(p.callArg);
        if (inferred && !destructureProps.includes(inferred)) {
          destructureProps.push(inferred);
        }
      }
      if (p.callArg && destructureProps && explicitPropNames && explicitPropNames.size > 0) {
        const names = new Set<string>();
        collectIdentifiers(p.callArg, names);
        for (const name of names) {
          if (explicitPropNames.has(name) && !destructureProps.includes(name)) {
            destructureProps.push(name);
          }
        }
      }

      // Track prop for destructuring
      if (p.jsxProp !== "__props" && destructureProps && !destructureProps.includes(p.jsxProp)) {
        destructureProps.push(p.jsxProp);
      }

      // Handle conditional style based on conditionWhen
      if (p.conditionWhen) {
        const { cond, isBoolean } = this.collectConditionProps({
          when: p.conditionWhen,
          destructureProps,
        });
        styleArgs.push(this.makeConditionalStyleExpr({ cond, expr: call, isBoolean }));
        continue;
      }

      const isRequired =
        p.jsxProp === "__props" || this.isPropRequiredInPropsTypeLiteral(d.propsType, p.jsxProp);
      styleArgs.push(
        buildStyleFnConditionExpr({ j, condition: p.condition, propExpr, call, isRequired }),
      );
    }
  }

  /**
   * Collects all props that need to be destructured based on styleFnFromProps,
   * explicit prop names used in styleArgs, and shouldForwardProp.dropProps.
   *
   * This is called after buildStyleFnExpressions to ensure all referenced
   * identifiers are properly destructured in the wrapper function.
   */
  collectDestructurePropsFromStyleFns(args: {
    d: StyledDecl;
    styleArgs: ExpressionKind[];
    destructureProps: string[];
  }): void {
    const { d, styleArgs, destructureProps } = args;

    // Collect jsxProp and conditionWhen props from styleFnFromProps
    for (const p of d.styleFnFromProps ?? []) {
      if (p.jsxProp && p.jsxProp !== "__props" && !destructureProps.includes(p.jsxProp)) {
        destructureProps.push(p.jsxProp);
      }
      if (p.conditionWhen) {
        this.collectConditionProps({ when: p.conditionWhen, destructureProps });
      }
    }

    // Collect identifiers from styleArgs that match explicit prop names
    if (d.propsType) {
      const explicitProps = this.getExplicitPropNames(d.propsType);
      if (explicitProps.size > 0) {
        const used = new Set<string>();
        for (const arg of styleArgs) {
          collectIdentifiers(arg, used);
        }
        for (const name of used) {
          if (explicitProps.has(name) && !destructureProps.includes(name)) {
            destructureProps.push(name);
          }
        }
      }
    }

    // Collect props that should be dropped (not forwarded to the element)
    for (const prop of d.shouldForwardProp?.dropProps ?? []) {
      if (prop && !destructureProps.includes(prop)) {
        destructureProps.push(prop);
      }
    }
  }
}
