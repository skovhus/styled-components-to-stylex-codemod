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
  styleArgs: any[];
  destructureProps: string[];
  displayName: string | undefined;
  patternProp: (keyName: string, valueId?: any) => any;
}): any[] {
  const { j, localName, tagName, styleArgs, destructureProps, displayName, patternProp } = args;
  const isVoidTag = VOID_TAGS.has(tagName);
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
    j.functionDeclaration(j.identifier(localName), [propsId], j.blockStatement(bodyStmts)),
  ];

  if (displayName) {
    result.push(
      j.expressionStatement(
        j.assignmentExpression(
          "=",
          j.memberExpression(j.identifier(localName), j.identifier("displayName")),
          j.literal(displayName),
        ),
      ),
    );
  }

  return result;
}

export function emitWrappers(args: {
  root: Collection<any>;
  j: any;
  styledDecls: StyledDecl[];
  wrapperNames: Set<string>;
  patternProp: (keyName: string, valueId?: any) => any;
}): void {
  const { root, j, styledDecls, wrapperNames, patternProp } = args;

  const wrapperDecls = styledDecls.filter((d) => d.needsWrapperComponent);
  if (wrapperDecls.length === 0) {
    return;
  }

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
  const forceReactImport =
    wrapperDecls.some((d) => d.withConfig?.displayName || d.withConfig?.componentId) || false;

  if (inputWrapperDecls.length > 0) {
    emitted.push(
      j.template.statement`
          interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}
        ` as any,
    );

    for (const d of inputWrapperDecls) {
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
        j.template.statement`
            function ${j.identifier(d.localName)}(props: InputProps) {
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
          ` as any,
      );
    }
  }

  if (linkWrapperDecls.length > 0) {
    emitted.push(
      j.template.statement`
          interface LinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
            children?: React.ReactNode;
          }
        ` as any,
    );

    for (const d of linkWrapperDecls) {
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
        j.template.statement`
            function ${j.identifier(
              d.localName,
            )}({ href, target, className, children, ...props }: LinkProps) {
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
                  {...props}
                >
                  {children}
                </a>
              );
            }
          ` as any,
      );
    }
  }

  if (buttonPolymorphicWrapperDecls.length > 0) {
    emitted.push(
      j.template.statement`
          interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
            as?: React.ElementType;
            href?: string;
          }
        ` as any,
    );

    for (const d of buttonPolymorphicWrapperDecls) {
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
        j.template.statement`
            function ${j.identifier(d.localName)}({
              as: Component = "button",
              children,
              ...props
            }: ButtonProps & { children?: React.ReactNode }) {
              return (
                <Component {...${stylexPropsCall}} {...props}>
                  {children}
                </Component>
              );
            }
          ` as any,
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
          [propsId],
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
        ? j.memberExpression(j.identifier("props"), j.literal(p.jsxProp), true)
        : j.identifier(p.jsxProp);
      styleArgs.push(
        j.logicalExpression(
          "&&",
          propExpr as any,
          j.callExpression(j.memberExpression(j.identifier("styles"), j.identifier(p.fnKey)), [
            propExpr as any,
          ]),
        ),
      );
    }

    // Determine prop keys to strip: explicit drops + prefix drops.
    const dropProps = d.shouldForwardProp?.dropProps ?? [];
    const dropPrefix = d.shouldForwardProp?.dropPrefix;

    const destructureParts: string[] = [];
    for (const p of dropProps) {
      destructureParts.push(p);
    }
    if (dropPrefix) {
      // For prefix drops (e.g. "$"), we can't statically destructure all keys.
      // We'll remove them from rest via runtime loop in the wrapper.
    }

    // Emit wrapper function that merges className and strips props.
    // Build AST explicitly (avoid recast printer crashes from template interpolation).
    const propsId = j.identifier("props");
    const classNameId = j.identifier("className");
    const childrenId = j.identifier("children");
    const styleId = j.identifier("style");
    const restId = j.identifier("rest");
    const isVoidTag = tagName === "input";
    const omitRestSpreadForTransientProps =
      !dropPrefix && dropProps.length > 0 && dropProps.every((p) => p.startsWith("$"));

    // When supportsExternalStyles is false, generate minimal wrapper without className/style/rest merging
    if (!supportsExternalStyles) {
      emitted.push(
        ...emitMinimalWrapper({
          j,
          localName: d.localName,
          tagName,
          styleArgs,
          destructureProps: destructureParts,
          displayName: d.withConfig?.displayName,
          patternProp,
        }),
      );
      continue;
    }

    const patternProps: any[] = [
      patternProp("className", classNameId),
      // Pull out `children` for non-void elements so we don't forward it as an attribute.
      ...(isVoidTag ? [] : [patternProp("children", childrenId)]),
      patternProp("style", styleId),
      ...destructureParts.filter(Boolean).map((name) => patternProp(name)),
      ...(omitRestSpreadForTransientProps ? [] : [j.restElement(restId)]),
    ];

    const declStmt = j.variableDeclaration("const", [
      j.variableDeclarator(j.objectPattern(patternProps as any), propsId),
    ]);

    const cleanupPrefixStmt = dropPrefix
      ? (j.forOfStatement(
          j.variableDeclaration("const", [j.variableDeclarator(j.identifier("k"), null as any)]),
          j.callExpression(j.memberExpression(j.identifier("Object"), j.identifier("keys")), [
            restId,
          ]),
          j.blockStatement([
            j.ifStatement(
              j.callExpression(j.memberExpression(j.identifier("k"), j.identifier("startsWith")), [
                j.literal(dropPrefix),
              ]),
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
        ...(omitRestSpreadForTransientProps ? [] : [j.jsxSpreadAttribute(restId)]),
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
      j.functionDeclaration(j.identifier(d.localName), [propsId], j.blockStatement(fnBodyStmts)),
    );

    const displayName = d.withConfig?.displayName;
    if (displayName) {
      emitted.push(
        j.expressionStatement(
          j.assignmentExpression(
            "=",
            j.memberExpression(j.identifier(d.localName), j.identifier("displayName")),
            j.literal(displayName),
          ),
        ),
      );
    }
  }

  // Simple wrappers for `withConfig({ displayName/componentId })` cases where we just want to
  // preserve a component boundary (and optionally set `.displayName`) without prop filtering.
  const simpleWithConfigWrappers = wrapperDecls.filter((d) => {
    if (d.base.kind !== "intrinsic") {
      return false;
    }
    const tagName = d.base.tagName;
    if (!(d.withConfig?.displayName || d.withConfig?.componentId)) {
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
    const displayName = d.withConfig?.displayName;
    const supportsExternalStyles = d.supportsExternalStyles ?? false;
    const styleArgs: any[] = [
      ...(d.extendsStyleKey
        ? [j.memberExpression(j.identifier("styles"), j.identifier(d.extendsStyleKey))]
        : []),
      j.memberExpression(j.identifier("styles"), j.identifier(d.styleKey)),
    ];

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
          styleArgs,
          destructureProps: [],
          displayName,
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
        [propsId],
        j.blockStatement([declStmt, sxDecl, j.returnStatement(jsx as any)]),
      ),
    );

    if (displayName) {
      emitted.push(
        j.expressionStatement(
          j.assignmentExpression(
            "=",
            j.memberExpression(j.identifier(d.localName), j.identifier("displayName")),
            j.literal(displayName),
          ),
        ),
      );
    }
  }

  // Sibling selector wrappers (Thing + variants)
  const siblingWrappers = wrapperDecls.filter((d) => d.siblingWrapper);
  for (const d of siblingWrappers) {
    if (d.base.kind !== "intrinsic" || d.base.tagName !== "div") {
      continue;
    }
    const sw = d.siblingWrapper!;

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
        [propsId],
        j.blockStatement([declStmt, sxDecl, j.returnStatement(jsx as any)]),
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

    const firstInputWrapper = inputWrapperDecls[0]?.localName;
    const firstLinkWrapper = linkWrapperDecls[0]?.localName;
    const firstButtonWrapper = buttonPolymorphicWrapperDecls[0]?.localName;

    for (const node of emitted) {
      if (node?.type === "TSInterfaceDeclaration") {
        const name = node.id?.type === "Identifier" ? node.id.name : null;
        if (name === "InputProps" && firstInputWrapper) {
          pushGroup(firstInputWrapper, node);
          continue;
        }
        if (name === "LinkProps" && firstLinkWrapper) {
          pushGroup(firstLinkWrapper, node);
          continue;
        }
        if (name === "ButtonProps" && firstButtonWrapper) {
          pushGroup(firstButtonWrapper, node);
          continue;
        }
        restNodes.push(node);
        continue;
      }
      if (node?.type === "FunctionDeclaration" && node.id?.type === "Identifier") {
        pushGroup(node.id.name, node);
        continue;
      }
      if (
        node?.type === "ExpressionStatement" &&
        node.expression?.type === "AssignmentExpression" &&
        node.expression.left?.type === "MemberExpression" &&
        node.expression.left.object?.type === "Identifier" &&
        node.expression.left.property?.type === "Identifier" &&
        node.expression.left.property.name === "displayName"
      ) {
        pushGroup(node.expression.left.object.name, node);
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

    root
      .find(j.VariableDeclaration)
      .filter((p: any) =>
        p.node.declarations.some(
          (dcl: any) => dcl.type === "VariableDeclarator" && (dcl.id as any)?.name === "styles",
        ),
      )
      .at(0)
      .insertAfter(ordered);
  }

  if (forceReactImport) {
    const hasReactImport =
      root
        .find(j.ImportDeclaration, { source: { value: "react" } } as any)
        .filter((p: any) =>
          (p.node.specifiers ?? []).some(
            (s: any) =>
              (s.type === "ImportDefaultSpecifier" || s.type === "ImportNamespaceSpecifier") &&
              s.local?.type === "Identifier" &&
              s.local.name === "React",
          ),
        )
        .size() > 0;
    if (!hasReactImport) {
      const firstImport = root.find(j.ImportDeclaration).at(0);
      const reactImport = j.importDeclaration(
        [j.importDefaultSpecifier(j.identifier("React"))],
        j.literal("react"),
      );
      if (firstImport.size() > 0) {
        firstImport.insertBefore(reactImport);
      } else {
        root.get().node.program.body.unshift(reactImport);
      }
    }
  }
}
