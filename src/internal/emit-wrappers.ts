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

/**
 * Generates a minimal wrapper component that only destructures the necessary props
 * and applies stylex.props() directly without className/style/rest merging.
 * Uses props.children directly instead of destructuring it.
 */
function emitMinimalWrapper(args: {
  j: any;
  localName: string;
  tagName: string;
  propsTypeName: string;
  emitTypes: boolean;
  styleArgs: any[];
  destructureProps: string[];
  patternProp: (keyName: string, valueId?: any) => any;
}): any[] {
  const {
    j,
    localName,
    tagName,
    propsTypeName,
    emitTypes,
    styleArgs,
    destructureProps,
    patternProp,
  } = args;
  const isVoidTag = VOID_TAGS.has(tagName);
  const propsParamId = j.identifier("props");
  if (emitTypes) {
    (propsParamId as any).typeAnnotation = j.tsTypeAnnotation(
      j.tsTypeReference(j.identifier(propsTypeName)),
    );
  }
  const propsId = j.identifier("props");

  // Build destructure pattern for dynamic props only (not children)
  const patternProps: any[] = destructureProps.filter(Boolean).map((name) => patternProp(name));

  const stylexPropsCall = j.callExpression(
    j.memberExpression(j.identifier("stylex"), j.identifier("props")),
    styleArgs,
  );

  const openingEl = j.jsxOpeningElement(
    j.jsxIdentifier(tagName),
    [j.jsxSpreadAttribute(stylexPropsCall)],
    false,
  );

  // Use props.children directly
  const propsChildren = j.memberExpression(propsId, j.identifier("children"));

  const jsx = isVoidTag
    ? ({
        type: "JSXElement",
        openingElement: { ...openingEl, selfClosing: true },
        closingElement: null,
        children: [],
      } as any)
    : j.jsxElement(openingEl, j.jsxClosingElement(j.jsxIdentifier(tagName)), [
        j.jsxExpressionContainer(propsChildren),
      ]);

  // Only emit destructure statement if there are props to destructure
  const bodyStmts: any[] = [];
  if (patternProps.length > 0) {
    bodyStmts.push(
      j.variableDeclaration("const", [
        j.variableDeclarator(j.objectPattern(patternProps as any), propsId),
      ]),
    );
  }
  bodyStmts.push(j.returnStatement(jsx as any));

  const result: any[] = [
    j.functionDeclaration(j.identifier(localName), [propsParamId], j.blockStatement(bodyStmts)),
  ];

  return result;
}

type ExportInfo = { exportName: string; isDefault: boolean };

