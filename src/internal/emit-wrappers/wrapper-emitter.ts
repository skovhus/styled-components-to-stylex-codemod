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
import type { StyleMergerConfig } from "../../adapter.js";
import type { StyledDecl, VariantDimension } from "../transform-types.js";
import { emitStyleMerging } from "./style-merger.js";
import type { ExportInfo, ExpressionKind, InlineStyleProp } from "./types.js";
import { TAG_TO_HTML_ELEMENT, VOID_TAGS } from "./type-helpers.js";
import { isIdentifierNode } from "../utilities/jscodeshift-utils.js";
import type { JsxAttr, JsxTagName, StatementKind } from "./jsx-builders.js";
import * as jb from "./jsx-builders.js";
import type { LogicalExpressionOperand } from "./variant-condition.js";
import * as vc from "./variant-condition.js";
import * as seb from "./style-expr-builders.js";

export type { JsxAttr, JsxTagName, StatementKind };

type TsTypeAnnotationInput = Parameters<JSCodeshift["tsTypeAnnotation"]>[0];
type BlockStatementBody = Parameters<JSCodeshift["blockStatement"]>[0];
type AstNodeOrNull = ASTNode | null | undefined;

type WrapperEmitterArgs = {
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
    // supportsExternalStyles enables `as` prop for intrinsic-based components,
    // but NOT when wrapping another styled component (to avoid TS2590 union complexity).
    if (d.supportsExternalStyles && d.base.kind !== "component") {
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
    wrappedComponentIsInternalWrapper?: boolean;
    hasExplicitPropsType?: boolean;
  }): string {
    const {
      d,
      allowClassNameProp,
      allowStyleProp,
      wrappedComponentIsInternalWrapper,
      hasExplicitPropsType,
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
    if (shouldAddStyleProps && allowClassNameProp) {
      lines.push("className?: string");
    }
    if (shouldAddStyleProps && allowStyleProp) {
      lines.push("style?: React.CSSProperties");
    }
    const literal = lines.length > 0 ? `{ ${lines.join(", ")} }` : "{}";
    const propsTarget = d.attrsInfo?.attrsAsTag ?? (d.base as any).ident;
    const base = `React.ComponentPropsWithRef<typeof ${propsTarget}>`;
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
    /** Component reference from `.attrs({ as: Component })` — overrides the rendered tag. */
    attrsAsTag?: string;
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
      attrsAsTag,
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
    for (const name of expandedDestructureProps) {
      if (name !== "children" && name !== "style" && name !== "className") {
        const defaultVal = propDefaults?.get(name);
        if (defaultVal) {
          // Parse numeric defaults back to numbers so the literal node is
          // `= 0` (number) instead of `= "0"` (string).
          const parsedVal =
            defaultVal !== "" && !isNaN(Number(defaultVal)) ? Number(defaultVal) : defaultVal;
          patternProps.push(
            j.property.from({
              kind: "init",
              key: j.identifier(name),
              value: j.assignmentPattern(j.identifier(name), j.literal(parsedVal)),
              shorthand: true,
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

    const renderedTagName = allowAsProp ? "Component" : (attrsAsTag ?? tagName);
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

  parseVariantWhenToAst(when: string) {
    return vc.parseVariantWhenToAst(this.j, when);
  }

  collectConditionProps(args: { when: string; destructureProps?: string[] }) {
    return vc.collectConditionProps(this.j, args);
  }

  makeConditionalStyleExpr(args: {
    cond: LogicalExpressionOperand;
    expr: ExpressionKind;
    isBoolean: boolean;
  }): ExpressionKind {
    return vc.makeConditionalStyleExpr(this.j, args);
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
    params: Identifier[];
    bodyStmts: StatementKind[];
    typeParameters?: unknown;
    moveTypeParamsFromParam?: Identifier;
  }): ASTNode {
    return jb.buildWrapperFunction(this.j, args);
  }

  buildDestructurePatternProps(args: {
    baseProps: Array<Property | RestElement>;
    destructureProps: Array<string | null | undefined>;
    propDefaults?: Map<string, string>;
    includeRest?: boolean;
    restId?: Identifier;
  }): Array<Property | RestElement> {
    return jb.buildDestructurePatternProps(this.j, this.patternProp, args);
  }

  splitExtraStyleArgs(d: StyledDecl) {
    return seb.splitExtraStyleArgs(this.j, this.stylesIdentifier, d);
  }

  splitAttrsInfo(attrsInfo: StyledDecl["attrsInfo"]) {
    return seb.splitAttrsInfo(this.j, attrsInfo);
  }

  buildVariantDimensionLookups(args: {
    dimensions: VariantDimension[];
    styleArgs: ExpressionKind[];
    destructureProps?: string[];
    propDefaults?: Map<string, string>;
    namespaceBooleanProps?: string[];
  }): void {
    seb.buildVariantDimensionLookups(this.j, args);
  }

  buildStyleFnExpressions(args: {
    d: StyledDecl;
    styleArgs: ExpressionKind[];
    destructureProps?: string[];
    propExprBuilder?: (jsxProp: string) => ExpressionKind;
    propsIdentifier?: ExpressionKind;
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
