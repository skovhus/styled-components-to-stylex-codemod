import type { Collection } from "jscodeshift";
import type { StyledDecl } from "./transform-types.js";

// Void HTML tags that don't have children
const VOID_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

// Mapping from HTML tag names to their corresponding HTMLElement types
// Used to generate correct ref types for .attrs({ as: "tag" }) patterns
const TAG_TO_HTML_ELEMENT: Record<string, string> = {
  a: "HTMLAnchorElement",
  button: "HTMLButtonElement",
  div: "HTMLDivElement",
  form: "HTMLFormElement",
  h1: "HTMLHeadingElement",
  h2: "HTMLHeadingElement",
  h3: "HTMLHeadingElement",
  h4: "HTMLHeadingElement",
  h5: "HTMLHeadingElement",
  h6: "HTMLHeadingElement",
  img: "HTMLImageElement",
  input: "HTMLInputElement",
  label: "HTMLLabelElement",
  li: "HTMLLIElement",
  nav: "HTMLElement",
  ol: "HTMLOListElement",
  p: "HTMLParagraphElement",
  section: "HTMLElement",
  select: "HTMLSelectElement",
  span: "HTMLSpanElement",
  table: "HTMLTableElement",
  textarea: "HTMLTextAreaElement",
  ul: "HTMLUListElement",
};

const isBugNarrativeComment = (c: any): boolean => {
  const v = typeof c?.value === "string" ? String(c.value).trim() : "";
  return /^Bug\s+\d+[a-zA-Z]?\s*:/.test(v);
};

// Check if a comment looks like a section header (e.g., "Pattern 1:", "Case 2:", etc.)
const isSectionHeaderComment = (c: any): boolean => {
  const v = typeof c?.value === "string" ? String(c.value).trim() : "";
  return /^(Pattern|Case|Example|Test|Step|Note)\s*\d*[a-zA-Z]?\s*:/.test(v);
};

const getWrapperLeadingComments = (d: StyledDecl): any[] | null => {
  const cs = (d as any).leadingComments;
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
  const result: any[] = [];
  lastLine = cs[i]?.loc?.end?.line ?? cs[i]?.loc?.start?.line ?? -1;
  for (; i < cs.length; i++) {
    const c = cs[i];
    const startLine = c?.loc?.start?.line ?? -1;
    if (result.length > 0 && lastLine >= 0 && startLine >= 0 && startLine > lastLine + 1) {
      break;
    }
    result.push(c);
    lastLine = c?.loc?.end?.line ?? startLine;
  }

  return result.length > 0 ? result : null;
};