export function emitWrappers(args: {
  root: Collection<any>;
  j: any;
  filePath: string;
  styledDecls: StyledDecl[];
  wrapperNames: Set<string>;
  patternProp: (keyName: string, valueId?: any) => any;
  exportedComponents: Map<string, ExportInfo>;
}): void {
  const { root, j, filePath, styledDecls, wrapperNames, patternProp, exportedComponents } = args;

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

  const inputWrapperDecls = wrapperDecls.filter(
    (d) =>
      d.base.kind === "intrinsic" && d.base.tagName === "input" && d.attrWrapper?.kind === "input",
  );
  const linkWrapperDecls = wrapperDecls.filter(
    (d) => d.base.kind === "intrinsic" && d.base.tagName === "a" && d.attrWrapper?.kind === "link",
  );
  const buttonPolymorphicWrapperDecls = wrapperDecls.filter(
    (d) =>
      d.base.kind === "intrinsic" &&
      d.base.tagName === "button" &&
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

  const emitNamedPropsType = (localName: string, typeExprText: string): void => {
    if (!emitTypes) {
      return;
    }
    const typeName = propsTypeNameFor(localName);
    if (typeExprText.trim() === typeName) {
      return;
    }
    const stmt = j(`${`type ${typeName} = ${typeExprText};`}`).get().node.program.body[0];
    emitted.push(stmt);
  };

  const annotatePropsParam = (propsId: any, localName: string): void => {
    if (!emitTypes) {
      return;
    }
    (propsId as any).typeAnnotation = j.tsTypeAnnotation(
      j.tsTypeReference(j.identifier(propsTypeNameFor(localName))),
    );
  };

  const withChildren = (innerTypeText: string): string => {
    const t = innerTypeText.trim();
    if (t.startsWith("React.PropsWithChildren<")) {
      return t;
    }
    // `React.ComponentProps<...>` already includes `children`, so wrapping it is redundant.
    // Keep the type as-is to avoid noisy `PropsWithChildren<...>` wrappers.
    if (t.startsWith("React.ComponentProps<") || t.startsWith("React.ComponentPropsWithoutRef<")) {
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

  const isPropRequiredInPropsTypeLiteral = (propsType: any, propName: string): boolean => {
    if (!propsType || propsType.type !== "TSTypeLiteral") {
      return false;
    }
    for (const m of propsType.members ?? []) {
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
    return false;
  };

  if (inputWrapperDecls.length > 0) {
    for (const d of inputWrapperDecls) {
      const explicit = stringifyTsType(d.propsType);
      emitNamedPropsType(d.localName, explicit ?? "React.InputHTMLAttributes<HTMLInputElement>");
      needsReactTypeImport = true;

      const aw = d.attrWrapper!;
      const styleArgs: any[] = [
        j.memberExpression(j.identifier("styles"), j.identifier(d.styleKey)),
        ...(aw.checkboxKey
          ? [
              j.logicalExpression(
                "&&",
                j.binaryExpression("===", j.identifier("type"), j.literal("checkbox")),
                j.memberExpression(j.identifier("styles"), j.identifier(aw.checkboxKey)),
              ),
            ]
          : []),
        ...(aw.radioKey
          ? [
              j.logicalExpression(
                "&&",
                j.binaryExpression("===", j.identifier("type"), j.literal("radio")),
                j.memberExpression(j.identifier("styles"), j.identifier(aw.radioKey)),
              ),
            ]
          : []),
      ];

      emitted.push(
        emitTypes
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
            ` as any),
      );
    }
  }

  if (linkWrapperDecls.length > 0) {
    for (const d of linkWrapperDecls) {
      const explicit = stringifyTsType(d.propsType);
      emitNamedPropsType(
        d.localName,
        explicit ?? withChildren("React.AnchorHTMLAttributes<HTMLAnchorElement>"),
      );
      needsReactTypeImport = true;

      const aw = d.attrWrapper!;
      const base = j.memberExpression(j.identifier("styles"), j.identifier(d.styleKey));
      const styleArgs: any[] = [
        base,
        ...(aw.externalKey
          ? [
              j.logicalExpression(
                "&&",
                j.identifier("isExternal"),
                j.memberExpression(j.identifier("styles"), j.identifier(aw.externalKey)),
              ),
            ]
          : []),
        ...(aw.httpsKey
          ? [
              j.logicalExpression(
                "&&",
                j.identifier("isHttps"),
                j.memberExpression(j.identifier("styles"), j.identifier(aw.httpsKey)),
              ),
            ]
          : []),
        ...(aw.pdfKey
          ? [
              j.logicalExpression(
                "&&",
                j.identifier("isPdf"),
                j.memberExpression(j.identifier("styles"), j.identifier(aw.pdfKey)),
              ),
            ]
          : []),
      ];

      emitted.push(
        emitTypes
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
            ` as any),
      );
    }
  }

  if (buttonPolymorphicWrapperDecls.length > 0) {
    for (const d of buttonPolymorphicWrapperDecls) {
      const explicit = stringifyTsType(d.propsType);
      emitNamedPropsType(
        d.localName,
        explicit ??
          withChildren(
            "React.ButtonHTMLAttributes<HTMLButtonElement> & { as?: React.ElementType; forwardedAs?: React.ElementType; href?: string }",
          ),
      );
      needsReactTypeImport = true;

      const styleArgs: any[] = [
        ...(d.extendsStyleKey
          ? [j.memberExpression(j.identifier("styles"), j.identifier(d.extendsStyleKey))]
          : []),
        j.memberExpression(j.identifier("styles"), j.identifier(d.styleKey)),
      ];
      const stylexPropsCall = j.callExpression(
        j.memberExpression(j.identifier("stylex"), j.identifier("props")),
        styleArgs,
      );

      emitted.push(
        emitTypes
          ? (j.template.statement`
              function ${j.identifier(d.localName)}(props: ${j.identifier(propsTypeNameFor(d.localName))}) {
                const { as: Component = "button", forwardedAs: _forwardedAs, children, ...rest } = props;
              return (
                  <Component {...${stylexPropsCall}} {...rest}>
                  {children}
                </Component>
              );
            }
            ` as any)
          : (j.template.statement`
              function ${j.identifier(d.localName)}(props) {
                const { as: Component = "button", forwardedAs: _forwardedAs, children, ...rest } = props;
                return (
                  <Component {...${stylexPropsCall}} {...rest}>
                    {children}
                  </Component>
                );
              }
            ` as any),
      );
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
        emitNamedPropsType(d.localName, explicit);
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
      const classNameId = j.identifier("className");
      const restId = j.identifier("rest");

      const declStmt = j.variableDeclaration("const", [
        j.variableDeclarator(
          j.objectPattern([
            patternProp(propName, variantId),
            patternProp("children", childrenId),
            patternProp("className", classNameId),
            j.restElement(restId),
          ] as any),
          propsId,
        ),
      ]);

      const base = j.memberExpression(j.identifier("styles"), j.identifier(baseKey));
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
              j.memberExpression(j.identifier("styles"), j.identifier(primary.styleKey)),
            ),
            j.logicalExpression(
              "&&",
              condSecondary as any,
              j.memberExpression(j.identifier("styles"), j.identifier(secondary.styleKey)),
            ),
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
  }

  // Generic wrappers for `withConfig({ shouldForwardProp })` cases.
  for (const d of shouldForwardPropWrapperDecls) {
    if (d.base.kind !== "intrinsic") {
      continue;
    }
    const tagName = d.base.tagName;
    const supportsExternalStyles = d.supportsExternalStyles ?? false;

    const extraProps = new Set<string>();
    for (const p of d.shouldForwardProp?.dropProps ?? []) {
      if (p) {
        extraProps.add(p);
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
    const shouldUseIntrinsicProps = (() => {
      if (supportsExternalStyles) {
        return true;
      }
      if (usedAttrs.has("*")) {
        return true;
      }
      // If any non-transient attribute is passed at call-sites, prefer intrinsic props.
      for (const n of usedAttrs) {
        if (extraProps.has(n)) {
          continue;
        }
        // `as` is only relevant for polymorphic wrappers (handled elsewhere).
        if (n === "as" || n === "forwardedAs") {
          continue;
        }
        return true;
      }
      return false;
    })();
    const rawBaseTypeText = shouldUseIntrinsicProps
      ? `React.ComponentProps<${JSON.stringify(tagName)}>`
      : "{}";
    const composedInner = joinIntersection(rawBaseTypeText, extrasTypeText);
    const finalTypeText = VOID_TAGS.has(tagName) ? composedInner : withChildren(composedInner);

    emitNamedPropsType(d.localName, finalTypeText);
    needsReactTypeImport = true;

    // Build style arguments: base + extends + dynamic variants (as conditional expressions).
    const styleArgs: any[] = [
      ...(d.extendsStyleKey
        ? [j.memberExpression(j.identifier("styles"), j.identifier(d.extendsStyleKey))]
        : []),
      j.memberExpression(j.identifier("styles"), j.identifier(d.styleKey)),
    ];

    // Variant buckets are keyed by expression strings (e.g. `size === \"large\"`).
    if (d.variantStyleKeys) {
      for (const [when, variantKey] of Object.entries(d.variantStyleKeys)) {
        // Parse the supported expression subset into AST:
        // - "prop" / "!prop"
        // - "prop === \"x\"" / "prop !== \"x\""
        let cond: any = null;
        const trimmed = when.trim();
        if (trimmed.startsWith("!(") && trimmed.endsWith(")")) {
          // Not expected here (neg variants are merged into base), but handle anyway.
          const inner = trimmed.slice(2, -1).trim();
          cond = j.unaryExpression("!", j.identifier(inner));
        } else if (trimmed.startsWith("!")) {
          cond = j.unaryExpression("!", j.identifier(trimmed.slice(1)));
        } else if (trimmed.includes("===") || trimmed.includes("!==")) {
          const op = trimmed.includes("!==") ? "!==" : "===";
          const [lhs, rhsRaw0] = trimmed.split(op).map((s) => s.trim());
          const rhsRaw = rhsRaw0 ?? "";
          const rhs =
            rhsRaw?.startsWith('"') || rhsRaw?.startsWith("'")
              ? j.literal(JSON.parse(rhsRaw.replace(/^'/, '"').replace(/'$/, '"')))
              : /^-?\d+(\.\d+)?$/.test(rhsRaw)
                ? j.literal(Number(rhsRaw))
                : j.identifier(rhsRaw);
          cond = j.binaryExpression(op, j.identifier(lhs ?? ""), rhs);
        } else {
          cond = j.identifier(trimmed);
        }
        styleArgs.push(
          j.logicalExpression(
            "&&",
            cond,
            j.memberExpression(j.identifier("styles"), j.identifier(variantKey)),
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
        j.memberExpression(j.identifier("styles"), j.identifier(p.fnKey)),
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
    const shouldOmitRestSpread =
      !dropPrefix &&
      dropProps.length > 0 &&
      dropProps.every((p) => p.startsWith("$")) &&
      !usedAttrs.has("*") &&
      [...usedAttrs].every((n) => n === "children" || dropProps.includes(n));

    // When supportsExternalStyles is false, still forward non-filtered props (`href`, event handlers, etc).
    // We just skip className/style merging and external style extension.
    if (!supportsExternalStyles) {
      const isVoid = VOID_TAGS.has(tagName);
      const patternProps: any[] = [
        ...(isVoid ? [] : [patternProp("children", childrenId)]),
        // Pull out `className` so it doesn't override StyleX's `className` string.
        patternProp("className", classNameId),
        // Pull out `style` so it doesn't override StyleX's `style` object.
        patternProp("style", styleId),
        ...destructureParts.filter(Boolean).map((name) => patternProp(name)),
        ...(shouldOmitRestSpread ? [] : [j.restElement(restId)]),
      ];
      const declStmt = j.variableDeclaration("const", [
        j.variableDeclarator(j.objectPattern(patternProps as any), propsId),
      ]);

      const cleanupPrefixStmt =
        dropPrefix && shouldAllowAnyPrefixProps
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

      const stylexPropsCall = j.callExpression(
        j.memberExpression(j.identifier("stylex"), j.identifier("props")),
        styleArgs,
      );

      const sxDecl = j.variableDeclaration("const", [
        j.variableDeclarator(j.identifier("sx"), stylexPropsCall),
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
          ...(d.inlineStyleProps && d.inlineStyleProps.length
            ? [
                j.jsxAttribute(
                  j.jsxIdentifier("style"),
                  j.jsxExpressionContainer(
                    j.objectExpression([
                      j.spreadElement(
                        j.memberExpression(j.identifier("sx"), j.identifier("style")) as any,
                      ),
                      j.spreadElement(styleId as any),
                      ...d.inlineStyleProps.map((p) =>
                        j.property("init", j.identifier(p.prop), p.expr as any),
                      ),
                    ]) as any,
                  ),
                ),
              ]
            : [
                j.jsxAttribute(
                  j.jsxIdentifier("style"),
                  j.jsxExpressionContainer(
                    j.objectExpression([
                      j.spreadElement(
                        j.memberExpression(j.identifier("sx"), j.identifier("style")) as any,
                      ),
                      j.spreadElement(styleId as any),
                    ]) as any,
                  ),
                ),
              ]),
          ...(shouldOmitRestSpread ? [] : [j.jsxSpreadAttribute(restId)]),
        ],
        false,
      );
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
        j.functionDeclaration(
          j.identifier(d.localName),
          [propsParamId],
          j.blockStatement(fnBodyStmts),
        ),
      );
      continue;
    }

    const patternProps: any[] = [
      patternProp("className", classNameId),
      // Pull out `children` for non-void elements so we don't forward it as an attribute.
      ...(isVoidTag ? [] : [patternProp("children", childrenId)]),
      patternProp("style", styleId),
      ...destructureParts.filter(Boolean).map((name) => patternProp(name)),
      ...(shouldOmitRestSpread ? [] : [j.restElement(restId)]),
    ];

    const declStmt = j.variableDeclaration("const", [
      j.variableDeclarator(j.objectPattern(patternProps as any), propsId),
    ]);

    const cleanupPrefixStmt =
      dropPrefix && shouldAllowAnyPrefixProps
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
        ...(d.inlineStyleProps && d.inlineStyleProps.length
          ? [
              j.jsxAttribute(
                j.jsxIdentifier("style"),
                j.jsxExpressionContainer(
                  j.objectExpression([
                    j.spreadElement(
                      j.memberExpression(j.identifier("sx"), j.identifier("style")) as any,
                    ),
                    j.spreadElement(styleId as any),
                    ...d.inlineStyleProps.map((p) =>
                      j.property("init", j.identifier(p.prop), p.expr as any),
                    ),
                  ]) as any,
                ),
              ),
            ]
          : [
              j.jsxAttribute(
                j.jsxIdentifier("style"),
                j.jsxExpressionContainer(
                  j.objectExpression([
                    j.spreadElement(
                      j.memberExpression(j.identifier("sx"), j.identifier("style")) as any,
                    ),
                    j.spreadElement(styleId as any),
                  ]) as any,
                ),
              ),
            ]),
        ...(shouldOmitRestSpread ? [] : [j.jsxSpreadAttribute(restId)]),
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

    const fnBodyStmts: any[] = [declStmt];
    if (cleanupPrefixStmt) {
      fnBodyStmts.push(cleanupPrefixStmt);
    }
    fnBodyStmts.push(sxDecl);
    fnBodyStmts.push(j.returnStatement(jsx as any));

    emitted.push(
      j.functionDeclaration(
        j.identifier(d.localName),
        [propsParamId],
        j.blockStatement(fnBodyStmts),
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
        ? `React.ComponentProps<${JSON.stringify(tagName)}>`
        : "{}";
      emitNamedPropsType(
        d.localName,
        explicit ?? (VOID_TAGS.has(tagName) ? baseTypeText : withChildren(baseTypeText)),
      );
      needsReactTypeImport = true;
    }
    const styleArgs: any[] = [
      ...(d.extendsStyleKey
        ? [j.memberExpression(j.identifier("styles"), j.identifier(d.extendsStyleKey))]
        : []),
      j.memberExpression(j.identifier("styles"), j.identifier(d.styleKey)),
    ];

    const propsParamId = j.identifier("props");
    annotatePropsParam(propsParamId, d.localName);
    const propsId = j.identifier("props");
    const classNameId = j.identifier("className");
    const childrenId = j.identifier("children");
    const styleId = j.identifier("style");
    const restId = j.identifier("rest");

    const isVoidTag = VOID_TAGS.has(tagName);

    // When supportsExternalStyles is false, generate minimal wrapper
    if (!supportsExternalStyles) {
      emitted.push(
        ...emitMinimalWrapper({
          j,
          localName: d.localName,
          tagName,
          propsTypeName: propsTypeNameFor(d.localName),
          emitTypes,
          styleArgs,
          destructureProps: [],
          patternProp,
        }),
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
      j.functionDeclaration(
        j.identifier(d.localName),
        [propsParamId],
        j.blockStatement([declStmt, sxDecl, j.returnStatement(jsx as any)]),
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
      emitNamedPropsType(
        d.localName,
        explicit ?? withChildren(`React.HTMLAttributes<HTMLDivElement> & ${extraType}`),
      );
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
          j.memberExpression(j.identifier("styles"), j.identifier(d.styleKey)),
          j.logicalExpression(
            "&&",
            adjId as any,
            j.memberExpression(j.identifier("styles"), j.identifier(sw.adjacentKey)),
          ),
          ...(sw.afterKey && sw.propAfter
            ? [
                j.logicalExpression(
                  "&&",
                  afterId as any,
                  j.memberExpression(j.identifier("styles"), j.identifier(sw.afterKey)),
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
    const tagName = d.base.tagName;
    // Skip specialized wrapper categories
    if (tagName === "button" && wrapperNames.has(d.localName)) {
      return false;
    }
    if (tagName === "input" || tagName === "a") {
      return false;
    }
    return true;
  });

  for (const d of simpleExportedIntrinsicWrappers) {
    if (d.base.kind !== "intrinsic") {
      continue;
    }
    const tagName = d.base.tagName;
    const supportsExternalStyles = d.supportsExternalStyles ?? false;
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
        return used.size > 0;
      })();
      const baseTypeText = shouldUseIntrinsicProps
        ? `React.ComponentProps<${JSON.stringify(tagName)}>`
        : "{}";
      emitNamedPropsType(
        d.localName,
        explicit ?? (VOID_TAGS.has(tagName) ? baseTypeText : withChildren(baseTypeText)),
      );
      needsReactTypeImport = true;
    }
    const styleArgs: any[] = [
      ...(d.extendsStyleKey
        ? [j.memberExpression(j.identifier("styles"), j.identifier(d.extendsStyleKey))]
        : []),
      j.memberExpression(j.identifier("styles"), j.identifier(d.styleKey)),
    ];

    // If external styles are enabled, generate wrapper that merges className/style/rest.
    // Otherwise, keep the minimal wrapper.
    if (!supportsExternalStyles) {
      emitted.push(
        ...emitMinimalWrapper({
          j,
          localName: d.localName,
          tagName,
          propsTypeName: propsTypeNameFor(d.localName),
          emitTypes,
          styleArgs,
          destructureProps: [],
          patternProp,
        }),
      );
      continue;
    }

    const propsParamId = j.identifier("props");
    annotatePropsParam(propsParamId, d.localName);
    const propsId = j.identifier("props");
    const classNameId = j.identifier("className");
    const childrenId = j.identifier("children");
    const styleId = j.identifier("style");
    const restId = j.identifier("rest");

    const isVoidTag = VOID_TAGS.has(tagName);

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
      j.functionDeclaration(
        j.identifier(d.localName),
        [propsParamId],
        j.blockStatement([declStmt, sxDecl, j.returnStatement(jsx as any)]),
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
    {
      const explicit = stringifyTsType(d.propsType);
      emitNamedPropsType(
        d.localName,
        explicit ?? withChildren(`React.ComponentProps<typeof ${wrappedComponent}>`),
      );
      needsReactTypeImport = true;
    }
    const styleArgs: any[] = [
      ...(d.extendsStyleKey
        ? [j.memberExpression(j.identifier("styles"), j.identifier(d.extendsStyleKey))]
        : []),
      j.memberExpression(j.identifier("styles"), j.identifier(d.styleKey)),
    ];

    const propsParamId = j.identifier("props");
    annotatePropsParam(propsParamId, d.localName);
    const propsId = j.identifier("props");
    const stylexPropsCall = j.callExpression(
      j.memberExpression(j.identifier("stylex"), j.identifier("props")),
      styleArgs,
    );

    // Create: <WrappedComponent {...props} {...stylex.props(styles.key)} />
    const jsx = j.jsxElement(
      j.jsxOpeningElement(
        j.jsxIdentifier(wrappedComponent),
        [j.jsxSpreadAttribute(propsId), j.jsxSpreadAttribute(stylexPropsCall)],
        true,
      ),
      null,
      [],
    );

    emitted.push(
      j.functionDeclaration(
        j.identifier(d.localName),
        [propsParamId],
        j.blockStatement([j.returnStatement(jsx as any)]),
      ),
    );
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
      if (exportInfo.isDefault) {
        // Create: export default function X(...) { ... }
        return j.exportDefaultDeclaration(node);
      }
      // Create: export function X(...) { ... }
      return j.exportNamedDeclaration(node, [], null);
    });

    root
      .find(j.VariableDeclaration)
      .filter((p: any) =>
        p.node.declarations.some(
          (dcl: any) => dcl.type === "VariableDeclarator" && (dcl.id as any)?.name === "styles",
        ),
      )
      .at(0)
      .insertAfter(wrappedOrdered);
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
