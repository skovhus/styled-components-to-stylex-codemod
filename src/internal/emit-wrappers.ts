import type {
  ASTNode,
  Collection,
  Comment,
  Identifier,
  JSCodeshift,
  JSXAttribute,
  JSXSpreadAttribute,
  Property,
  RestElement,
} from "jscodeshift";
import type { StyledDecl } from "./transform-types.js";
import type { StyleMergerConfig } from "../adapter.js";
import { createWrapperUsageHelpers } from "./emit-wrappers/usage.js";
import { insertEmittedWrappers } from "./emit-wrappers/insertion.js";
import { emitIntrinsicWrappers } from "./emit-wrappers/emit-intrinsic.js";
import { emitComponentWrappers } from "./emit-wrappers/emit-component.js";
import type { ExportInfo } from "./emit-wrappers/types.js";
import {
  TAG_TO_HTML_ELEMENT,
  VOID_TAGS,
  getAttrsAsString,
  injectRefPropIntoTypeLiteralString,
} from "./emit-wrappers/type-helpers.js";
import { emitStyleMerging } from "./emit-wrappers/style-merger.js";

export function emitWrappers(args: {
  root: Collection<ASTNode>;
  j: JSCodeshift;
  filePath: string;
  styledDecls: StyledDecl[];
  wrapperNames: Set<string>;
  patternProp: (keyName: string, valueId?: ASTNode) => Property;
  exportedComponents: Map<string, ExportInfo>;
  stylesIdentifier: string;
  styleMerger: StyleMergerConfig | null;
}): void {
  return emitWrappersImpl(args);
}

// (VOID_TAGS, TAG_TO_HTML_ELEMENT, getAttrsAsString, injectRefPropIntoTypeLiteralString moved to `emit-wrappers/type-helpers`)

const isBugNarrativeComment = (c: Comment | undefined): boolean => {
  if (!c) {
    return false;
  }
  const v = typeof c?.value === "string" ? String(c.value).trim() : "";
  return /^Bug\s+\d+[a-zA-Z]?\s*:/.test(v);
};

// Check if a comment looks like a section header (e.g., "Pattern 1:", "Case 2:", etc.)
const isSectionHeaderComment = (c: Comment | undefined): boolean => {
  if (!c) {
    return false;
  }
  const v = typeof c?.value === "string" ? String(c.value).trim() : "";
  return /^(Pattern|Case|Example|Test|Step|Note)\s*\d*[a-zA-Z]?\s*:/.test(v);
};

const getWrapperLeadingComments = (d: StyledDecl): Comment[] | null => {
  const cs = (d as { leadingComments?: Comment[] }).leadingComments;
  if (!Array.isArray(cs) || cs.length === 0) {
    return null;
  }

  // Find the Bug N: comment index
  let bugIdx = -1;
  for (let i = 0; i < cs.length; i++) {
    if (isBugNarrativeComment(cs[i])) {
      bugIdx = i;
      break;
    }
  }

  if (bugIdx < 0) {
    // No Bug comment, return all comments
    return cs;
  }

  // For "Bug N:" narrative comment runs we treat those as file-level (migrated near `const styles`)
  // and avoid attaching any part of that narrative onto wrapper functions (to prevent duplication).
  //
  // However, if there are additional comments *after a gap* (blank line) following the Bug narrative,
  // those are typically local section headers (e.g. "Pattern 1: ...") and are safe to attach.
  // We only attach them if the first post-gap comment is a recognized section header.
  let lastLine = cs[bugIdx]?.loc?.end?.line ?? cs[bugIdx]?.loc?.start?.line ?? -1;
  let i = bugIdx + 1;
  // Skip the contiguous Bug narrative block (no blank line gaps).
  for (; i < cs.length; i++) {
    const c = cs[i];
    const startLine = c?.loc?.start?.line ?? -1;
    if (lastLine >= 0 && startLine >= 0 && startLine > lastLine + 1) {
      break;
    }
    lastLine = c?.loc?.end?.line ?? startLine;
  }
  if (i >= cs.length) {
    return null;
  }

  // Only attach post-gap comments if the first one is a section header.
  // This prevents attaching general explanatory text (like "When these are exported...")
  // to wrapper functions.
  if (!isSectionHeaderComment(cs[i])) {
    return null;
  }

  // Collect the next contiguous comment block (until the next gap).
  const result: Comment[] = [];
  lastLine = cs[i]?.loc?.end?.line ?? cs[i]?.loc?.start?.line ?? -1;
  for (; i < cs.length; i++) {
    const c = cs[i];
    const startLine = c?.loc?.start?.line ?? -1;
    if (result.length > 0 && lastLine >= 0 && startLine >= 0 && startLine > lastLine + 1) {
      break;
    }
    if (c) {
      result.push(c);
    }
    lastLine = c?.loc?.end?.line ?? startLine;
  }

  return result.length > 0 ? result : null;
};