const withLeadingComments = (node: any, d: StyledDecl): any => {
  const cs = getWrapperLeadingComments(d);
  if (!cs) {
    return node;
  }
  const normalized = cs.map((c: any) => ({ ...c, leading: true, trailing: false }));

  // Merge (don't overwrite) to avoid clobbering comments that are already correctly attached by
  // the parser/printer, and dedupe to prevent double-printing.
  const existingLeading = Array.isArray(node.leadingComments) ? node.leadingComments : [];
  const existingComments = Array.isArray(node.comments) ? node.comments : [];
  const merged = [...existingLeading, ...existingComments, ...normalized] as any[];
  const seen = new Set<string>();
  const deduped = merged.filter((c: any) => {
    const key = `${c?.type ?? "Comment"}:${String(c?.value ?? "").trim()}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });

  node.leadingComments = deduped;
  node.comments = deduped;
  return node;
};

const withLeadingCommentsOnFirstFunction = (nodes: any[], d: StyledDecl): any[] => {
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
function emitMinimalWrapper(args: {
  j: any;
  localName: string;
  tagName: string;
  propsTypeName?: string;
  inlineTypeText?: string;
  emitTypes?: boolean;
  styleArgs: any[];
  destructureProps: string[];
  allowClassNameProp?: boolean;
  allowStyleProp?: boolean;
  includeRest?: boolean;
  displayName?: string;
  patternProp: (keyName: string, valueId?: any) => any;
  defaultAttrs?: Array<{ jsxProp: string; attrName: string; value: any }>;
  conditionalAttrs?: Array<{ jsxProp: string; attrName: string; value: any }>;
  invertedBoolAttrs?: Array<{ jsxProp: string; attrName: string }>;
  staticAttrs?: Record<string, any>;
  inlineStyleProps?: Array<{ prop: string; expr: any }>;
}): any[] {
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
  } = args;
  const isVoidTag = VOID_TAGS.has(tagName);
  const propsParamId = j.identifier("props");
  if (emitTypes) {
    if (inlineTypeText) {
      // Use inline type text when the type alias was not emitted (e.g., to avoid shadowing)
      let typeNode: any;
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
      (propsParamId as any).typeAnnotation = j.tsTypeAnnotation(typeNode);
    } else {
      (propsParamId as any).typeAnnotation = j.tsTypeAnnotation(
        j.tsTypeReference(j.identifier(propsTypeName)),
      );
    }
  }
  const propsId = j.identifier("props");

  // Build destructure pattern: { children, style, ...dynamicProps, ...rest }
  // We destructure children, optional className/style, and any dynamic props, and spread the rest.
  const patternProps: any[] = [];

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
  for (const name of destructureProps.filter(Boolean)) {
    if (name !== "children" && name !== "style" && name !== "className") {
      patternProps.push(patternProp(name));
    }
  }

  // Add rest spread to capture all other props (only when needed)
  const restId = j.identifier("rest");
  if (includeRest) {
    patternProps.push(j.restElement(restId));
  }

  const needsSxVar = allowClassNameProp || allowStyleProp || inlineStyleProps.length > 0;
  const stylexPropsCall = j.callExpression(
    j.memberExpression(j.identifier("stylex"), j.identifier("props")),
    styleArgs,
  );

  // Build JSX attributes: static attrs, {...rest}, {...sx|stylex.props(...)}, optional className/style
  const jsxAttrs: any[] = [];

  // Add default attrs (e.g. `tabIndex: props.tabIndex ?? 0`) first so passed props can override via {...rest}.
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
        j.jsxExpressionContainer(j.logicalExpression("??", propExpr as any, fallback as any)),
      ),
    );
  }

  // Add conditional attrs (e.g. `size: props.$small ? 5 : undefined`) derived from props.
  for (const cond of conditionalAttrs) {
    jsxAttrs.push(
      j.jsxAttribute(
        j.jsxIdentifier(cond.attrName),
        j.jsxExpressionContainer(
          j.conditionalExpression(
            j.identifier(cond.jsxProp),
            j.literal(cond.value),
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
          j.binaryExpression(
            "!==",
            j.identifier(inv.jsxProp) as any,
            j.booleanLiteral(true) as any,
          ),
        ),
      ),
    );
  }

  // Add static attrs from .attrs() (e.g., type="range") first
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

  if (includeRest) {
    jsxAttrs.push(j.jsxSpreadAttribute(restId));
  }

  if (!needsSxVar) {
    jsxAttrs.push(j.jsxSpreadAttribute(stylexPropsCall));
  } else {
    jsxAttrs.push(j.jsxSpreadAttribute(j.identifier("sx")));

    if (allowClassNameProp) {
      const mergedClassName = j.callExpression(
        j.memberExpression(
          j.callExpression(
            j.memberExpression(
              j.arrayExpression([
                j.memberExpression(j.identifier("sx"), j.identifier("className")),
                j.identifier("className"),
              ]),
              j.identifier("filter"),
            ),
            [j.identifier("Boolean")],
          ),
          j.identifier("join"),
        ),
        [j.literal(" ")],
      );
      jsxAttrs.push(
        j.jsxAttribute(j.jsxIdentifier("className"), j.jsxExpressionContainer(mergedClassName)),
      );
    }

    if (allowStyleProp || inlineStyleProps.length > 0) {
      const spreads: any[] = [
        j.spreadElement(j.memberExpression(j.identifier("sx"), j.identifier("style")) as any),
        ...(allowStyleProp ? [j.spreadElement(j.identifier("style") as any)] : []),
        ...inlineStyleProps.map((p) => j.property("init", j.identifier(p.prop), p.expr as any)),
      ];
      jsxAttrs.push(
        j.jsxAttribute(
          j.jsxIdentifier("style"),
          j.jsxExpressionContainer(j.objectExpression(spreads) as any),
        ),
      );
    }
  }

  const openingEl = j.jsxOpeningElement(j.jsxIdentifier(tagName), jsxAttrs, isVoidTag);

  const jsx = isVoidTag
    ? ({
        type: "JSXElement",
        openingElement: openingEl,
        closingElement: null,
        children: [],
      } as any)
    : j.jsxElement(openingEl, j.jsxClosingElement(j.jsxIdentifier(tagName)), [
        j.jsxExpressionContainer(j.identifier("children")),
      ]);

  // Always emit destructure statement since we always destructure style and rest
  const bodyStmts: any[] = [];
  bodyStmts.push(
    j.variableDeclaration("const", [
      j.variableDeclarator(j.objectPattern(patternProps as any), propsId),
    ]),
  );
  if (needsSxVar) {
    bodyStmts.push(
      j.variableDeclaration("const", [j.variableDeclarator(j.identifier("sx"), stylexPropsCall)]),
    );
  }
  bodyStmts.push(j.returnStatement(jsx as any));

  const result: any[] = [
    j.functionDeclaration(j.identifier(localName), [propsParamId], j.blockStatement(bodyStmts)),
  ];

  return result;
}

function parseVariantWhenToAst(j: any, when: string): { cond: any; props: string[] } {
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

type ExportInfo = { exportName: string; isDefault: boolean; isSpecifier: boolean };

export function emitWrappers(args: {
  root: Collection<any>;
  j: any;
  filePath: string;
  styledDecls: StyledDecl[];
  wrapperNames: Set<string>;
  patternProp: (keyName: string, valueId?: any) => any;
  exportedComponents: Map<string, ExportInfo>;
  stylesIdentifier: string;
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
  } = args;

  // For plain JS/JSX and Flow transforms, skip emitting TS syntax entirely for now.
  const emitTypes = filePath.endsWith(".ts") || filePath.endsWith(".tsx");

  const wrapperDecls = styledDecls.filter((d) => d.needsWrapperComponent);
  if (wrapperDecls.length === 0) {
    return;
  }

  const usedAttrsCache = new Map<string, Set<string>>();
  const getUsedAttrs = (localName: string): Set<string> => {
    const cached = usedAttrsCache.get(localName);
    if (cached) {
      return cached;
    }
    const attrs = new Set<string>();
    const collectFromOpening = (opening: any) => {
      for (const a of (opening?.attributes ?? []) as any[]) {
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
    usedAttrsCache.set(localName, attrs);
    return attrs;
  };

  const jsxCallsitesCache = new Map<string, { hasAny: boolean }>();
  const getJsxCallsites = (localName: string): { hasAny: boolean } => {
    const cached = jsxCallsitesCache.get(localName);
    if (cached) {
      return cached;
    }
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
    jsxCallsitesCache.set(localName, out);
    return out;
  };

  const jsxChildrenUsageCache = new Map<string, boolean>();
  const hasJsxChildrenUsage = (localName: string): boolean => {
    const cached = jsxChildrenUsageCache.get(localName);
    if (cached !== undefined) {
      return cached;
    }
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
    jsxChildrenUsageCache.set(localName, hasChildren);
    return hasChildren;
  };

  const usedAsValueCache = new Map<string, boolean>();
  const isUsedAsValueInFile = (localName: string): boolean => {
    const cached = usedAsValueCache.get(localName);
    if (cached !== undefined) {
      return cached;
    }
    // Conservative: treat JSX expression usage as "used as value"
    // e.g. outerElementType={OuterWrapper}
    const inJsxExpr =
      root
        .find(j.JSXExpressionContainer, {
          expression: { type: "Identifier", name: localName },
        } as any)
        .size() > 0;
    usedAsValueCache.set(localName, inJsxExpr);
    return inJsxExpr;
  };

  /**
   * Decide whether a wrapper component should accept/merge external `className`/`style`.
   *
   * - Exported components and components extended by other styled components set `supportsExternalStyles`.
   * - Components used as values (passed around) may receive `className`/`style` even without direct JSX callsites.
   * - For local-only components, only support these props if a callsite actually passes them (or spreads unknown props).
   */
  const shouldAllowClassNameProp = (d: StyledDecl): boolean => {
    if (d.supportsExternalStyles) {
      return true;
    }
    if ((d as any).usedAsValue) {
      return true;
    }
    const used = getUsedAttrs(d.localName);
    return used.has("*") || used.has("className");
  };

  const shouldAllowStyleProp = (d: StyledDecl): boolean => {
    if (d.supportsExternalStyles) {
      return true;
    }
    if ((d as any).usedAsValue) {
      return true;
    }
    const used = getUsedAttrs(d.localName);
    return used.has("*") || used.has("style");
  };

  const inputWrapperDecls = wrapperDecls.filter(
    (d) =>
      d.base.kind === "intrinsic" && d.base.tagName === "input" && d.attrWrapper?.kind === "input",
  );
  const linkWrapperDecls = wrapperDecls.filter(
    (d) => d.base.kind === "intrinsic" && d.base.tagName === "a" && d.attrWrapper?.kind === "link",
  );
  // Polymorphic wrappers for intrinsic elements used with `as` prop
  const intrinsicPolymorphicWrapperDecls = wrapperDecls.filter(
    (d) =>
      d.base.kind === "intrinsic" &&
      // Polymorphic wrappers are only needed when `as/forwardedAs` is used.
      wrapperNames.has(d.localName),
  );

  const shouldForwardPropWrapperDecls = wrapperDecls.filter(
    (d) => d.shouldForwardProp && !d.enumVariant && d.base.kind === "intrinsic",
  );

  const emitted: any[] = [];
  let needsReactTypeImport = false;

  const propsTypeNameFor = (localName: string): string => `${localName}Props`;

  const stringifyTsTypeName = (n: any): string | null => {
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

  const stringifyTsType = (t: any): string | null => {
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
    let stmt: any;
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
  const annotatePropsParam = (propsId: any, localName: string, inlineTypeText?: string): void => {
    if (!emitTypes) {
      return;
    }
    if (inlineTypeText) {
      // Parse and use inline type
      let typeNode: any;
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
        return "React.InputHTMLAttributes<HTMLInputElement>";
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
  const getExplicitPropNames = (propsType: any): Set<string> => {
    const names = new Set<string>();

    const extractFromLiteral = (literal: any): void => {
      if (!literal || literal.type !== "TSTypeLiteral") {
        return;
      }
      for (const member of literal.members ?? []) {
        if (member?.type !== "TSPropertySignature") {
          continue;
        }
        const key: any = member.key;
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

    const extractFromType = (type: any): void => {
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
            const key: any = member.key;
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

    for (const attr of [...used].sort()) {
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

  if (inputWrapperDecls.length > 0) {
    for (const d of inputWrapperDecls) {
      const allowClassNameProp = shouldAllowClassNameProp(d);
      const allowStyleProp = shouldAllowStyleProp(d);
      const explicit = stringifyTsType(d.propsType);
      emitNamedPropsType(
        d.localName,
        explicit ??
          (() => {
            const base = "React.InputHTMLAttributes<HTMLInputElement>";
            const omitted: string[] = [];
            if (!allowClassNameProp) {
              omitted.push('"className"');
            }
            if (!allowStyleProp) {
              omitted.push('"style"');
            }
            return omitted.length > 0 ? `Omit<${base}, ${omitted.join(" | ")}>` : base;
          })(),
      );
      needsReactTypeImport = true;

      const aw = d.attrWrapper!;
      const styleArgs: any[] = [
        j.memberExpression(j.identifier(stylesIdentifier), j.identifier(d.styleKey)),
        ...(aw.checkboxKey
          ? [
              j.logicalExpression(
                "&&",
                j.binaryExpression("===", j.identifier("type"), j.literal("checkbox")),
                j.memberExpression(j.identifier(stylesIdentifier), j.identifier(aw.checkboxKey)),
              ),
            ]
          : []),
        ...(aw.radioKey
          ? [
              j.logicalExpression(
                "&&",
                j.binaryExpression("===", j.identifier("type"), j.literal("radio")),
                j.memberExpression(j.identifier(stylesIdentifier), j.identifier(aw.radioKey)),
              ),
            ]
          : []),
      ];

      emitted.push(
        allowClassNameProp
          ? emitTypes
            ? (j.template.statement`
                function ${j.identifier(d.localName)}(props: ${j.identifier(propsTypeNameFor(d.localName))}) {
                const { type, className, ...rest } = props;
                const sx = stylex.props(${styleArgs});
                return (
                  <input
                    {...sx}
                    className={[sx.className, className].filter(Boolean).join(" ")}
                    type={type}
                    {...rest}
                  />
                );
              }
              ` as any)
            : (j.template.statement`
                function ${j.identifier(d.localName)}(props) {
                  const { type, className, ...rest } = props;
                  const sx = stylex.props(${styleArgs});
                  return (
                    <input
                      {...sx}
                      className={[sx.className, className].filter(Boolean).join(" ")}
                      type={type}
                      {...rest}
                    />
                  );
                }
              ` as any)
          : emitTypes
            ? (j.template.statement`
                function ${j.identifier(d.localName)}(props: ${j.identifier(propsTypeNameFor(d.localName))}) {
                  const { type, ...rest } = props;
                  const sx = stylex.props(${styleArgs});
                  return <input type={type} {...rest} {...sx} />;
                }
              ` as any)
            : (j.template.statement`
                function ${j.identifier(d.localName)}(props) {
                  const { type, ...rest } = props;
                  const sx = stylex.props(${styleArgs});
                  return <input type={type} {...rest} {...sx} />;
                }
              ` as any),
      );
    }
  }

  if (linkWrapperDecls.length > 0) {
    for (const d of linkWrapperDecls) {
      const allowClassNameProp = shouldAllowClassNameProp(d);
      const allowStyleProp = shouldAllowStyleProp(d);
      const explicit = stringifyTsType(d.propsType);
      emitNamedPropsType(
        d.localName,
        explicit ??
          withChildren(
            (() => {
              const base = "React.AnchorHTMLAttributes<HTMLAnchorElement>";
              const omitted: string[] = [];
              if (!allowClassNameProp) {
                omitted.push('"className"');
              }
              if (!allowStyleProp) {
                omitted.push('"style"');
              }
              return omitted.length > 0 ? `Omit<${base}, ${omitted.join(" | ")}>` : base;
            })(),
          ),
      );
      needsReactTypeImport = true;

      const aw = d.attrWrapper!;
      const base = j.memberExpression(j.identifier(stylesIdentifier), j.identifier(d.styleKey));
      const styleArgs: any[] = [
        base,
        ...(aw.externalKey
          ? [
              j.logicalExpression(
                "&&",
                j.identifier("isExternal"),
                j.memberExpression(j.identifier(stylesIdentifier), j.identifier(aw.externalKey)),
              ),
            ]
          : []),
        ...(aw.httpsKey
          ? [
              j.logicalExpression(
                "&&",
                j.identifier("isHttps"),
                j.memberExpression(j.identifier(stylesIdentifier), j.identifier(aw.httpsKey)),
              ),
            ]
          : []),
        ...(aw.pdfKey
          ? [
              j.logicalExpression(
                "&&",
                j.identifier("isPdf"),
                j.memberExpression(j.identifier(stylesIdentifier), j.identifier(aw.pdfKey)),
              ),
            ]
          : []),
      ];

      emitted.push(
        allowClassNameProp
          ? emitTypes
            ? (j.template.statement`
                function ${j.identifier(d.localName)}(props: ${j.identifier(propsTypeNameFor(d.localName))}) {
                  const { href, target, className, children, ...rest } = props;
                const isHttps = href?.startsWith("https");
                const isPdf = href?.endsWith(".pdf");
                const isExternal = target === "_blank";
                const sx = stylex.props(${styleArgs});
                return (
                  <a
                    {...sx}
                    className={[sx.className, className].filter(Boolean).join(" ")}
                    href={href}
                    target={target}
                      {...rest}
                  >
                    {children}
                  </a>
                );
              }
              ` as any)
            : (j.template.statement`
                function ${j.identifier(d.localName)}(props) {
                  const { href, target, className, children, ...rest } = props;
                  const isHttps = href?.startsWith("https");
                  const isPdf = href?.endsWith(".pdf");
                  const isExternal = target === "_blank";
                  const sx = stylex.props(${styleArgs});
                  return (
                    <a
                      {...sx}
                      className={[sx.className, className].filter(Boolean).join(" ")}
                      href={href}
                      target={target}
                      {...rest}
                    >
                      {children}
                    </a>
                  );
                }
              ` as any)
          : emitTypes
            ? (j.template.statement`
                function ${j.identifier(d.localName)}(props: ${j.identifier(propsTypeNameFor(d.localName))}) {
                  const { href, target, children, ...rest } = props;
                  const isHttps = href?.startsWith("https");
                  const isPdf = href?.endsWith(".pdf");
                  const isExternal = target === "_blank";
                  const sx = stylex.props(${styleArgs});
                  return (
                    <a href={href} target={target} {...rest} {...sx}>
                      {children}
                    </a>
                  );
                }
              ` as any)
            : (j.template.statement`
                function ${j.identifier(d.localName)}(props) {
                  const { href, target, children, ...rest } = props;
                  const isHttps = href?.startsWith("https");
                  const isPdf = href?.endsWith(".pdf");
                  const isExternal = target === "_blank";
                  const sx = stylex.props(${styleArgs});
                  return (
                    <a href={href} target={target} {...rest} {...sx}>
                      {children}
                    </a>
                  );
                }
              ` as any),
      );
    }
  }

  if (intrinsicPolymorphicWrapperDecls.length > 0) {
    for (const d of intrinsicPolymorphicWrapperDecls) {
      if (d.base.kind !== "intrinsic") {
        continue;
      }
      const tagName = d.base.tagName;
      const allowStyleProp = shouldAllowStyleProp(d);
      const explicit = stringifyTsType(d.propsType);

      // Check if the explicit props type is a simple (non-generic) type reference.
      // If so, we should NOT make the wrapper function generic - just use the existing type directly.
      const isExplicitNonGenericType =
        explicit && d.propsType?.type === "TSTypeReference" && !d.propsType.typeParameters;

      // Polymorphic `as` wrappers: type the wrapper generically so the chosen `as` value
      // influences allowed props (e.g. htmlFor when as="label", react-spring style props when as={animated.span}).
      // Exception: if the original props type is already defined and non-generic, use it directly.
      const typeText = (() => {
        if (explicit) {
          return explicit;
        }
        const used = getUsedAttrs(d.localName);
        // Use ComponentPropsWithRef when ref is used on the component
        const hasRef = used.has("ref");
        const base = hasRef
          ? "React.ComponentPropsWithRef<C>"
          : "React.ComponentPropsWithoutRef<C>";
        // Omit className always, omit style only if not used on the component
        const hasStyle = used.has("style");
        const omitList = hasStyle ? '"className"' : '"className" | "style"';
        const baseMaybeOmitted = `Omit<${base}, ${omitList}>`;
        const extra = "{ as?: C }";
        return joinIntersection(baseMaybeOmitted, extra);
      })();

      if (!isExplicitNonGenericType) {
        emitNamedPropsType(d.localName, typeText, `C extends React.ElementType = "${tagName}"`);
      }
      needsReactTypeImport = true;

      const styleArgs: any[] = [
        ...(d.extendsStyleKey
          ? [j.memberExpression(j.identifier(stylesIdentifier), j.identifier(d.extendsStyleKey))]
          : []),
        j.memberExpression(j.identifier(stylesIdentifier), j.identifier(d.styleKey)),
      ];

      // Track props that need to be destructured for variant styles
      const destructureProps: string[] = [];

      // Add variant style arguments if this component has variants
      if (d.variantStyleKeys) {
        for (const [when, variantKey] of Object.entries(d.variantStyleKeys)) {
          const { cond, props } = parseVariantWhenToAst(j, when);
          for (const p of props) {
            if (p && !destructureProps.includes(p)) {
              destructureProps.push(p);
            }
          }
          styleArgs.push(
            j.logicalExpression(
              "&&",
              cond,
              j.memberExpression(j.identifier(stylesIdentifier), j.identifier(variantKey)),
            ),
          );
        }
      }

      const stylexPropsCall = j.callExpression(
        j.memberExpression(j.identifier("stylex"), j.identifier("props")),
        styleArgs,
      );

      const isVoidTag = VOID_TAGS.has(tagName);
      const propsParamId = j.identifier("props");
      if (emitTypes) {
        if (isExplicitNonGenericType) {
          // Use the existing non-generic type directly without making the function generic
          (propsParamId as any).typeAnnotation = j(
            `const x: ${explicit} = null`,
          ).get().node.program.body[0].declarations[0].id.typeAnnotation;
        } else {
          // Make the wrapper function generic so `as` can influence props.
          const tp = j(
            `function _<C extends React.ElementType = "${tagName}">() { return null }`,
          ).get().node.program.body[0].typeParameters;
          (propsParamId as any).typeAnnotation = j(
            `const x: ${propsTypeNameFor(d.localName)}<C> = null`,
          ).get().node.program.body[0].declarations[0].id.typeAnnotation;
          (propsParamId as any).typeParameters = tp;
        }
      }
      const propsId = j.identifier("props");
      const childrenId = j.identifier("children");
      const restId = j.identifier("rest");
      const styleId = j.identifier("style");

      const declStmt = j.variableDeclaration("const", [
        j.variableDeclarator(
          j.objectPattern([
            j.property.from({
              kind: "init",
              key: j.identifier("as"),
              value: j.assignmentPattern(j.identifier("Component"), j.literal(tagName)),
              shorthand: false,
            }),
            ...(isVoidTag ? [] : [patternProp("children", childrenId)]),
            ...(allowStyleProp ? [patternProp("style", styleId)] : []),
            // Add variant props to destructuring
            ...destructureProps.filter(Boolean).map((name) => patternProp(name)),
            j.restElement(restId),
          ] as any),
          propsId,
        ),
      ]);

      const attrs: any[] = [
        j.jsxSpreadAttribute(restId),
        j.jsxSpreadAttribute(stylexPropsCall),
        ...(allowStyleProp
          ? [j.jsxAttribute(j.jsxIdentifier("style"), j.jsxExpressionContainer(styleId))]
          : []),
      ];
      const openingEl = j.jsxOpeningElement(j.jsxIdentifier("Component"), attrs, isVoidTag);
      const jsx = isVoidTag
        ? ({
            type: "JSXElement",
            openingElement: openingEl,
            closingElement: null,
            children: [],
          } as any)
        : j.jsxElement(openingEl, j.jsxClosingElement(j.jsxIdentifier("Component")), [
            j.jsxExpressionContainer(childrenId),
          ]);

      const fn = j.functionDeclaration(
        j.identifier(d.localName),
        [propsParamId],
        j.blockStatement([declStmt, j.returnStatement(jsx as any)]),
      );
      // Move the generic parameters from the param to the function node (parser puts it on FunctionDeclaration).
      if ((propsParamId as any).typeParameters) {
        (fn as any).typeParameters = (propsParamId as any).typeParameters;
        (propsParamId as any).typeParameters = undefined;
      }
      emitted.push(fn);
    }
  }

  // Enum-variant wrappers (e.g. DynamicBox variant mapping from string-interpolation fixture).
  const enumVariantWrappers = wrapperDecls.filter((d) => d.enumVariant);
  if (enumVariantWrappers.length > 0) {
    for (const d of enumVariantWrappers) {
      if (!d.enumVariant) {
        continue;
      }
      const { propName, baseKey, cases } = d.enumVariant;
      const primary = cases[0];
      const secondary = cases[1];
      if (!primary || !secondary) {
        continue;
      }
      const explicit = stringifyTsType(d.propsType);
      if (explicit) {
        emitNamedPropsType(d.localName, withChildren(explicit));
        needsReactTypeImport = true;
      } else {
        // Best-effort: treat enum variant prop as a string-literal union.
        const hasNeq = cases.some((c) => c.kind === "neq");
        const values = [...new Set(cases.map((c) => c.whenValue))].filter(Boolean);
        const union = hasNeq
          ? "string"
          : values.length > 0
            ? values.map((v) => JSON.stringify(v)).join(" | ")
            : "string";
        emitNamedPropsType(
          d.localName,
          withChildren(`React.HTMLAttributes<HTMLDivElement> & { ${propName}?: ${union} }`),
        );
        needsReactTypeImport = true;
      }
      const propsParamId = j.identifier("props");
      annotatePropsParam(propsParamId, d.localName);
      const propsId = j.identifier("props");
      const variantId = j.identifier(propName);
      const childrenId = j.identifier("children");

      const declStmt = j.variableDeclaration("const", [
        j.variableDeclarator(
          j.objectPattern([
            patternProp(propName, variantId),
            patternProp("children", childrenId),
          ] as any),
          propsId,
        ),
      ]);

      const base = j.memberExpression(j.identifier(stylesIdentifier), j.identifier(baseKey));
      const condPrimary = j.binaryExpression("===", variantId, j.literal(primary.whenValue));
      const condSecondary =
        secondary.kind === "neq"
          ? j.binaryExpression("!==", variantId, j.literal(secondary.whenValue))
          : j.binaryExpression("===", variantId, j.literal(secondary.whenValue));

      const sxDecl = j.variableDeclaration("const", [
        j.variableDeclarator(
          j.identifier("sx"),
          j.callExpression(j.memberExpression(j.identifier("stylex"), j.identifier("props")), [
            base,
            j.logicalExpression(
              "&&",
              condPrimary as any,
              j.memberExpression(j.identifier(stylesIdentifier), j.identifier(primary.styleKey)),
            ),
            j.logicalExpression(
              "&&",
              condSecondary as any,
              j.memberExpression(j.identifier(stylesIdentifier), j.identifier(secondary.styleKey)),
            ),
          ]),
        ),
      ]);

      const openingEl = j.jsxOpeningElement(
        j.jsxIdentifier("div"),
        [j.jsxSpreadAttribute(j.identifier("sx"))],
        false,
      );
      const jsx = j.jsxElement(openingEl, j.jsxClosingElement(j.jsxIdentifier("div")), [
        j.jsxExpressionContainer(childrenId),
      ]);

      emitted.push(
        withLeadingComments(
          j.functionDeclaration(
            j.identifier(d.localName),
            [propsParamId],
            j.blockStatement([declStmt, sxDecl, j.returnStatement(jsx as any)]),
          ),
          d,
        ),
      );
    }
  }

  // Generic wrappers for `withConfig({ shouldForwardProp })` cases.
  for (const d of shouldForwardPropWrapperDecls) {
    if (d.base.kind !== "intrinsic") {
      continue;
    }
    const tagName = d.base.tagName;
    const allowClassNameProp = shouldAllowClassNameProp(d);
    const allowStyleProp = shouldAllowStyleProp(d);

    const extraProps = new Set<string>();
    for (const p of d.shouldForwardProp?.dropProps ?? []) {
      if (p) {
        extraProps.add(p);
      }
    }
    for (const when of Object.keys(d.variantStyleKeys ?? {})) {
      const { props } = parseVariantWhenToAst(j, when);
      for (const p of props) {
        if (p) {
          extraProps.add(p);
        }
      }
    }
    for (const p of d.styleFnFromProps ?? []) {
      if (p?.jsxProp) {
        extraProps.add(p.jsxProp);
      }
    }
    const dropPrefixFromFilter = d.shouldForwardProp?.dropPrefix;
    const usedAttrs = getUsedAttrs(d.localName);
    const shouldAllowAnyPrefixProps =
      !!dropPrefixFromFilter &&
      (usedAttrs.has("*") ||
        [...usedAttrs].some((n) => n.startsWith(dropPrefixFromFilter) && !extraProps.has(n)));
    const isValidIdentifier = (name: string): boolean => /^[$A-Z_][0-9A-Z_$]*$/i.test(name);
    const knownPrefixProps = dropPrefixFromFilter
      ? [...extraProps].filter((p) => p.startsWith(dropPrefixFromFilter) && isValidIdentifier(p))
      : [];
    const knownPrefixPropsSet = new Set(knownPrefixProps);

    const explicit = stringifyTsType(d.propsType);
    // Extract prop names from explicit type to avoid duplicating them in inferred type
    const explicitPropNames = d.propsType ? getExplicitPropNames(d.propsType) : new Set<string>();
    const extrasTypeText = (() => {
      // If input provided an explicit props type, prefer it and avoid emitting `any` overrides
      // for the same keys (e.g. `color?: string` should not become `color?: any`).
      if (explicit && explicit.trim()) {
        // Only allow arbitrary `$...` transient props when we see unknown/spread attrs at call-sites.
        return dropPrefixFromFilter === "$" && shouldAllowAnyPrefixProps
          ? `${explicit} & { [K in \`$\${string}\`]?: any }`
          : explicit;
      }
      const lines: string[] = [];
      for (const p of extraProps) {
        // Only emit valid identifier keys (fixtures use simple identifiers like `hasError` / `$foo`).
        lines.push(`  ${p}?: any;`);
      }
      const literal = lines.length > 0 ? `{\n${lines.join("\n")}\n}` : "{}";
      if (dropPrefixFromFilter === "$") {
        // Allow any `$...` transient prop when the filter is prefix-based.
        return `${literal} & { [K in \`$\${string}\`]?: any }`;
      }
      return literal;
    })();
    // For elements with explicit type, generate clean types:
    // - Void tags (input, img): use Omit<React.*HTMLAttributes, ...> & explicit
    // - Non-void tags (div, span): use React.PropsWithChildren<explicit>
    // Without explicit type, infer from usage.
    const finalTypeText = (() => {
      if (explicit) {
        if (VOID_TAGS.has(tagName)) {
          const base = reactIntrinsicAttrsType(tagName);
          const omitted: string[] = [];
          if (!allowClassNameProp) {
            omitted.push('"className"');
          }
          if (!allowStyleProp) {
            omitted.push('"style"');
          }
          const baseWithOmit = omitted.length ? `Omit<${base}, ${omitted.join(" | ")}>` : base;
          return joinIntersection(baseWithOmit, extrasTypeText);
        }
        // Non-void tags:
        // - When shouldForwardProp is inferred internally, keep the type minimal (match fixtures).
        // - When shouldForwardProp came from `.withConfig({ shouldForwardProp })`, include base intrinsic props.
        if (!d.shouldForwardPropFromWithConfig) {
          const supplementalLines: string[] = [];
          if (allowClassNameProp) {
            supplementalLines.push(`  className?: string;`);
          }
          if (allowStyleProp) {
            supplementalLines.push(`  style?: React.CSSProperties;`);
          }
          const supplemental =
            supplementalLines.length > 0 ? `{\n${supplementalLines.join("\n")}\n}` : "{}";
          return withChildren(joinIntersection(extrasTypeText, supplemental));
        }
        const base = `React.ComponentProps<"${tagName}">`;
        const omitted: string[] = [];
        if (!allowClassNameProp) {
          omitted.push('"className"');
        }
        if (!allowStyleProp) {
          omitted.push('"style"');
        }
        const baseWithOmit = omitted.length ? `Omit<${base}, ${omitted.join(" | ")}>` : base;
        return joinIntersection(baseWithOmit, extrasTypeText);
      }
      // No explicit type: use inferred props
      // For non-void tags, wrap in PropsWithChildren to include children prop
      const inferred = inferredIntrinsicPropsTypeText({
        d,
        tagName,
        allowClassNameProp,
        allowStyleProp,
        skipProps: explicitPropNames,
      });
      return VOID_TAGS.has(tagName) ? inferred : withChildren(inferred);
    })();

    const typeAliasEmitted = emitNamedPropsType(d.localName, finalTypeText);
    // If the type alias was not emitted (e.g., due to shadowing), try to extend
    // the existing interface/type alias with the base HTML attributes.
    // Only extend when external styles are supported (at least one of className/style allowed).
    if (!typeAliasEmitted && explicit) {
      const propsTypeName = propsTypeNameFor(d.localName);
      const extendBaseTypeText = (() => {
        const base = reactIntrinsicAttrsType(tagName);
        const omitted: string[] = [];
        if (!allowClassNameProp) {
          omitted.push('"className"');
        }
        if (!allowStyleProp) {
          omitted.push('"style"');
        }
        return omitted.length ? `Omit<${base}, ${omitted.join(" | ")}>` : base;
      })();
      const interfaceExtended = extendExistingInterface(propsTypeName, extendBaseTypeText);
      if (!interfaceExtended) {
        extendExistingTypeAlias(propsTypeName, extendBaseTypeText);
      }
    }
    needsReactTypeImport = true;

    // Build style arguments: base + extends + dynamic variants (as conditional expressions).
    const styleArgs: any[] = [
      ...(d.extendsStyleKey
        ? [j.memberExpression(j.identifier(stylesIdentifier), j.identifier(d.extendsStyleKey))]
        : []),
      j.memberExpression(j.identifier(stylesIdentifier), j.identifier(d.styleKey)),
    ];

    // Variant buckets are keyed by expression strings (e.g. `size === \"large\"`).
    if (d.variantStyleKeys) {
      for (const [when, variantKey] of Object.entries(d.variantStyleKeys)) {
        const { cond } = parseVariantWhenToAst(j, when);
        styleArgs.push(
          j.logicalExpression(
            "&&",
            cond,
            j.memberExpression(j.identifier(stylesIdentifier), j.identifier(variantKey)),
          ),
        );
      }
    }

    // If we generated style functions (emitStyleFunction), apply them when props are present.
    // We will destructure these props and keep them out of the DOM spread.
    const styleFnPairs = d.styleFnFromProps ?? [];
    for (const p of styleFnPairs) {
      const prefix = d.shouldForwardProp?.dropPrefix;
      const isPrefixProp =
        !!prefix && typeof p.jsxProp === "string" && p.jsxProp.startsWith(prefix);
      const propExpr = isPrefixProp
        ? knownPrefixPropsSet.has(p.jsxProp)
          ? j.identifier(p.jsxProp)
          : j.memberExpression(j.identifier("props"), j.literal(p.jsxProp), true)
        : j.identifier(p.jsxProp);
      const call = j.callExpression(
        j.memberExpression(j.identifier(stylesIdentifier), j.identifier(p.fnKey)),
        [propExpr as any],
      );
      const required = isPropRequiredInPropsTypeLiteral(d.propsType, p.jsxProp);
      if (required) {
        styleArgs.push(call);
      } else {
        // Use `!= null` so `0` / empty strings still count as "provided".
        styleArgs.push(
          j.logicalExpression(
            "&&",
            j.binaryExpression("!=", propExpr as any, j.nullLiteral()),
            call,
          ),
        );
      }
    }

    // Determine prop keys to strip: explicit drops + prefix drops.
    const dropProps = d.shouldForwardProp?.dropProps ?? [];
    const dropPrefix = d.shouldForwardProp?.dropPrefix;

    const destructureParts: string[] = [];
    for (const p of dropProps) {
      destructureParts.push(p);
    }
    // For prefix drops (e.g. "$"), destructure any known `$...` props we see so they don't end up in `rest`.
    // Unknown `$...` props (via spreads) are still stripped by a runtime loop when needed.
    for (const p of knownPrefixProps) {
      if (!destructureParts.includes(p)) {
        destructureParts.push(p);
      }
    }

    // Emit wrapper function that merges className and strips props.
    // Build AST explicitly (avoid recast printer crashes from template interpolation).
    const propsParamId = j.identifier("props");
    annotatePropsParam(propsParamId, d.localName);
    const propsId = j.identifier("props");
    const classNameId = j.identifier("className");
    const childrenId = j.identifier("children");
    const styleId = j.identifier("style");
    const restId = j.identifier("rest");
    const isVoidTag = tagName === "input";
    const { hasAny: hasLocalUsage } = getJsxCallsites(d.localName);

    // Only include `{...rest}` when local callsites or value-usage prove we need to
    // forward additional props beyond the ones we explicitly handle/strip.
    const shouldIncludeRest =
      isUsedAsValueInFile(d.localName) ||
      (hasLocalUsage && usedAttrs.has("*")) ||
      (hasLocalUsage &&
        [...usedAttrs].some((n) => {
          if (
            n === "children" ||
            n === "className" ||
            n === "style" ||
            n === "as" ||
            n === "forwardedAs"
          ) {
            return false;
          }
          // If we explicitly destructure/strip it, it doesn't require a rest spread.
          return !destructureParts.includes(n);
        }));

    const shouldOmitRestSpread =
      !dropPrefix &&
      dropProps.length > 0 &&
      dropProps.every((p) => p.startsWith("$")) &&
      !usedAttrs.has("*") &&
      [...usedAttrs].every((n) => n === "children" || dropProps.includes(n));
    const includeRest = !shouldOmitRestSpread && shouldIncludeRest;

    // For local-only wrappers where no callsites (and no value-usage) use `className`/`style`,
    // don't support them in the wrapper or its props type.
    if (!allowClassNameProp && !allowStyleProp) {
      const isVoid = VOID_TAGS.has(tagName);
      const patternProps: any[] = [
        ...(isVoid ? [] : [patternProp("children", childrenId)]),
        ...destructureParts.filter(Boolean).map((name) => patternProp(name)),
        ...(includeRest ? [j.restElement(restId)] : []),
      ];
      const declStmt = j.variableDeclaration("const", [
        j.variableDeclarator(j.objectPattern(patternProps as any), propsId),
      ]);

      const cleanupPrefixStmt =
        dropPrefix && shouldAllowAnyPrefixProps && includeRest
          ? (j.forOfStatement(
              j.variableDeclaration("const", [
                j.variableDeclarator(j.identifier("k"), null as any),
              ]),
              j.callExpression(j.memberExpression(j.identifier("Object"), j.identifier("keys")), [
                restId,
              ]),
              j.blockStatement([
                j.ifStatement(
                  j.callExpression(
                    j.memberExpression(j.identifier("k"), j.identifier("startsWith")),
                    [j.literal(dropPrefix)],
                  ),
                  j.expressionStatement(
                    j.unaryExpression(
                      "delete",
                      j.memberExpression(restId, j.identifier("k"), true),
                    ),
                  ),
                ),
              ]),
            ) as any)
          : null;

      const sxDecl = j.variableDeclaration("const", [
        j.variableDeclarator(
          j.identifier("sx"),
          j.callExpression(
            j.memberExpression(j.identifier("stylex"), j.identifier("props")),
            styleArgs,
          ),
        ),
      ]);

      const openingAttrs: any[] = [
        ...(includeRest ? [j.jsxSpreadAttribute(restId)] : []),
        j.jsxSpreadAttribute(j.identifier("sx")),
      ];
      if (d.inlineStyleProps && d.inlineStyleProps.length) {
        openingAttrs.push(
          j.jsxAttribute(
            j.jsxIdentifier("style"),
            j.jsxExpressionContainer(
              j.objectExpression([
                j.spreadElement(
                  j.memberExpression(j.identifier("sx"), j.identifier("style")) as any,
                ),
                ...d.inlineStyleProps.map((p) =>
                  j.property("init", j.identifier(p.prop), p.expr as any),
                ),
              ]) as any,
            ),
          ),
        );
      }

      const openingEl = j.jsxOpeningElement(j.jsxIdentifier(tagName), openingAttrs, false);
      const jsx = isVoid
        ? ({
            type: "JSXElement",
            openingElement: { ...openingEl, selfClosing: true },
            closingElement: null,
            children: [],
          } as any)
        : j.jsxElement(openingEl, j.jsxClosingElement(j.jsxIdentifier(tagName)), [
            j.jsxExpressionContainer(childrenId),
          ]);

      const fnBodyStmts: any[] = [declStmt];
      if (cleanupPrefixStmt) {
        fnBodyStmts.push(cleanupPrefixStmt);
      }
      fnBodyStmts.push(sxDecl);
      fnBodyStmts.push(j.returnStatement(jsx as any));

      emitted.push(
        withLeadingComments(
          j.functionDeclaration(
            j.identifier(d.localName),
            [propsParamId],
            j.blockStatement(fnBodyStmts),
          ),
          d,
        ),
      );
      continue;
    }

    const patternProps: any[] = [
      ...(allowClassNameProp ? [patternProp("className", classNameId)] : []),
      // Pull out `children` for non-void elements so we don't forward it as an attribute.
      ...(isVoidTag ? [] : [patternProp("children", childrenId)]),
      ...(allowStyleProp ? [patternProp("style", styleId)] : []),
      ...destructureParts.filter(Boolean).map((name) => patternProp(name)),
      ...(includeRest ? [j.restElement(restId)] : []),
    ];

    const declStmt = j.variableDeclaration("const", [
      j.variableDeclarator(j.objectPattern(patternProps as any), propsId),
    ]);

    const cleanupPrefixStmt =
      dropPrefix && shouldAllowAnyPrefixProps && includeRest
        ? (j.forOfStatement(
            j.variableDeclaration("const", [j.variableDeclarator(j.identifier("k"), null as any)]),
            j.callExpression(j.memberExpression(j.identifier("Object"), j.identifier("keys")), [
              restId,
            ]),
            j.blockStatement([
              j.ifStatement(
                j.callExpression(
                  j.memberExpression(j.identifier("k"), j.identifier("startsWith")),
                  [j.literal(dropPrefix)],
                ),
                j.expressionStatement(
                  j.unaryExpression("delete", j.memberExpression(restId, j.identifier("k"), true)),
                ),
              ),
            ]),
          ) as any)
        : null;

    const sxDecl = j.variableDeclaration("const", [
      j.variableDeclarator(
        j.identifier("sx"),
        j.callExpression(
          j.memberExpression(j.identifier("stylex"), j.identifier("props")),
          styleArgs,
        ),
      ),
    ]);

    const openingAttrs: any[] = [j.jsxSpreadAttribute(j.identifier("sx"))];

    if (allowClassNameProp) {
      const mergedClassName = j.callExpression(
        j.memberExpression(
          j.callExpression(
            j.memberExpression(
              j.arrayExpression([
                j.memberExpression(j.identifier("sx"), j.identifier("className")),
                classNameId,
              ]),
              j.identifier("filter"),
            ),
            [j.identifier("Boolean")],
          ),
          j.identifier("join"),
        ),
        [j.literal(" ")],
      );
      openingAttrs.push(
        j.jsxAttribute(j.jsxIdentifier("className"), j.jsxExpressionContainer(mergedClassName)),
      );
    }

    if (allowStyleProp || (d.inlineStyleProps && d.inlineStyleProps.length)) {
      openingAttrs.push(
        j.jsxAttribute(
          j.jsxIdentifier("style"),
          j.jsxExpressionContainer(
            j.objectExpression([
              j.spreadElement(j.memberExpression(j.identifier("sx"), j.identifier("style")) as any),
              ...(allowStyleProp ? [j.spreadElement(styleId as any)] : []),
              ...(d.inlineStyleProps && d.inlineStyleProps.length
                ? d.inlineStyleProps.map((p) =>
                    j.property("init", j.identifier(p.prop), p.expr as any),
                  )
                : []),
            ]) as any,
          ),
        ),
      );
    }

    if (includeRest) {
      openingAttrs.push(j.jsxSpreadAttribute(restId));
    }

    const openingEl = j.jsxOpeningElement(j.jsxIdentifier(tagName), openingAttrs, false);
    const jsx = isVoidTag
      ? ({
          type: "JSXElement",
          openingElement: { ...openingEl, selfClosing: true },
          closingElement: null,
          children: [],
        } as any)
      : j.jsxElement(openingEl, j.jsxClosingElement(j.jsxIdentifier(tagName)), [
          j.jsxExpressionContainer(childrenId),
        ]);

    const fnBodyStmts: any[] = [declStmt];
    if (cleanupPrefixStmt) {
      fnBodyStmts.push(cleanupPrefixStmt);
    }
    fnBodyStmts.push(sxDecl);
    fnBodyStmts.push(j.returnStatement(jsx as any));

    emitted.push(
      withLeadingComments(
        j.functionDeclaration(
          j.identifier(d.localName),
          [propsParamId],
          j.blockStatement(fnBodyStmts),
        ),
        d,
      ),
    );
  }

  // Simple wrappers for `withConfig({ componentId })` cases where we just want to
  // preserve a component boundary without prop filtering.
  const simpleWithConfigWrappers = wrapperDecls.filter((d) => {
    if (d.base.kind !== "intrinsic") {
      return false;
    }
    const tagName = d.base.tagName;
    if (!d.withConfig?.componentId) {
      return false;
    }
    if (d.shouldForwardProp) {
      return false;
    }
    if (d.enumVariant) {
      return false;
    }
    if (d.siblingWrapper) {
      return false;
    }
    if (d.attrWrapper) {
      return false;
    }
    // Don't duplicate the polymorphic wrapper path.
    if (tagName === "button" && wrapperNames.has(d.localName)) {
      return false;
    }
    // Avoid duplicating other specialized wrappers.
    if (tagName === "input" || tagName === "a") {
      return false;
    }
    return true;
  });

  for (const d of simpleWithConfigWrappers) {
    if (d.base.kind !== "intrinsic") {
      continue;
    }
    const tagName = d.base.tagName;
    const supportsExternalStyles = d.supportsExternalStyles ?? false;
    const allowClassNameProp = shouldAllowClassNameProp(d);
    const allowStyleProp = shouldAllowStyleProp(d);
    {
      const explicit = stringifyTsType(d.propsType);
      const shouldUseIntrinsicProps = (() => {
        if (supportsExternalStyles) {
          return true;
        }
        const used = getUsedAttrs(d.localName);
        if (used.has("*")) {
          return true;
        }
        // If any attribute is passed, prefer intrinsic props.
        return used.size > 0;
      })();
      const baseTypeText = shouldUseIntrinsicProps
        ? inferredIntrinsicPropsTypeText({
            d,
            tagName,
            allowClassNameProp,
            allowStyleProp,
          })
        : "{}";
      // For non-void tags without explicit type, wrap in PropsWithChildren
      const typeWithChildren =
        !explicit && !VOID_TAGS.has(tagName) ? withChildren(baseTypeText) : baseTypeText;
      emitNamedPropsType(d.localName, explicit ?? typeWithChildren);
      needsReactTypeImport = true;
    }
    const styleArgs: any[] = [
      ...(d.extendsStyleKey
        ? [j.memberExpression(j.identifier(stylesIdentifier), j.identifier(d.extendsStyleKey))]
        : []),
      j.memberExpression(j.identifier(stylesIdentifier), j.identifier(d.styleKey)),
    ];

    const propsParamId = j.identifier("props");
    annotatePropsParam(propsParamId, d.localName);
    const propsId = j.identifier("props");
    const classNameId = j.identifier("className");
    const childrenId = j.identifier("children");
    const styleId = j.identifier("style");
    const restId = j.identifier("rest");

    const isVoidTag = VOID_TAGS.has(tagName);

    // For local-only wrappers with no external `className`/`style` usage, keep the wrapper minimal.
    if (!allowClassNameProp && !allowStyleProp) {
      const usedAttrs = getUsedAttrs(d.localName);
      const includeRest = usedAttrs.has("*") || !!(d as any).usedAsValue || usedAttrs.size > 0;
      emitted.push(
        ...withLeadingCommentsOnFirstFunction(
          emitMinimalWrapper({
            j,
            localName: d.localName,
            tagName,
            propsTypeName: propsTypeNameFor(d.localName),
            emitTypes,
            styleArgs,
            destructureProps: [],
            allowClassNameProp: false,
            allowStyleProp: false,
            includeRest,
            patternProp,
            inlineStyleProps: d.inlineStyleProps ?? [],
          }),
          d,
        ),
      );
      continue;
    }

    const patternProps: any[] = [
      patternProp("className", classNameId),
      ...(isVoidTag ? [] : [patternProp("children", childrenId)]),
      patternProp("style", styleId),
      j.restElement(restId),
    ];
    const declStmt = j.variableDeclaration("const", [
      j.variableDeclarator(j.objectPattern(patternProps as any), propsId),
    ]);

    const sxDecl = j.variableDeclaration("const", [
      j.variableDeclarator(
        j.identifier("sx"),
        j.callExpression(
          j.memberExpression(j.identifier("stylex"), j.identifier("props")),
          styleArgs,
        ),
      ),
    ]);

    const mergedClassName = j.callExpression(
      j.memberExpression(
        j.callExpression(
          j.memberExpression(
            j.arrayExpression([
              j.memberExpression(j.identifier("sx"), j.identifier("className")),
              classNameId,
            ]),
            j.identifier("filter"),
          ),
          [j.identifier("Boolean")],
        ),
        j.identifier("join"),
      ),
      [j.literal(" ")],
    );

    const openingEl = j.jsxOpeningElement(
      j.jsxIdentifier(tagName),
      [
        j.jsxSpreadAttribute(j.identifier("sx")),
        j.jsxAttribute(j.jsxIdentifier("className"), j.jsxExpressionContainer(mergedClassName)),
        j.jsxAttribute(
          j.jsxIdentifier("style"),
          j.jsxExpressionContainer(
            j.objectExpression([
              j.spreadElement(j.memberExpression(j.identifier("sx"), j.identifier("style")) as any),
              j.spreadElement(styleId as any),
            ]) as any,
          ),
        ),
        j.jsxSpreadAttribute(restId),
      ],
      false,
    );

    const jsx = isVoidTag
      ? ({
          type: "JSXElement",
          openingElement: { ...openingEl, selfClosing: true },
          closingElement: null,
          children: [],
        } as any)
      : j.jsxElement(openingEl, j.jsxClosingElement(j.jsxIdentifier(tagName)), [
          j.jsxExpressionContainer(childrenId),
        ]);

    emitted.push(
      withLeadingComments(
        j.functionDeclaration(
          j.identifier(d.localName),
          [propsParamId],
          j.blockStatement([declStmt, sxDecl, j.returnStatement(jsx as any)]),
        ),
        d,
      ),
    );
  }

  // Sibling selector wrappers (Thing + variants)
  const siblingWrappers = wrapperDecls.filter((d) => d.siblingWrapper);
  for (const d of siblingWrappers) {
    if (d.base.kind !== "intrinsic" || d.base.tagName !== "div") {
      continue;
    }
    const sw = d.siblingWrapper!;

    {
      const explicit = stringifyTsType(d.propsType);
      const extras: string[] = [];
      extras.push(`${sw.propAdjacent}?: boolean;`);
      if (sw.propAfter) {
        extras.push(`${sw.propAfter}?: boolean;`);
      }
      const extraType = `{ ${extras.join(" ")} }`;
      const allowClassNameProp = shouldAllowClassNameProp(d);
      const allowStyleProp = shouldAllowStyleProp(d);
      const baseTypeText = inferredIntrinsicPropsTypeText({
        d,
        tagName: "div",
        allowClassNameProp,
        allowStyleProp,
      });
      emitNamedPropsType(d.localName, explicit ?? joinIntersection(baseTypeText, extraType));
      needsReactTypeImport = true;
    }

    const propsParamId = j.identifier("props");
    annotatePropsParam(propsParamId, d.localName);
    const propsId = j.identifier("props");
    const childrenId = j.identifier("children");
    const classNameId = j.identifier("className");
    const restId = j.identifier("rest");
    const adjId = j.identifier(sw.propAdjacent);
    const afterId = sw.propAfter ? j.identifier(sw.propAfter) : j.identifier("_unused");

    const declStmt = j.variableDeclaration("const", [
      j.variableDeclarator(
        j.objectPattern([
          patternProp("children", childrenId),
          patternProp("className", classNameId),
          patternProp(sw.propAdjacent, adjId),
          patternProp(afterId.name, afterId),
          j.restElement(restId),
        ] as any),
        propsId,
      ),
    ]);

    const sxDecl = j.variableDeclaration("const", [
      j.variableDeclarator(
        j.identifier("sx"),
        j.callExpression(j.memberExpression(j.identifier("stylex"), j.identifier("props")), [
          j.memberExpression(j.identifier(stylesIdentifier), j.identifier(d.styleKey)),
          j.logicalExpression(
            "&&",
            adjId as any,
            j.memberExpression(j.identifier(stylesIdentifier), j.identifier(sw.adjacentKey)),
          ),
          ...(sw.afterKey && sw.propAfter
            ? [
                j.logicalExpression(
                  "&&",
                  afterId as any,
                  j.memberExpression(j.identifier(stylesIdentifier), j.identifier(sw.afterKey)),
                ),
              ]
            : []),
        ]),
      ),
    ]);

    const mergedClassName = j.callExpression(
      j.memberExpression(
        j.callExpression(
          j.memberExpression(
            j.arrayExpression([
              j.memberExpression(j.identifier("sx"), j.identifier("className")),
              classNameId,
            ]),
            j.identifier("filter"),
          ),
          [j.identifier("Boolean")],
        ),
        j.identifier("join"),
      ),
      [j.literal(" ")],
    );

    const openingEl = j.jsxOpeningElement(
      j.jsxIdentifier("div"),
      [
        j.jsxSpreadAttribute(j.identifier("sx")),
        j.jsxAttribute(j.jsxIdentifier("className"), j.jsxExpressionContainer(mergedClassName)),
        j.jsxSpreadAttribute(restId),
      ],
      false,
    );
    const jsx = j.jsxElement(openingEl, j.jsxClosingElement(j.jsxIdentifier("div")), [
      j.jsxExpressionContainer(childrenId),
    ]);

    emitted.push(
      j.functionDeclaration(
        j.identifier(d.localName),
        [propsParamId],
        j.blockStatement([declStmt, sxDecl, j.returnStatement(jsx as any)]),
      ),
    );
  }

  // Simple exported styled components (styled.div without special features)
  // These are exported components that need wrapper generation to maintain exports.
  const simpleExportedIntrinsicWrappers = wrapperDecls.filter((d) => {
    if (d.base.kind !== "intrinsic") {
      return false;
    }
    // Skip if already handled by other wrapper categories
    if (d.withConfig?.componentId) {
      return false;
    }
    if (d.shouldForwardProp) {
      return false;
    }
    if (d.enumVariant) {
      return false;
    }
    if (d.siblingWrapper) {
      return false;
    }
    if (d.attrWrapper) {
      return false;
    }
    // Skip specialized wrapper categories (polymorphic intrinsic wrappers with as/forwardedAs usage)
    if (wrapperNames.has(d.localName)) {
      return false;
    }
    // Note: input/a tags without attrWrapper (e.g., simple .attrs() cases) are now
    // handled here. The attrWrapper case is already excluded above at line 1591.
    return true;
  });
  for (const d of simpleExportedIntrinsicWrappers) {
    if (d.base.kind !== "intrinsic") {
      continue;
    }
    const tagName = d.base.tagName;
    const allowClassNameProp = shouldAllowClassNameProp(d);
    const allowStyleProp = shouldAllowStyleProp(d);
    let inlineTypeText: string | undefined;
    {
      const explicit = stringifyTsType(d.propsType);
      // Extract prop names from explicit type to avoid duplicating them in inferred type
      const explicitPropNames = d.propsType ? getExplicitPropNames(d.propsType) : new Set<string>();
      const baseTypeText = inferredIntrinsicPropsTypeText({
        d,
        tagName,
        allowClassNameProp,
        allowStyleProp,
        skipProps: explicitPropNames,
      });

      // Determine if the wrapper will spread ...rest to the element.
      // This is needed to decide whether to extend intrinsic props.
      const usedAttrsForType = getUsedAttrs(d.localName);
      // Parse variant keys to extract prop names
      // Handles: "color:primary" -> "color", "disabled" -> "disabled", "disabled&&color:primary" -> ["disabled", "color"]
      const variantPropsForType = new Set(
        Object.keys(d.variantStyleKeys ?? {}).flatMap((when) => {
          // Split by && and extract prop names from each part
          return when.split("&&").flatMap((part) => {
            // Remove negation prefix if present (e.g., "!color:primary" -> "color")
            const cleanPart = part.replace(/^!/, "");
            // Extract prop name (before : or the whole thing for booleans)
            const colonIdx = cleanPart.indexOf(":");
            return colonIdx >= 0 ? [cleanPart.slice(0, colonIdx)] : [cleanPart];
          });
        }),
      );
      const styleFnPropsForType = new Set((d.styleFnFromProps ?? []).map((p) => p.jsxProp));
      const conditionalPropsForType = new Set(
        (d.attrsInfo?.conditionalAttrs ?? []).map((c) => c.jsxProp),
      );
      const invertedPropsForType = new Set(
        (d.attrsInfo?.invertedBoolAttrs ?? []).map((inv) => inv.jsxProp),
      );
      const staticAttrNames = new Set(Object.keys(d.attrsInfo?.staticAttrs ?? {}));
      const handledProps = new Set([
        ...variantPropsForType,
        ...styleFnPropsForType,
        ...conditionalPropsForType,
        ...invertedPropsForType,
        ...staticAttrNames,
      ]);
      const needsRestForType =
        !!(d as any).usedAsValue ||
        usedAttrsForType.has("*") ||
        [...usedAttrsForType].some((n) => {
          if (
            n === "children" ||
            n === "className" ||
            n === "style" ||
            n === "as" ||
            n === "forwardedAs" ||
            n.startsWith("$") // Transient props should not be passed through
          ) {
            return false;
          }
          return !handledProps.has(n);
        });

      const extendBaseTypeText = (() => {
        // When we can't emit a new `${Component}Props` alias because one already exists,
        // prefer extending it with real intrinsic element attribute types (instead of a loose
        // inferred literal). This keeps exported interfaces like `CardProps` clean and accurate.
        const base = reactIntrinsicAttrsType(tagName);
        const omitted: string[] = [];
        if (!allowClassNameProp) {
          omitted.push('"className"');
        }
        if (!allowStyleProp) {
          omitted.push('"style"');
        }
        return omitted.length ? `Omit<${base}, ${omitted.join(" | ")}>` : base;
      })();

      // Build the type text based on what features are needed:
      // - If ...rest is spread to the element, extend intrinsic element props
      // - If className/style are allowed, include them explicitly
      // - Otherwise, just use PropsWithChildren
      const typeText = (() => {
        if (!explicit) {
          return baseTypeText;
        }
        // For void tags, always extend intrinsic props
        if (VOID_TAGS.has(tagName)) {
          return joinIntersection(extendBaseTypeText, explicit);
        }
        // If ...rest is spread to the element, extend intrinsic props for type safety
        if (needsRestForType) {
          return joinIntersection(extendBaseTypeText, explicit);
        }
        // If className/style are allowed, include them in the type
        if (allowClassNameProp || allowStyleProp) {
          const extras: string[] = [];
          if (allowClassNameProp) {
            extras.push("className?: string");
          }
          if (allowStyleProp) {
            extras.push("style?: React.CSSProperties");
          }
          extras.push("children?: React.ReactNode");
          return joinIntersection(explicit, `{ ${extras.join("; ")} }`);
        }
        // Default: just wrap with PropsWithChildren
        return withChildren(explicit);
      })();
      const typeAliasEmitted = emitNamedPropsType(d.localName, typeText);
      // If the type alias was not emitted (e.g., due to shadowing), try to extend
      // the existing interface/type alias with the base component props
      if (!typeAliasEmitted && explicit) {
        const propsTypeName = propsTypeNameFor(d.localName);
        const interfaceExtended = extendExistingInterface(propsTypeName, extendBaseTypeText);
        if (!interfaceExtended) {
          const typeAliasExtended = extendExistingTypeAlias(propsTypeName, extendBaseTypeText);
          if (!typeAliasExtended) {
            // Fallback: use inline type annotation
            inlineTypeText = VOID_TAGS.has(tagName) ? explicit : withChildren(explicit);
          }
        }
      }
      needsReactTypeImport = true;
    }
    const styleArgs: any[] = [
      ...(d.extendsStyleKey
        ? [j.memberExpression(j.identifier(stylesIdentifier), j.identifier(d.extendsStyleKey))]
        : []),
      j.memberExpression(j.identifier(stylesIdentifier), j.identifier(d.styleKey)),
    ];

    // Add variant style arguments if this component has variants
    const destructureProps: string[] = [];
    if (d.variantStyleKeys) {
      for (const [when, variantKey] of Object.entries(d.variantStyleKeys)) {
        const { cond, props } = parseVariantWhenToAst(j, when);
        for (const p of props) {
          if (p && !destructureProps.includes(p)) {
            destructureProps.push(p);
          }
        }

        styleArgs.push(
          j.logicalExpression(
            "&&",
            cond,
            j.memberExpression(j.identifier(stylesIdentifier), j.identifier(variantKey)),
          ),
        );
      }
    }

    // Add style function calls for dynamic prop-based styles (e.g., color: ${props => props.color})
    const styleFnPairs = d.styleFnFromProps ?? [];
    for (const p of styleFnPairs) {
      const propExpr = j.identifier(p.jsxProp);
      const call = j.callExpression(
        j.memberExpression(j.identifier(stylesIdentifier), j.identifier(p.fnKey)),
        [propExpr as any],
      );
      // Add prop to destructure list
      if (!destructureProps.includes(p.jsxProp)) {
        destructureProps.push(p.jsxProp);
      }
      // Check if prop is required in the props type
      const required = isPropRequiredInPropsTypeLiteral(d.propsType, p.jsxProp);
      if (required) {
        styleArgs.push(call);
      } else {
        // Use `!= null` so `0` / empty strings still count as "provided".
        styleArgs.push(
          j.logicalExpression(
            "&&",
            j.binaryExpression("!=", propExpr as any, j.nullLiteral()),
            call,
          ),
        );
      }
    }

    // `.attrs(fn)`-derived conditional attrs (e.g. `$small`) should be consumed in the wrapper
    // and NOT forwarded to the DOM element.
    if (d.attrsInfo?.conditionalAttrs?.length) {
      for (const c of d.attrsInfo.conditionalAttrs) {
        if (c?.jsxProp && !destructureProps.includes(c.jsxProp)) {
          destructureProps.push(c.jsxProp);
        }
      }
    }
    if (d.attrsInfo?.invertedBoolAttrs?.length) {
      for (const inv of d.attrsInfo.invertedBoolAttrs) {
        if (inv?.jsxProp && !destructureProps.includes(inv.jsxProp)) {
          destructureProps.push(inv.jsxProp);
        }
      }
    }

    const usedAttrs = getUsedAttrs(d.localName);
    const { hasAny: hasLocalUsage } = getJsxCallsites(d.localName);
    // Check if explicit props type has properties that should be passed through
    const explicitPropsNames = d.propsType ? getExplicitPropNames(d.propsType) : new Set<string>();
    const hasExplicitPropsToPassThrough =
      explicitPropsNames.size > 0 &&
      [...explicitPropsNames].some((n) => {
        if (
          n === "children" ||
          n === "className" ||
          n === "style" ||
          n === "as" ||
          n === "forwardedAs" ||
          n.startsWith("$") // Transient props should not be passed through
        ) {
          return false;
        }
        return !destructureProps.includes(n);
      });
    const shouldIncludeRest =
      isUsedAsValueInFile(d.localName) ||
      hasExplicitPropsToPassThrough ||
      (hasLocalUsage && usedAttrs.has("*")) ||
      (hasLocalUsage &&
        [...usedAttrs].some((n) => {
          if (
            n === "children" ||
            n === "className" ||
            n === "style" ||
            n === "as" ||
            n === "forwardedAs"
          ) {
            return false;
          }
          return !destructureProps.includes(n);
        }));

    // When external `className` and/or `style` are allowed, generate wrapper with merging.
    if (allowClassNameProp || allowStyleProp) {
      const isVoidTag = VOID_TAGS.has(tagName);
      const propsParamId = j.identifier("props");
      annotatePropsParam(propsParamId, d.localName, inlineTypeText);
      const propsId = j.identifier("props");
      const classNameId = j.identifier("className");
      const childrenId = j.identifier("children");
      const styleId = j.identifier("style");
      const restId = shouldIncludeRest ? j.identifier("rest") : null;

      const patternProps: any[] = [
        ...(allowClassNameProp ? [patternProp("className", classNameId)] : []),
        ...(isVoidTag ? [] : [patternProp("children", childrenId)]),
        ...(allowStyleProp ? [patternProp("style", styleId)] : []),
        // Include variant props and style function props in destructuring
        ...destructureProps.map((name) => patternProp(name)),
        ...(restId ? [j.restElement(restId)] : []),
      ];
      const declStmt = j.variableDeclaration("const", [
        j.variableDeclarator(j.objectPattern(patternProps as any), propsId),
      ]);

      const sxDecl = j.variableDeclaration("const", [
        j.variableDeclarator(
          j.identifier("sx"),
          j.callExpression(
            j.memberExpression(j.identifier("stylex"), j.identifier("props")),
            styleArgs,
          ),
        ),
      ]);

      const mergedClassName = allowClassNameProp
        ? j.callExpression(
            j.memberExpression(
              j.callExpression(
                j.memberExpression(
                  j.arrayExpression([
                    j.memberExpression(j.identifier("sx"), j.identifier("className")),
                    classNameId,
                  ]),
                  j.identifier("filter"),
                ),
                [j.identifier("Boolean")],
              ),
              j.identifier("join"),
            ),
            [j.literal(" ")],
          )
        : null;

      const openingEl = j.jsxOpeningElement(
        j.jsxIdentifier(tagName),
        [
          j.jsxSpreadAttribute(j.identifier("sx")),
          ...(allowClassNameProp
            ? [
                j.jsxAttribute(
                  j.jsxIdentifier("className"),
                  j.jsxExpressionContainer(mergedClassName),
                ),
              ]
            : []),
          ...(allowStyleProp || (d.inlineStyleProps && d.inlineStyleProps.length)
            ? [
                j.jsxAttribute(
                  j.jsxIdentifier("style"),
                  j.jsxExpressionContainer(
                    j.objectExpression([
                      j.spreadElement(
                        j.memberExpression(j.identifier("sx"), j.identifier("style")) as any,
                      ),
                      ...(allowStyleProp ? [j.spreadElement(styleId as any)] : []),
                      ...(d.inlineStyleProps && d.inlineStyleProps.length
                        ? d.inlineStyleProps.map((p) =>
                            j.property("init", j.identifier(p.prop), p.expr as any),
                          )
                        : []),
                    ]) as any,
                  ),
                ),
              ]
            : []),
          ...(restId ? [j.jsxSpreadAttribute(restId)] : []),
        ],
        false,
      );

      const jsx = isVoidTag
        ? ({
            type: "JSXElement",
            openingElement: { ...openingEl, selfClosing: true },
            closingElement: null,
            children: [],
          } as any)
        : j.jsxElement(openingEl, j.jsxClosingElement(j.jsxIdentifier(tagName)), [
            j.jsxExpressionContainer(childrenId),
          ]);

      const fn = j.functionDeclaration(
        j.identifier(d.localName),
        [propsParamId],
        j.blockStatement([declStmt, sxDecl, j.returnStatement(jsx as any)]),
      );

      emitted.push(...withLeadingCommentsOnFirstFunction([fn], d));
      continue;
    }

    emitted.push(
      ...withLeadingCommentsOnFirstFunction(
        emitMinimalWrapper({
          j,
          localName: d.localName,
          tagName,
          propsTypeName: propsTypeNameFor(d.localName),
          ...(inlineTypeText ? { inlineTypeText } : {}),
          emitTypes,
          styleArgs,
          destructureProps,
          allowClassNameProp: false,
          allowStyleProp: false,
          includeRest: shouldIncludeRest,
          patternProp,
          ...(d.attrsInfo?.defaultAttrs ? { defaultAttrs: d.attrsInfo.defaultAttrs } : {}),
          ...(d.attrsInfo?.conditionalAttrs
            ? { conditionalAttrs: d.attrsInfo.conditionalAttrs }
            : {}),
          ...(d.attrsInfo?.invertedBoolAttrs
            ? { invertedBoolAttrs: d.attrsInfo.invertedBoolAttrs }
            : {}),
          ...(d.attrsInfo?.staticAttrs ? { staticAttrs: d.attrsInfo.staticAttrs } : {}),
          inlineStyleProps: d.inlineStyleProps ?? [],
        }),
        d,
      ),
    );
  }

  // Component wrappers (styled(Component)) - these wrap another component
  const componentWrappers = wrapperDecls.filter((d) => d.base.kind === "component");

  for (const d of componentWrappers) {
    if (d.base.kind !== "component") {
      continue;
    }
    const wrappedComponent = d.base.ident;
    const wrappedComponentHasAs = wrapperNames.has(wrappedComponent);
    const isPolymorphicComponentWrapper = wrapperNames.has(d.localName) && !wrappedComponentHasAs;
    const allowClassNameProp = shouldAllowClassNameProp(d);
    const allowStyleProp = shouldAllowStyleProp(d);
    const propsIdForExpr = j.identifier("props");
    // Track which type name to use for the function parameter
    let functionParamTypeName: string | null = null;
    {
      const explicit = stringifyTsType(d.propsType);

      // Check if explicit type is a simple type reference (e.g., `TypeAliasProps`)
      // that exists in the file - if so, extend it directly instead of creating a new type
      const isSimpleTypeRef =
        d.propsType?.type === "TSTypeReference" && d.propsType?.typeName?.type === "Identifier";
      const explicitTypeName = isSimpleTypeRef ? d.propsType?.typeName?.name : null;
      const explicitTypeExists = explicitTypeName && typeExistsInFile(explicitTypeName);

      if (explicitTypeExists && explicit && explicitTypeName) {
        const baseTypeText = (() => {
          const base = `React.ComponentProps<typeof ${wrappedComponent}>`;
          const omitted: string[] = [];
          if (!allowClassNameProp) {
            omitted.push('"className"');
          }
          if (!allowStyleProp) {
            omitted.push('"style"');
          }
          return omitted.length ? `Omit<${base}, ${omitted.join(" | ")}>` : base;
        })();
        // Extend the existing type in-place so the wrapper can reuse it.
        const interfaceExtended = extendExistingInterface(explicitTypeName, baseTypeText);
        if (!interfaceExtended) {
          extendExistingTypeAlias(explicitTypeName, baseTypeText);
        }
        functionParamTypeName = explicitTypeName;
      } else {
        // Extract prop names from explicit type to avoid duplicating them in inferred type
        const explicitPropNames = d.propsType
          ? getExplicitPropNames(d.propsType)
          : new Set<string>();

        if (isPolymorphicComponentWrapper) {
          const baseProps = `React.ComponentProps<typeof ${wrappedComponent}>`;
          const omitted: string[] = [];
          if (!allowClassNameProp) {
            omitted.push('"className"');
          }
          if (!allowStyleProp) {
            omitted.push('"style"');
          }
          const baseMaybeOmitted = omitted.length
            ? `Omit<${baseProps}, ${omitted.join(" | ")}>`
            : baseProps;
          const typeText = joinIntersection(
            baseMaybeOmitted,
            "{ as?: C }",
            `Omit<React.ComponentPropsWithoutRef<C>, keyof ${baseProps} | "as">`,
          );
          emitNamedPropsType(
            d.localName,
            typeText,
            `C extends React.ElementType = typeof ${wrappedComponent}`,
          );
        } else {
          const inferred = inferredComponentWrapperPropsTypeText({
            d,
            allowClassNameProp,
            allowStyleProp,
            includeAsProp: false,
            skipProps: explicitPropNames,
          });
          // Add ref support when .attrs({ as: "element" }) is used
          const attrsAs = d.attrsInfo?.staticAttrs?.as;
          const refElementType =
            typeof attrsAs === "string" ? TAG_TO_HTML_ELEMENT[attrsAs] : undefined;
          // Insert ref prop inside the object literal if it ends with "}"
          const explicitWithRef = explicit
            ? refElementType && explicit.trim().endsWith("}")
              ? explicit.replace(/\}$/, `ref?: React.Ref<${refElementType}>; }`)
              : explicit
            : refElementType
              ? `{ ref?: React.Ref<${refElementType}>; }`
              : null;
          const explicitWithChildren = explicitWithRef ? withChildren(explicitWithRef) : null;
          const typeText = explicitWithChildren
            ? joinIntersection(inferred, explicitWithChildren)
            : inferred;
          emitNamedPropsType(d.localName, typeText);
        }
      }
      needsReactTypeImport = true;
    }
    // For component wrappers, don't include extendsStyleKey because
    // the wrapped component already applies its own styles.
    const styleArgs: any[] = [
      j.memberExpression(j.identifier(stylesIdentifier), j.identifier(d.styleKey)),
    ];

    // Track props that need to be destructured for conditional styles
    const destructureProps: string[] = [];

    // Add variant style arguments if this component has variants
    if (d.variantStyleKeys) {
      for (const [when, variantKey] of Object.entries(d.variantStyleKeys)) {
        const { cond, props } = parseVariantWhenToAst(j, when);
        for (const p of props) {
          if (p && !destructureProps.includes(p)) {
            destructureProps.push(p);
          }
        }

        styleArgs.push(
          j.logicalExpression(
            "&&",
            cond,
            j.memberExpression(j.identifier(stylesIdentifier), j.identifier(variantKey)),
          ),
        );
      }
    }

    // Add style function calls for dynamic prop-based styles
    const styleFnPairs = d.styleFnFromProps ?? [];
    for (const p of styleFnPairs) {
      const propExpr = j.memberExpression(propsIdForExpr, j.identifier(p.jsxProp));
      const call = j.callExpression(
        j.memberExpression(j.identifier(stylesIdentifier), j.identifier(p.fnKey)),
        [propExpr as any],
      );
      const required = isPropRequiredInPropsTypeLiteral(d.propsType, p.jsxProp);
      if (required) {
        styleArgs.push(call);
      } else {
        styleArgs.push(
          j.logicalExpression(
            "&&",
            j.binaryExpression("!=", propExpr as any, j.nullLiteral()),
            call,
          ),
        );
      }
    }

    // For component wrappers, filter out transient props ($-prefixed) that are NOT used in styling.
    // In styled-components, transient props are automatically filtered before passing to wrapped component.
    // We need to mimic this behavior by destructuring them out when not used for conditional styles.
    // Track which transient props are for filtering only (not used in styling) so we don't pass them back.
    const filterOnlyTransientProps: string[] = [];
    // Track transient props that are defined in the WRAPPER's explicit type (not the base's).
    // These should NOT be passed back to the base component because the base doesn't accept them.
    const wrapperOnlyTransientProps: string[] = [];
    {
      // Helper to find transient props in a type name
      const findTransientPropsInTypeName = (typeName: string): string[] => {
        const props: string[] = [];
        const collectFromTypeNode = (typeNode: any) => {
          if (!typeNode) {
            return;
          }
          if (typeNode.type === "TSParenthesizedType") {
            collectFromTypeNode(typeNode.typeAnnotation);
            return;
          }
          if (typeNode.type === "TSIntersectionType") {
            for (const t of typeNode.types ?? []) {
              collectFromTypeNode(t);
            }
            return;
          }
          if (typeNode.type === "TSTypeLiteral" && typeNode.members) {
            for (const member of typeNode.members) {
              if (
                member.type === "TSPropertySignature" &&
                member.key?.type === "Identifier" &&
                member.key.name.startsWith("$")
              ) {
                props.push(member.key.name);
              }
            }
          }
        };
        // Look up the interface
        const interfaceDecl = root
          .find(j.TSInterfaceDeclaration)
          .filter((p) => (p.node as any).id?.name === typeName);
        if (interfaceDecl.size() > 0) {
          const body = interfaceDecl.get().node.body?.body ?? [];
          for (const member of body) {
            if (
              member.type === "TSPropertySignature" &&
              member.key?.type === "Identifier" &&
              member.key.name.startsWith("$")
            ) {
              props.push(member.key.name);
            }
          }
        }
        // Look up the type alias
        const typeAlias = root
          .find(j.TSTypeAliasDeclaration)
          .filter((p) => (p.node as any).id?.name === typeName);
        if (typeAlias.size() > 0) {
          const typeAnnotation = typeAlias.get().node.typeAnnotation;
          collectFromTypeNode(typeAnnotation);
        }
        return props;
      };

      // Find all transient props in the explicit props type
      const explicit = d.propsType;
      let transientProps: string[] = [];

      // Check if explicit type is a type literal with members
      if (explicit?.type === "TSTypeLiteral" && explicit.members) {
        for (const member of explicit.members) {
          if (
            member.type === "TSPropertySignature" &&
            member.key?.type === "Identifier" &&
            member.key.name.startsWith("$")
          ) {
            transientProps.push(member.key.name);
            // This is a wrapper-only transient prop (defined in wrapper's explicit type)
            wrapperOnlyTransientProps.push(member.key.name);
          }
        }
      }
      // Check if explicit type is a reference to an interface/type alias
      else if (explicit?.type === "TSTypeReference" && explicit.typeName?.type === "Identifier") {
        const typeName = explicit.typeName.name;
        transientProps = findTransientPropsInTypeName(typeName);
        // These are also wrapper-only transient props
        wrapperOnlyTransientProps.push(...transientProps);
      }

      // Also check the wrapped component's props type for transient props
      // This handles styled(Component) without explicit type annotation
      if (transientProps.length === 0) {
        // Look for the wrapped component's function declaration and its param type
        const funcDecls = root
          .find(j.FunctionDeclaration)
          .filter((p) => (p.node as any).id?.name === wrappedComponent);
        if (funcDecls.size() > 0) {
          const param = funcDecls.get().node.params[0] as any;
          if (param?.typeAnnotation?.typeAnnotation?.typeName?.type === "Identifier") {
            const typeName = param.typeAnnotation.typeAnnotation.typeName.name;
            transientProps = findTransientPropsInTypeName(typeName);
          }
        }
        // Also check variable declarators with arrow functions
        const varDecls = root
          .find(j.VariableDeclarator)
          .filter((p) => (p.node as any).id?.name === wrappedComponent);
        if (varDecls.size() > 0) {
          const init = varDecls.get().node.init;
          if (init?.type === "ArrowFunctionExpression" && init.params[0]) {
            const param = init.params[0] as any;
            if (param?.typeAnnotation?.typeAnnotation?.typeName?.type === "Identifier") {
              const typeName = param.typeAnnotation.typeAnnotation.typeName.name;
              transientProps = findTransientPropsInTypeName(typeName);
            }
          }
        }
      }

      // Add transient props to destructureProps if not already used for styling
      for (const prop of transientProps) {
        if (!destructureProps.includes(prop)) {
          destructureProps.push(prop);
          // Track that this prop is for filtering only, not for styling
          filterOnlyTransientProps.push(prop);
        }
      }
    }

    const propsParamId = j.identifier("props");
    let polymorphicFnTypeParams: any = null;
    if (isPolymorphicComponentWrapper && emitTypes) {
      polymorphicFnTypeParams = j(
        `function _<C extends React.ElementType = typeof ${wrappedComponent}>() { return null }`,
      ).get().node.program.body[0].typeParameters;
      (propsParamId as any).typeAnnotation = j(
        `const x: ${propsTypeNameFor(d.localName)}<C> = null`,
      ).get().node.program.body[0].declarations[0].id.typeAnnotation;
    }
    // If we extended an existing type directly, use that type name for the parameter.
    if (!isPolymorphicComponentWrapper && functionParamTypeName && emitTypes) {
      propsParamId.typeAnnotation = j.tsTypeAnnotation(
        j.tsTypeReference(j.identifier(functionParamTypeName)),
      );
    } else if (!isPolymorphicComponentWrapper) {
      annotatePropsParam(propsParamId, d.localName);
    }
    const propsId = j.identifier("props");
    const stylexPropsCall = j.callExpression(
      j.memberExpression(j.identifier("stylex"), j.identifier("props")),
      styleArgs,
    );

    // Handle both simple identifiers (Button) and member expressions (animated.div)
    let jsxTagName: any;
    if (wrappedComponent.includes(".")) {
      const parts = wrappedComponent.split(".");
      jsxTagName = j.jsxMemberExpression(
        j.jsxIdentifier(parts[0]!),
        j.jsxIdentifier(parts.slice(1).join(".")),
      );
    } else {
      jsxTagName = j.jsxIdentifier(wrappedComponent);
    }

    const defaultAttrs = d.attrsInfo?.defaultAttrs ?? [];
    const staticAttrs = d.attrsInfo?.staticAttrs ?? {};
    const needsSxVar = allowClassNameProp || allowStyleProp || !!d.inlineStyleProps?.length;
    // Only destructure when we have specific reasons: variant props or className/style support
    // Children flows through naturally via {...props} spread, no explicit handling needed
    // Attrs are handled separately (added as JSX attributes before/after the props spread)
    const needsDestructure = destructureProps.length > 0 || needsSxVar;
    const includeChildren = hasJsxChildrenUsage(d.localName);

    if (needsDestructure) {
      const childrenId = j.identifier("children");
      const classNameId = j.identifier("className");
      const styleId = j.identifier("style");
      const restId = j.identifier("rest");

      const patternProps: any[] = [
        ...(allowClassNameProp ? [patternProp("className", classNameId)] : []),
        ...(includeChildren ? [patternProp("children", childrenId)] : []),
        ...(allowStyleProp ? [patternProp("style", styleId)] : []),
        // Strip transient props ($-prefixed) from the pass-through spread (styled-components behavior)
        ...destructureProps.filter(Boolean).map((name) => patternProp(name)),
        j.restElement(restId),
      ];

      const declStmt = j.variableDeclaration("const", [
        j.variableDeclarator(j.objectPattern(patternProps as any), propsId),
      ]);

      const stmts: any[] = [declStmt];
      const sxId = j.identifier("sx");
      if (needsSxVar) {
        stmts.push(j.variableDeclaration("const", [j.variableDeclarator(sxId, stylexPropsCall)]));
      }

      const openingAttrs: any[] = [];
      // Add attrs in order: defaultAttrs, staticAttrs, then {...rest}
      // This allows props passed to the component to override attrs (styled-components semantics)
      for (const a of defaultAttrs) {
        if (typeof a.value === "string") {
          openingAttrs.push(j.jsxAttribute(j.jsxIdentifier(a.attrName), j.literal(a.value)));
        } else if (typeof a.value === "number") {
          openingAttrs.push(
            j.jsxAttribute(
              j.jsxIdentifier(a.attrName),
              j.jsxExpressionContainer(j.literal(a.value)),
            ),
          );
        } else if (typeof a.value === "boolean") {
          openingAttrs.push(
            j.jsxAttribute(
              j.jsxIdentifier(a.attrName),
              j.jsxExpressionContainer(j.booleanLiteral(a.value)),
            ),
          );
        }
      }
      // Add staticAttrs from .attrs({...}) before {...rest} so they can be overridden
      for (const [key, value] of Object.entries(staticAttrs)) {
        if (typeof value === "string") {
          openingAttrs.push(j.jsxAttribute(j.jsxIdentifier(key), j.literal(value)));
        } else if (typeof value === "number") {
          openingAttrs.push(
            j.jsxAttribute(j.jsxIdentifier(key), j.jsxExpressionContainer(j.literal(value))),
          );
        } else if (typeof value === "boolean") {
          openingAttrs.push(
            j.jsxAttribute(j.jsxIdentifier(key), j.jsxExpressionContainer(j.booleanLiteral(value))),
          );
        }
      }
      // Pass transient props used for styling back to the base component.
      // These props were destructured for styling but the base component might also need them.
      // Filter out:
      // 1. Props that are for filtering only (not used in styling)
      // 2. Props defined in the wrapper's explicit type (base doesn't accept them)
      for (const propName of destructureProps) {
        if (
          propName.startsWith("$") &&
          !filterOnlyTransientProps.includes(propName) &&
          !wrapperOnlyTransientProps.includes(propName)
        ) {
          openingAttrs.push(
            j.jsxAttribute(
              j.jsxIdentifier(propName),
              j.jsxExpressionContainer(j.identifier(propName)),
            ),
          );
        }
      }
      openingAttrs.push(j.jsxSpreadAttribute(restId));
      openingAttrs.push(j.jsxSpreadAttribute(needsSxVar ? sxId : stylexPropsCall));

      if (allowClassNameProp) {
        const mergedClassName = j.callExpression(
          j.memberExpression(
            j.callExpression(
              j.memberExpression(
                j.arrayExpression([
                  j.memberExpression(sxId, j.identifier("className")),
                  classNameId,
                ]),
                j.identifier("filter"),
              ),
              [j.identifier("Boolean")],
            ),
            j.identifier("join"),
          ),
          [j.literal(" ")],
        );
        openingAttrs.push(
          j.jsxAttribute(j.jsxIdentifier("className"), j.jsxExpressionContainer(mergedClassName)),
        );
      }

      if (allowStyleProp || (d.inlineStyleProps && d.inlineStyleProps.length)) {
        openingAttrs.push(
          j.jsxAttribute(
            j.jsxIdentifier("style"),
            j.jsxExpressionContainer(
              j.objectExpression([
                j.spreadElement(j.memberExpression(sxId, j.identifier("style")) as any),
                ...(allowStyleProp ? [j.spreadElement(styleId as any)] : []),
                ...(d.inlineStyleProps && d.inlineStyleProps.length
                  ? d.inlineStyleProps.map((p) =>
                      j.property("init", j.identifier(p.prop), p.expr as any),
                    )
                  : []),
              ]) as any,
            ),
          ),
        );
      }

      const openingEl = j.jsxOpeningElement(jsxTagName, openingAttrs, !includeChildren);
      const jsx = includeChildren
        ? j.jsxElement(openingEl, j.jsxClosingElement(jsxTagName), [
            j.jsxExpressionContainer(childrenId),
          ])
        : ({
            type: "JSXElement",
            openingElement: openingEl,
            closingElement: null,
            children: [],
          } as any);
      stmts.push(j.returnStatement(jsx as any));

      const fn = j.functionDeclaration(
        j.identifier(d.localName),
        [propsParamId],
        j.blockStatement(stmts),
      );
      if (polymorphicFnTypeParams) {
        (fn as any).typeParameters = polymorphicFnTypeParams;
      }
      emitted.push(fn);
    } else {
      // Simple case: always forward props + styles.
      const openingAttrs: any[] = [];
      for (const a of defaultAttrs) {
        if (typeof a.value === "string") {
          openingAttrs.push(j.jsxAttribute(j.jsxIdentifier(a.attrName), j.literal(a.value)));
        } else if (typeof a.value === "number") {
          openingAttrs.push(
            j.jsxAttribute(
              j.jsxIdentifier(a.attrName),
              j.jsxExpressionContainer(j.literal(a.value)),
            ),
          );
        } else if (typeof a.value === "boolean") {
          openingAttrs.push(
            j.jsxAttribute(
              j.jsxIdentifier(a.attrName),
              j.jsxExpressionContainer(j.booleanLiteral(a.value)),
            ),
          );
        }
      }
      openingAttrs.push(j.jsxSpreadAttribute(propsId));
      for (const [key, value] of Object.entries(staticAttrs)) {
        if (typeof value === "string") {
          openingAttrs.push(j.jsxAttribute(j.jsxIdentifier(key), j.literal(value)));
        } else if (typeof value === "number") {
          openingAttrs.push(
            j.jsxAttribute(j.jsxIdentifier(key), j.jsxExpressionContainer(j.literal(value))),
          );
        } else if (typeof value === "boolean") {
          openingAttrs.push(
            j.jsxAttribute(j.jsxIdentifier(key), j.jsxExpressionContainer(j.booleanLiteral(value))),
          );
        }
      }
      openingAttrs.push(j.jsxSpreadAttribute(stylexPropsCall));

      const jsx = j.jsxElement(j.jsxOpeningElement(jsxTagName, openingAttrs, true), null, []);
      const fn = j.functionDeclaration(
        j.identifier(d.localName),
        [propsParamId],
        j.blockStatement([j.returnStatement(jsx as any)]),
      );
      if (polymorphicFnTypeParams) {
        (fn as any).typeParameters = polymorphicFnTypeParams;
      }
      emitted.push(fn);
    }
  }

  if (emitted.length > 0) {
    // Re-order emitted wrapper nodes to match `wrapperDecls` source order.
    const groups = new Map<string, any[]>();
    const restNodes: any[] = [];

    const pushGroup = (name: string, node: any) => {
      groups.set(name, [...(groups.get(name) ?? []), node]);
    };

    for (const node of emitted) {
      if (node?.type === "TSTypeAliasDeclaration") {
        const name = node.id?.type === "Identifier" ? node.id.name : null;
        if (name && name.endsWith("Props")) {
          const base = name.slice(0, -5);
          if (wrapperDecls.some((d) => d.localName === base)) {
            pushGroup(base, node);
            continue;
          }
        }
        restNodes.push(node);
        continue;
      }
      if (node?.type === "FunctionDeclaration" && node.id?.type === "Identifier") {
        pushGroup(node.id.name, node);
        continue;
      }
      restNodes.push(node);
    }

    const ordered: any[] = [];
    for (const d of wrapperDecls) {
      const chunk = groups.get(d.localName);
      if (chunk?.length) {
        ordered.push(...chunk);
      }
    }
    for (const [name, chunk] of groups.entries()) {
      if (wrapperDecls.some((d) => d.localName === name)) {
        continue;
      }
      ordered.push(...chunk);
    }
    ordered.push(...restNodes);

    // Wrap function declarations in export statements for exported components
    const wrappedOrdered = ordered.map((node) => {
      if (node?.type !== "FunctionDeclaration") {
        return node;
      }
      const fnName = node.id?.name;
      if (!fnName) {
        return node;
      }
      const exportInfo = exportedComponents.get(fnName);
      if (!exportInfo) {
        return node;
      }
      // If exported via specifier (export { Button }), don't add export to the function
      // because the re-export statement is preserved and handles the export.
      if (exportInfo.isSpecifier) {
        return node;
      }
      // Move leading comments from the inner function to the outer export declaration
      // to avoid generating "export <comment> function X"
      const leadingComments = (node as any).leadingComments ?? (node as any).comments;
      if (leadingComments) {
        (node as any).leadingComments = undefined;
        (node as any).comments = undefined;
      }

      let exportNode: any;
      if (exportInfo.isDefault) {
        // Create: export default function X(...) { ... }
        exportNode = j.exportDefaultDeclaration(node);
      } else {
        // Create: export function X(...) { ... }
        exportNode = j.exportNamedDeclaration(node, [], null);
      }

      // Attach comments to the export declaration instead
      if (leadingComments) {
        exportNode.leadingComments = leadingComments;
        exportNode.comments = leadingComments;
      }

      return exportNode;
    });

    // Replace each styled declaration in-place with its wrapper function.
    // This preserves the original position of components in the file.
    for (const d of wrapperDecls) {
      const wrapperNodes = wrappedOrdered.filter((node: any) => {
        if (node?.type === "FunctionDeclaration") {
          return node.id?.name === d.localName;
        }
        if (node?.type === "ExportNamedDeclaration" || node?.type === "ExportDefaultDeclaration") {
          const decl = node.declaration;
          return decl?.type === "FunctionDeclaration" && decl.id?.name === d.localName;
        }
        if (node?.type === "TSTypeAliasDeclaration") {
          const name = node.id?.name;
          return name === `${d.localName}Props`;
        }
        return false;
      });

      if (wrapperNodes.length === 0) {
        continue;
      }

      // Find the original styled declaration
      const styledDecl = root
        .find(j.VariableDeclaration)
        .filter((p: any) =>
          p.node.declarations.some(
            (dcl: any) =>
              dcl.type === "VariableDeclarator" &&
              dcl.id?.type === "Identifier" &&
              dcl.id.name === d.localName,
          ),
        );

      if (styledDecl.size() > 0) {
        // Check if it's inside an export declaration
        const firstPath = styledDecl.paths()[0];
        const parent = firstPath?.parentPath;
        if (parent && parent.node?.type === "ExportNamedDeclaration") {
          // Replace the export declaration
          j(parent).replaceWith(wrapperNodes);
        } else {
          // Replace the variable declaration
          styledDecl.at(0).replaceWith(wrapperNodes);
        }
      }
    }

    // Insert any remaining nodes (types not associated with a specific wrapper) before styles
    const insertedNames = new Set(wrapperDecls.map((d) => d.localName));
    const remainingNodes = wrappedOrdered.filter((node: any) => {
      if (node?.type === "FunctionDeclaration") {
        return !insertedNames.has(node.id?.name);
      }
      if (node?.type === "ExportNamedDeclaration" || node?.type === "ExportDefaultDeclaration") {
        const decl = node.declaration;
        return !(decl?.type === "FunctionDeclaration" && insertedNames.has(decl.id?.name));
      }
      if (node?.type === "TSTypeAliasDeclaration") {
        const name = node.id?.name;
        if (name?.endsWith("Props")) {
          const base = name.slice(0, -5);
          return !insertedNames.has(base);
        }
      }
      return true;
    });

    if (remainingNodes.length > 0) {
      root
        .find(j.VariableDeclaration)
        .filter((p: any) =>
          p.node.declarations.some(
            (dcl: any) => dcl.type === "VariableDeclarator" && (dcl.id as any)?.name === "styles",
          ),
        )
        .at(0)
        .insertBefore(remainingNodes);
    }
  }

  if (emitTypes && needsReactTypeImport) {
    const hasReactBinding =
      root
        .find(j.ImportDeclaration)
        .filter((p: any) => (p.node?.source as any)?.value === "react")
        .filter((p: any) =>
          (p.node.specifiers ?? []).some(
            (s: any) =>
              (s.type === "ImportDefaultSpecifier" || s.type === "ImportNamespaceSpecifier") &&
              s.local?.type === "Identifier" &&
              s.local.name === "React",
          ),
        )
        .size() > 0;

    if (!hasReactBinding) {
      const firstImport = root.find(j.ImportDeclaration).at(0);
      const reactImport = j.importDeclaration(
        [j.importNamespaceSpecifier(j.identifier("React"))],
        j.literal("react"),
      ) as any;

      if (firstImport.size() > 0) {
        firstImport.insertBefore(reactImport);
      } else {
        root.get().node.program.body.unshift(reactImport);
      }
    }
  }
}