const withLeadingComments = (node: ASTNode, d: StyledDecl): ASTNode => {
  const cs = getWrapperLeadingComments(d);
  if (!cs) {
    return node;
  }
  const normalized = cs.map((c) => ({ ...c, leading: true, trailing: false }));

  // Merge (don't overwrite) to avoid clobbering comments that are already correctly attached by
  // the parser/printer, and dedupe to prevent double-printing.
  const commentable = node as CommentableNode;
  const existingLeading = Array.isArray(commentable.leadingComments)
    ? commentable.leadingComments
    : [];
  const existingComments = Array.isArray(commentable.comments) ? commentable.comments : [];
  const merged = [...existingLeading, ...existingComments, ...normalized] as Comment[];
  const seen = new Set<string>();
  const deduped = merged.filter((c) => {
    const key = `${(c as { type?: string })?.type ?? "Comment"}:${String(
      (c as { value?: string })?.value ?? "",
    ).trim()}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });

  commentable.leadingComments = deduped;
  commentable.comments = deduped;
  return node;
};

const withLeadingCommentsOnFirstFunction = (nodes: ASTNode[], d: StyledDecl): ASTNode[] => {
  let done = false;
  return nodes.map((n) => {
    if (done) {
      return n;
    }
    if (n?.type === "FunctionDeclaration") {
      done = true;
      return withLeadingComments(n, d);
    }
    return n;
  });
};

/**
 * Generates a minimal wrapper component that only destructures the necessary props
 * and applies stylex.props() directly without className/style/rest merging.
 * Uses props.children directly instead of destructuring it.
 */
type ExpressionKind = Parameters<JSCodeshift["expressionStatement"]>[0];
type InlineStyleProp = { prop: string; expr: ExpressionKind };
type TsTypeAnnotationInput = Parameters<JSCodeshift["tsTypeAnnotation"]>[0];
type BlockStatementBody = Parameters<JSCodeshift["blockStatement"]>[0];
type CommentableNode = ASTNode & { leadingComments?: Comment[]; comments?: Comment[] };
type LogicalExpressionOperand = Parameters<JSCodeshift["logicalExpression"]>[1];
type AstNodeOrNull = ASTNode | null | undefined;

function emitMinimalWrapper(args: {
  j: JSCodeshift;
  localName: string;
  tagName: string;
  propsTypeName?: string;
  inlineTypeText?: string;
  emitTypes?: boolean;
  styleArgs: ExpressionKind[];
  destructureProps: string[];
  allowClassNameProp?: boolean;
  allowStyleProp?: boolean;
  includeRest?: boolean;
  displayName?: string;
  patternProp: (keyName: string, valueId?: ASTNode) => Property;
  defaultAttrs?: Array<{ jsxProp: string; attrName: string; value: unknown }>;
  conditionalAttrs?: Array<{ jsxProp: string; attrName: string; value: unknown }>;
  invertedBoolAttrs?: Array<{ jsxProp: string; attrName: string }>;
  staticAttrs?: Record<string, unknown>;
  inlineStyleProps?: InlineStyleProp[];
  styleMerger: StyleMergerConfig | null;
}): ASTNode[] {
  const {
    j,
    localName,
    tagName,
    propsTypeName,
    inlineTypeText,
    emitTypes = false,
    styleArgs,
    destructureProps,
    allowClassNameProp = false,
    allowStyleProp = false,
    includeRest = true,
    patternProp,
    defaultAttrs = [],
    conditionalAttrs = [],
    invertedBoolAttrs = [],
    staticAttrs = {},
    inlineStyleProps = [],
    styleMerger,
  } = args;
  const expandedDestructureProps = new Set(destructureProps.filter(Boolean));
  const collectCondIdentifiers = (node: ASTNode | null | undefined): void => {
    if (!node) {
      return;
    }
    if (node.type === "Identifier") {
      expandedDestructureProps.add(node.name);
      return;
    }
    if (
      node.type === "MemberExpression" &&
      !node.computed &&
      node.object.type === "Identifier" &&
      node.object.name === "props" &&
      node.property.type === "Identifier"
    ) {
      expandedDestructureProps.add(node.property.name);
      return;
    }
    if ("left" in node && node.left) {
      collectCondIdentifiers(node.left as ASTNode);
    }
    if ("right" in node && node.right) {
      collectCondIdentifiers(node.right as ASTNode);
    }
    if ("argument" in node && node.argument) {
      collectCondIdentifiers(node.argument as ASTNode);
    }
    if ("test" in node && node.test) {
      collectCondIdentifiers(node.test as ASTNode);
    }
    if ("consequent" in node && node.consequent) {
      collectCondIdentifiers(node.consequent as ASTNode);
    }
    if ("alternate" in node && node.alternate) {
      collectCondIdentifiers(node.alternate as ASTNode);
    }
  };
  for (const arg of styleArgs) {
    if (arg?.type === "LogicalExpression" && arg.operator === "&&") {
      collectCondIdentifiers(arg.left as ASTNode);
    }
  }
  const isVoidTag = VOID_TAGS.has(tagName);
  const propsParamId = j.identifier("props");
  if (emitTypes) {
    if (inlineTypeText) {
      // Use inline type text when the type alias was not emitted (e.g., to avoid shadowing)
      let typeNode: TsTypeAnnotationInput | null = null;
      try {
        typeNode = j(`const x: ${inlineTypeText} = null`).get().node.program.body[0].declarations[0]
          .id.typeAnnotation.typeAnnotation;
      } catch (e) {
        throw new Error(
          [
            `Failed to parse inline wrapper props type for ${localName} (${tagName}).`,
            `Inline type: ${inlineTypeText}`,
            `Error: ${(e as any)?.message ?? String(e)}`,
          ].join("\n"),
        );
      }
      if (!typeNode) {
        throw new Error(`Failed to parse inline wrapper props type for ${localName} (${tagName}).`);
      }
      (propsParamId as any).typeAnnotation = j.tsTypeAnnotation(typeNode);
    } else {
      if (!propsTypeName) {
        throw new Error(`Missing propsTypeName for ${localName} (${tagName}).`);
      }
      (propsParamId as any).typeAnnotation = j.tsTypeAnnotation(
        j.tsTypeReference(j.identifier(propsTypeName)),
      );
    }
  }
  const propsId = j.identifier("props");

  // Build destructure pattern: { children, style, ...dynamicProps, ...rest }
  // We destructure children, optional className/style, and any dynamic props, and spread the rest.
  const patternProps: Array<Property | RestElement> = [];

  // Always destructure children (for non-void tags)
  if (!isVoidTag) {
    patternProps.push(patternProp("children"));
  }

  if (allowClassNameProp) {
    patternProps.push(patternProp("className"));
  }

  if (allowStyleProp) {
    // Only destructure `style` when we intend to support external style overrides.
    patternProps.push(patternProp("style"));
  }

  // Add dynamic props (for variant conditions)
  for (const name of expandedDestructureProps) {
    if (name !== "children" && name !== "style" && name !== "className") {
      patternProps.push(patternProp(name));
    }
  }

  // Add rest spread to capture all other props (only when needed)
  let restId: Identifier | null = includeRest ? j.identifier("rest") : null;
  if (includeRest && restId) {
    patternProps.push(j.restElement(restId));
  }
  const usePropsDirectlyForRest =
    includeRest && patternProps.length === 1 && patternProps[0]?.type === "RestElement";
  if (usePropsDirectlyForRest) {
    restId = propsId;
  }

  // Use the style merger helper to generate the appropriate merging pattern
  const classNameId = j.identifier("className");
  const styleId = j.identifier("style");
  const merging = emitStyleMerging({
    j,
    styleMerger,
    styleArgs,
    classNameId,
    styleId,
    allowClassNameProp,
    allowStyleProp,
    inlineStyleProps,
  });

  // Build JSX attributes: static attrs, {...rest}, {...sx|stylex.props(...)}, optional className/style
  const jsxAttrs: Array<JSXAttribute | JSXSpreadAttribute> = [];

  // Add default attrs (e.g. `tabIndex: props.tabIndex ?? 0`)
  for (const a of defaultAttrs) {
    const propExpr = j.memberExpression(propsId, j.identifier(a.jsxProp));
    const fallback =
      typeof a.value === "string"
        ? j.literal(a.value)
        : typeof a.value === "number"
          ? j.literal(a.value)
          : typeof a.value === "boolean"
            ? j.booleanLiteral(a.value)
            : j.literal(String(a.value));
    jsxAttrs.push(
      j.jsxAttribute(
        j.jsxIdentifier(a.attrName),
        j.jsxExpressionContainer(j.logicalExpression("??", propExpr, fallback)),
      ),
    );
  }

  // Add conditional attrs (e.g. `size: props.$small ? 5 : undefined`) derived from props.
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

  // Add inverted boolean attrs (e.g. `"data-1p-ignore": props.allowPMAutofill !== true`).
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

  // Add static attrs from .attrs() (e.g., type="range")
  for (const [key, value] of Object.entries(staticAttrs)) {
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

  // If we had to destructure an intrinsic prop to use it for conditional styling (variants),
  // ensure we still forward it to the DOM element.
  // (Example: `disabled` on <button> is a real DOM attribute and must not be swallowed.)
  if (tagName === "button" && destructureProps.includes("disabled")) {
    jsxAttrs.push(
      j.jsxAttribute(
        j.jsxIdentifier("disabled"),
        j.jsxExpressionContainer(j.identifier("disabled")),
      ),
    );
  }

  // Add the style merging spread and optional className/style attributes
  jsxAttrs.push(j.jsxSpreadAttribute(merging.jsxSpreadExpr));

  if (merging.classNameAttr) {
    jsxAttrs.push(
      j.jsxAttribute(j.jsxIdentifier("className"), j.jsxExpressionContainer(merging.classNameAttr)),
    );
  }

  if (merging.styleAttr) {
    jsxAttrs.push(
      j.jsxAttribute(j.jsxIdentifier("style"), j.jsxExpressionContainer(merging.styleAttr)),
    );
  }

  const openingEl = j.jsxOpeningElement(j.jsxIdentifier(tagName), jsxAttrs, isVoidTag);

  const jsx = j.jsxElement(
    openingEl,
    isVoidTag ? null : j.jsxClosingElement(j.jsxIdentifier(tagName)),
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

  const result: ASTNode[] = [
    j.functionDeclaration(j.identifier(localName), [propsParamId], j.blockStatement(bodyStmts)),
  ];

  return result;
}

function parseVariantWhenToAst(
  j: JSCodeshift,
  when: string,
): { cond: LogicalExpressionOperand; props: string[] } {
  const trimmed = String(when ?? "").trim();
  if (!trimmed) {
    return { cond: j.identifier("true"), props: [] };
  }

  // Support simple conjunctions produced by lower-rules (compound variants):
  //   `disabled && color === "primary"`
  //   `disabled && !(color === "primary")`
  if (trimmed.includes("&&")) {
    const parts = trimmed
      .split("&&")
      .map((s) => s.trim())
      .filter(Boolean);
    const parsed = parts.map((p) => parseVariantWhenToAst(j, p));
    const cond = parsed
      .slice(1)
      .reduce((acc, cur) => j.logicalExpression("&&", acc, cur.cond), parsed[0]!.cond);
    const props = [...new Set(parsed.flatMap((x) => x.props))];
    return { cond, props };
  }

  if (trimmed.startsWith("!(") && trimmed.endsWith(")")) {
    const inner = trimmed.slice(2, -1).trim();
    const innerParsed = parseVariantWhenToAst(j, inner);
    return { cond: j.unaryExpression("!", innerParsed.cond), props: innerParsed.props };
  }
  if (trimmed.startsWith("!")) {
    const inner = trimmed.slice(1).trim();
    const innerParsed = parseVariantWhenToAst(j, inner);
    return { cond: j.unaryExpression("!", innerParsed.cond), props: innerParsed.props };
  }

  if (trimmed.includes("===") || trimmed.includes("!==")) {
    const op = trimmed.includes("!==") ? "!==" : "===";
    const [lhs, rhsRaw0] = trimmed.split(op).map((s) => s.trim());
    const rhsRaw = rhsRaw0 ?? "";
    const rhs =
      rhsRaw?.startsWith('"') || rhsRaw?.startsWith("'")
        ? j.literal(JSON.parse(rhsRaw.replace(/^'/, '"').replace(/'$/, '"')))
        : /^-?\d+(\.\d+)?$/.test(rhsRaw)
          ? j.literal(Number(rhsRaw))
          : j.identifier(rhsRaw);
    const propName = lhs ?? "";
    return {
      cond: j.binaryExpression(op, j.identifier(propName), rhs),
      props: propName ? [propName] : [],
    };
  }

  return { cond: j.identifier(trimmed), props: [trimmed] };
}

function emitWrappersImpl(args: {
  root: Collection<ASTNode>;
  j: JSCodeshift;
  filePath: string;
  styledDecls: StyledDecl[];
  wrapperNames: Set<string>;
  patternProp: (keyName: string, valueId?: ASTNode) => Property;
  exportedComponents: Map<string, ExportInfo>;
  stylesIdentifier: string;
  styleMerger: StyleMergerConfig | null;
}): void {
  const {
    root,
    j,
    filePath,
    styledDecls,
    wrapperNames,
    patternProp,
    exportedComponents,
    stylesIdentifier,
    styleMerger,
  } = args;

  // For plain JS/JSX and Flow transforms, skip emitting TS syntax entirely for now.
  const emitTypes = filePath.endsWith(".ts") || filePath.endsWith(".tsx");

  const wrapperDecls = styledDecls.filter((d) => d.needsWrapperComponent);
  if (wrapperDecls.length === 0) {
    return;
  }

  const {
    getUsedAttrs,
    getJsxCallsites,
    hasJsxChildrenUsage,
    isUsedAsValueInFile,
    shouldAllowClassNameProp,
    shouldAllowStyleProp,
  } = createWrapperUsageHelpers({ root, j });

  const emitted: ASTNode[] = [];
  let needsReactTypeImport = false;

  const propsTypeNameFor = (localName: string): string => `${localName}Props`;

  const stringifyTsTypeName = (n: AstNodeOrNull): string | null => {
    if (!n) {
      return null;
    }
    if (n.type === "Identifier") {
      return n.name ?? null;
    }
    if (n.type === "TSQualifiedName") {
      const left = stringifyTsTypeName(n.left);
      const right = stringifyTsTypeName(n.right);
      return left && right ? `${left}.${right}` : null;
    }
    return null;
  };

  const stringifyTsType = (t: AstNodeOrNull): string | null => {
    if (!t) {
      return null;
    }
    if (t.type === "TSTypeReference") {
      const base = stringifyTsTypeName(t.typeName);
      if (!base) {
        return null;
      }
      const params = t.typeParameters?.params;
      if (Array.isArray(params) && params.length > 0) {
        const inner = params.map(stringifyTsType).filter(Boolean) as string[];
        if (inner.length === params.length) {
          return `${base}<${inner.join(", ")}>`;
        }
      }
      return base;
    }
    if (t.type === "TSTypeLiteral") {
      const members = Array.isArray(t.members) ? t.members : [];
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
        const val = stringifyTsType(ann) ?? "any";
        const opt = m.optional ? "?" : "";
        lines.push(`  ${key}${opt}: ${val};`);
      }
      if (lines.length === 0) {
        return "{}";
      }
      return `{\n${lines.join("\n")}\n}`;
    }
    if (t.type === "TSUnionType") {
      const parts = (t.types ?? []).map(stringifyTsType).filter(Boolean) as string[];
      return parts.length === (t.types ?? []).length ? parts.join(" | ") : null;
    }
    if (t.type === "TSIntersectionType") {
      const parts = (t.types ?? []).map(stringifyTsType).filter(Boolean) as string[];
      return parts.length === (t.types ?? []).length ? parts.join(" & ") : null;
    }
    if (t.type === "TSLiteralType") {
      const lit = t.literal;
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
      const obj = stringifyTsType(t.objectType);
      const idx = stringifyTsType(t.indexType);
      return obj && idx ? `${obj}[${idx}]` : null;
    }
    if (t.type === "TSKeyofType") {
      const ref = stringifyTsType(t.typeAnnotation);
      return ref ? `keyof ${ref}` : null;
    }
    if (t.type === "TSTypeOperator" && t.operator === "keyof") {
      const ref = stringifyTsType(t.typeAnnotation);
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
    return null;
  };

  // Check if a type/interface with the given name already exists in the file
  const typeExistsInFile = (typeName: string): boolean => {
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
  };

  /**
   * Extends an existing interface with a base type.
   * Returns true if the interface was found and extended, false otherwise.
   */
  const extendExistingInterface = (typeName: string, baseTypeText: string): boolean => {
    if (!emitTypes) {
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
  };

  /**
   * Extends an existing type alias with a base type via intersection.
   * Converts `type Foo = { ... }` to `type Foo = BaseType & { ... }`.
   * Returns true if the type alias was found and extended, false otherwise.
   */
  const extendExistingTypeAlias = (typeName: string, baseTypeText: string): boolean => {
    if (!emitTypes) {
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
  };

  /**
   * Emits a named props type alias and returns whether it was emitted.
   * Returns false if the type would shadow an existing type with the same name.
   * @param localName - The component name (e.g., "Button")
   * @param typeExprText - The type expression (e.g., "React.ComponentProps<C> & { as?: C }")
   * @param genericParams - Optional generic type parameters (e.g., "C extends React.ElementType = \"span\"")
   */
  const emitNamedPropsType = (
    localName: string,
    typeExprText: string,
    genericParams?: string,
  ): boolean => {
    if (!emitTypes) {
      return false;
    }
    const typeName = propsTypeNameFor(localName);
    // Skip if a type/interface with this name already exists in the file
    if (typeExistsInFile(typeName)) {
      return false;
    }
    // Skip if the type expression is the same as the type name, or if it
    // contains a reference to the type name (which would create shadowing issues
    // if an interface/type with the same name already exists in the file).
    // Match word boundaries to avoid false positives like "ButtonPropsExtra".
    const typeNamePattern = new RegExp(`\\b${typeName}\\b`);
    if (typeExprText.trim() === typeName || typeNamePattern.test(typeExprText)) {
      return false;
    }
    const typeNameWithParams = genericParams ? `${typeName}<${genericParams}>` : typeName;
    let stmt: ASTNode;
    try {
      stmt = j(`${`type ${typeNameWithParams} = ${typeExprText};`}`).get().node.program.body[0];
    } catch (e) {
      throw new Error(
        [
          `Failed to parse emitted props type for ${localName} (${filePath}).`,
          `Type name: ${typeNameWithParams}`,
          `Type expr: ${typeExprText}`,
          `Error: ${(e as any)?.message ?? String(e)}`,
        ].join("\n"),
      );
    }
    emitted.push(stmt);
    return true;
  };

  /**
   * Annotates a props parameter with a type. If inlineTypeText is provided,
   * uses that as an inline type annotation instead of the generated type name.
   */
  const annotatePropsParam = (
    propsId: Identifier,
    localName: string,
    inlineTypeText?: string,
  ): void => {
    if (!emitTypes) {
      return;
    }
    if (inlineTypeText) {
      // Parse and use inline type
      let typeNode: TsTypeAnnotationInput | null = null;
      try {
        typeNode = j(`const x: ${inlineTypeText} = null`).get().node.program.body[0].declarations[0]
          .id.typeAnnotation.typeAnnotation;
      } catch (e) {
        throw new Error(
          [
            `Failed to parse inline props param type for ${localName} (${filePath}).`,
            `Inline type: ${inlineTypeText}`,
            `Error: ${(e as any)?.message ?? String(e)}`,
          ].join("\n"),
        );
      }
      if (!typeNode) {
        throw new Error(`Failed to parse inline props param type for ${localName} (${filePath}).`);
      }
      (propsId as any).typeAnnotation = j.tsTypeAnnotation(typeNode);
    } else {
      (propsId as any).typeAnnotation = j.tsTypeAnnotation(
        j.tsTypeReference(j.identifier(propsTypeNameFor(localName))),
      );
    }
  };

  const withChildren = (innerTypeText: string): string => {
    const t = innerTypeText.trim();
    if (t.startsWith("React.PropsWithChildren<")) {
      return t;
    }
    // `React.ComponentProps*<...>` already includes `children`, so wrapping it is redundant.
    // Keep the type as-is to avoid noisy `PropsWithChildren<...>` wrappers.
    if (
      t.startsWith("React.ComponentProps<") ||
      t.startsWith("React.ComponentPropsWithoutRef<") ||
      t.startsWith("React.HTMLAttributes<") ||
      t.startsWith("React.AnchorHTMLAttributes<") ||
      t.startsWith("React.ButtonHTMLAttributes<") ||
      t.startsWith("React.InputHTMLAttributes<") ||
      t.startsWith("React.ImgHTMLAttributes<") ||
      t.startsWith("React.LabelHTMLAttributes<") ||
      t.startsWith("React.SelectHTMLAttributes<") ||
      t.startsWith("React.TextareaHTMLAttributes<") ||
      // Derived-from-ComponentProps cases (common in our output): Omit/Pick/Partial/etc.
      /^(Omit|Pick|Partial|Required|Readonly|ReadonlyArray|NonNullable|Extract|Exclude)<\s*React\.ComponentProps(?:WithoutRef)?</.test(
        t,
      ) ||
      // Derived-from-HTMLAttributes cases (common when we omit className/style)
      /^(Omit|Pick|Partial|Required|Readonly|ReadonlyArray|NonNullable|Extract|Exclude)<\s*React\..*HTMLAttributes</.test(
        t,
      )
    ) {
      return t;
    }
    return `React.PropsWithChildren<${t}>`;
  };

  const joinIntersection = (...parts: Array<string | null | undefined>): string => {
    const xs = parts
      .map((p) => (p ?? "").trim())
      .filter(Boolean)
      // In our emitted types, `{}` is used as the "no extra props" base.
      // Intersecting with `{}` is redundant and just adds noise.
      .filter((p) => p !== "{}");
    if (xs.length === 0) {
      return "{}";
    }
    if (xs.length === 1) {
      return xs[0]!;
    }
    return xs.join(" & ");
  };

  const isValidTypeKeyIdentifier = (name: string): boolean => /^[$A-Z_][0-9A-Z_$]*$/i.test(name);
  const toTypeKey = (name: string): string =>
    isValidTypeKeyIdentifier(name) ? name : JSON.stringify(name);

  const reactIntrinsicAttrsType = (tagName: string): string => {
    // Prefer attribute types over React.ComponentProps to keep types restrictive-by-default.
    // NOTE: these are still “broad”, so we only use them when we have to (spreads / used-as-value).
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
        // Good enough for div/span/etc.
        return "React.HTMLAttributes<HTMLElement>";
    }
  };

  // Helper to extract prop names from a propsType AST node (TSTypeLiteral, TSIntersectionType, etc.)
  const getExplicitPropNames = (propsType: AstNodeOrNull): Set<string> => {
    const names = new Set<string>();

    const extractFromLiteral = (literal: AstNodeOrNull): void => {
      if (!literal || literal.type !== "TSTypeLiteral") {
        return;
      }
      for (const member of literal.members ?? []) {
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
        for (const t of type.types ?? []) {
          extractFromType(t);
        }
      } else if (type.type === "TSTypeReference" && type.typeName?.type === "Identifier") {
        // Look up the interface or type alias
        const typeName = type.typeName.name;
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
        // Also check type aliases
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
  };

  const inferredIntrinsicPropsTypeText = (args: {
    d: StyledDecl;
    tagName: string;
    allowClassNameProp: boolean;
    allowStyleProp: boolean;
    includeAsProp?: boolean;
    skipProps?: Set<string>;
  }): string => {
    const {
      d,
      tagName,
      allowClassNameProp,
      allowStyleProp,
      includeAsProp = false,
      skipProps,
    } = args;
    const used = getUsedAttrs(d.localName);

    // If we have spreads, or the component is used as a value, we must accept a broader set
    // of attributes (otherwise spreads/React.ComponentType<...> constraints break).
    const needsBroadAttrs = used.has("*") || !!(d as any).usedAsValue;

    const lines: string[] = [];
    if (includeAsProp) {
      lines.push(`  as?: React.ElementType;`);
    }
    // When we are NOT using a broad React.*HTMLAttributes base, explicitly include the
    // wrapper-supported `className`/`style` keys in the literal to keep the type compact.
    if (!needsBroadAttrs) {
      if (allowClassNameProp) {
        lines.push(`  className?: string;`);
      }
      if (allowStyleProp) {
        lines.push(`  style?: React.CSSProperties;`);
      }
    }

    for (const attr of [...used].sort((a, b) => a.localeCompare(b))) {
      if (attr === "*" || attr === "children") {
        continue;
      }
      if (attr === "as" || attr === "forwardedAs") {
        continue;
      }
      if (attr === "className" || attr === "style") {
        // handled via allow* above
        continue;
      }
      // Skip props that are already defined in the explicit type
      if (skipProps?.has(attr)) {
        continue;
      }
      lines.push(`  ${toTypeKey(attr)}?: any;`);
    }

    const literal = lines.length > 0 ? `{\n${lines.join("\n")}\n}` : "{}";

    if (!needsBroadAttrs) {
      // For void tags (input, img, etc.), use the full HTML attributes type
      // to ensure all valid HTML attributes are accepted (not just the ones used in the file).
      // This allows exported components like styled("input") to accept any valid HTML input attribute.
      if (VOID_TAGS.has(tagName)) {
        const base = reactIntrinsicAttrsType(tagName);
        // Keep className/style restrictive based on actual usage.
        const omitted: string[] = [];
        if (!allowClassNameProp) {
          omitted.push('"className"');
        }
        if (!allowStyleProp) {
          omitted.push('"style"');
        }
        return omitted.length ? `Omit<${base}, ${omitted.join(" | ")}>` : base;
      }
      return withChildren(literal);
    }

    const base = reactIntrinsicAttrsType(tagName);
    // Keep className/style restrictive even when using broad attrs.
    const omitted: string[] = [];
    if (!allowClassNameProp) {
      omitted.push('"className"');
    }
    if (!allowStyleProp) {
      omitted.push('"style"');
    }
    const baseMaybeOmitted = omitted.length ? `Omit<${base}, ${omitted.join(" | ")}>` : base;
    const composed = joinIntersection(baseMaybeOmitted, literal);
    return VOID_TAGS.has(tagName) ? composed : withChildren(composed);
  };

  const inferredComponentWrapperPropsTypeText = (args: {
    d: StyledDecl;
    allowClassNameProp: boolean;
    allowStyleProp: boolean;
    includeAsProp?: boolean;
    skipProps?: Set<string>;
  }): string => {
    const { d, allowClassNameProp, allowStyleProp, includeAsProp = false } = args;

    // For styled(Component) wrappers, we use React.ComponentProps<typeof Component>
    // which already includes all the component's props. Don't add extra `prop?: any`
    // entries that would override the actual types from the wrapped component.
    const lines: string[] = [];
    if (includeAsProp) {
      lines.push(`  as?: React.ElementType;`);
    }

    const literal = lines.length > 0 ? `{\n${lines.join("\n")}\n}` : "{}";
    const base = `React.ComponentProps<typeof ${(d.base as any).ident}>`;
    const omitted: string[] = [];
    // Note: We do NOT omit "children" here because React.ComponentProps<typeof Component>
    // already includes children from the wrapped component's props. If the wrapped component
    // accepts children, the wrapper should too.
    if (!allowClassNameProp) {
      omitted.push('"className"');
    }
    if (!allowStyleProp) {
      omitted.push('"style"');
    }
    const baseMaybeOmitted = omitted.length ? `Omit<${base}, ${omitted.join(" | ")}>` : base;
    return literal !== "{}" ? joinIntersection(baseMaybeOmitted, literal) : baseMaybeOmitted;
  };

  const isPropRequiredInPropsTypeLiteral = (propsType: any, propName: string): boolean => {
    // Helper to check if a prop is required in a TSTypeLiteral
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

    // Helper to check if a prop is required in an interface body
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

    // Check if propsType is a TSTypeLiteral
    if (propsType?.type === "TSTypeLiteral") {
      const result = checkInLiteral(propsType);
      return result === true;
    }

    // Check if propsType is a TSTypeReference to an interface/type alias
    if (propsType?.type === "TSTypeReference" && propsType.typeName?.type === "Identifier") {
      const typeName = propsType.typeName.name;

      // Look up the interface
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

      // Look up the type alias
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
  };

  {
    const out = emitIntrinsicWrappers({
      root,
      j,
      emitTypes,
      wrapperDecls,
      wrapperNames,
      stylesIdentifier,
      getUsedAttrs,
      getJsxCallsites,
      isUsedAsValueInFile,
      shouldAllowClassNameProp,
      shouldAllowStyleProp,
      stringifyTsType,
      emitNamedPropsType,
      withChildren,
      joinIntersection,
      parseVariantWhenToAst,
      annotatePropsParam,
      propsTypeNameFor,
      inferredIntrinsicPropsTypeText,
      inferredComponentWrapperPropsTypeText,
      typeExistsInFile,
      extendExistingInterface,
      extendExistingTypeAlias,
      getExplicitPropNames,
      isPropRequiredInPropsTypeLiteral,
      reactIntrinsicAttrsType,
      VOID_TAGS,
      patternProp,
      withLeadingComments,
      emitMinimalWrapper,
      withLeadingCommentsOnFirstFunction,
      styleMerger,
    });
    emitted.push(...out.emitted);
    if (out.needsReactTypeImport) {
      needsReactTypeImport = true;
    }
  }

  // (moved into `emit-wrappers/emit-intrinsic.ts`)

  // Component wrappers (styled(Component)) - these wrap another component
  {
    const out = emitComponentWrappers({
      root,
      j,
      emitTypes,
      wrapperDecls,
      wrapperNames,
      stylesIdentifier,
      shouldAllowClassNameProp,
      shouldAllowStyleProp,
      stringifyTsType,
      typeExistsInFile,
      extendExistingInterface,
      extendExistingTypeAlias,
      getExplicitPropNames,
      inferredComponentWrapperPropsTypeText,
      getAttrsAsString,
      TAG_TO_HTML_ELEMENT,
      injectRefPropIntoTypeLiteralString,
      joinIntersection,
      emitNamedPropsType,
      parseVariantWhenToAst,
      isPropRequiredInPropsTypeLiteral,
      hasJsxChildrenUsage,
      annotatePropsParam,
      patternProp,
      propsTypeNameFor,
      styleMerger,
    });
    emitted.push(...out.emitted);
    if (out.needsReactTypeImport) {
      needsReactTypeImport = true;
    }
  }

  insertEmittedWrappers({
    root,
    j,
    emitted,
    wrapperDecls,
    exportedComponents,
    emitTypes,
    needsReactTypeImport,
  });
}
