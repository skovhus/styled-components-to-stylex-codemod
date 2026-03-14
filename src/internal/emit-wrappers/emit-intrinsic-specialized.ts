/**
 * Emits specialized intrinsic wrappers (input/link/enum variants).
 *
 * These handle attribute-driven behavior or wrapper-specific style conditions
 * that need bespoke AST output rather than the generic wrapper paths.
 */
import type { JSCodeshift, Property, RestElement } from "jscodeshift";
import type { StyledDecl } from "../transform-types.js";
import type { ExpressionKind } from "./types.js";
import type { JsxAttr, StatementKind } from "./wrapper-emitter.js";
import { withLeadingComments } from "./comments.js";
import type { EmitIntrinsicContext } from "./emit-intrinsic-helpers.js";
import { buildPolymorphicTypeParams } from "./jsx-builders.js";
import { appendAllPseudoStyleArgs, styleRef } from "./style-expr-builders.js";

/**
 * Builds the wrapper body shared by input/link emitters:
 * destructure → derived vars → stylex.props → JSX → wrapper function.
 *
 * Uses a simple `const sx = stylex.props(...)` pattern (matching the original
 * template-literal emitters) rather than the full `emitStyleMerging` path.
 */
function buildAttrWrapperBody(
  ctx: EmitIntrinsicContext,
  args: {
    d: StyledDecl;
    tagName: string;
    allowClassNameProp: boolean;
    allowAsProp: boolean;
    includesForwardedAs: boolean;
    includeChildren: boolean;
    styleArgs: ExpressionKind[];
    /** Extra named props to destructure (e.g. "type", "readOnly" for input; "href", "target" for link) */
    extraDestructureProps: string[];
    /** Extra statements after destructure (e.g. isHttps/isPdf/isExternal computations) */
    extraBodyStatements: StatementKind[];
    /** Extra JSX attributes (e.g. type={type}, href={href}). Placed before rest spread. */
    extraJsxAttrs: JsxAttr[];
    /** Pseudo-alias guard props to add to destructuring */
    pseudoGuardProps: string[];
  },
): void {
  const { emitter, j, emitTypes, emitted } = ctx;
  const {
    d,
    tagName,
    allowClassNameProp,
    allowAsProp,
    includesForwardedAs,
    includeChildren,
    styleArgs,
    extraDestructureProps,
    extraBodyStatements,
    extraJsxAttrs,
    pseudoGuardProps,
  } = args;

  const classNameId = j.identifier("className");
  const childrenId = j.identifier("children");
  const refId = j.identifier("ref");
  const restId = j.identifier("rest");
  const forwardedAsId = j.identifier("forwardedAs");
  const componentId = j.identifier("Component");
  const sxId = j.identifier("sx");

  // Build base props in the order matching the original template output:
  // as, forwardedAs, extraProps (type/href/target), className, children, ref
  const baseProps: Array<Property | RestElement> = [
    ...(allowAsProp
      ? [
          j.property.from({
            kind: "init",
            key: j.identifier("as"),
            value: j.assignmentPattern(componentId, j.literal(tagName)),
            shorthand: false,
          }),
        ]
      : []),
    ...(includesForwardedAs ? [ctx.patternProp("forwardedAs", forwardedAsId)] : []),
    ...extraDestructureProps.map((name) => ctx.patternProp(name, j.identifier(name))),
    ...(allowClassNameProp ? [ctx.patternProp("className", classNameId)] : []),
    ...(includeChildren ? [ctx.patternProp("children", childrenId)] : []),
    ...((d.supportsRefProp ?? false) ? [ctx.patternProp("ref", refId)] : []),
  ];

  const patternProps = emitter.buildDestructurePatternProps({
    baseProps,
    destructureProps: [...pseudoGuardProps],
    includeRest: true,
    restId,
  });

  const declStmt = j.variableDeclaration("const", [
    j.variableDeclarator(j.objectPattern(patternProps as any), j.identifier("props")),
  ]);

  // Simple stylex.props() call — matches the original template-literal output
  const sxDecl = j.variableDeclaration("const", [
    j.variableDeclarator(
      sxId,
      j.callExpression(
        j.memberExpression(j.identifier("stylex"), j.identifier("props")),
        styleArgs,
      ),
    ),
  ]);

  // Build JSX attrs:
  // - With className: {...sx} className={join} extraAttrs {...rest}
  // - Without className: extraAttrs {...rest} {...sx}
  const jsxTag = allowAsProp ? "Component" : tagName;
  const openingAttrs: JsxAttr[] = [];

  if (allowClassNameProp) {
    // className merging pattern: {...sx} then className={[sx.className, className].filter(Boolean).join(" ")}
    openingAttrs.push(j.jsxSpreadAttribute(sxId));
    openingAttrs.push(
      j.jsxAttribute(
        j.jsxIdentifier("className"),
        j.jsxExpressionContainer(
          j.callExpression(
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
          ),
        ),
      ),
    );
    openingAttrs.push(...extraJsxAttrs);
    if (d.supportsRefProp ?? false) {
      openingAttrs.push(j.jsxAttribute(j.jsxIdentifier("ref"), j.jsxExpressionContainer(refId)));
    }
    openingAttrs.push(j.jsxSpreadAttribute(restId));
  } else {
    // No className merging: extraAttrs {...rest} {...sx}
    if (d.supportsRefProp ?? false) {
      openingAttrs.push(j.jsxAttribute(j.jsxIdentifier("ref"), j.jsxExpressionContainer(refId)));
    }
    openingAttrs.push(...extraJsxAttrs);
    openingAttrs.push(j.jsxSpreadAttribute(restId));
    openingAttrs.push(j.jsxSpreadAttribute(sxId));
  }

  if (includesForwardedAs) {
    openingAttrs.push(
      j.jsxAttribute(j.jsxIdentifier("as"), j.jsxExpressionContainer(forwardedAsId)),
    );
  }

  const jsx = emitter.buildJsxElement({
    tagName: jsxTag,
    attrs: openingAttrs,
    includeChildren,
    childrenExpr: childrenId,
  });

  const fnBodyStmts: StatementKind[] = [declStmt, ...extraBodyStatements, sxDecl];
  fnBodyStmts.push(j.returnStatement(jsx as any));

  const propsParamId = j.identifier("props");
  if (allowAsProp && emitTypes) {
    emitter.annotatePropsParam(
      propsParamId,
      d.localName,
      `${emitter.propsTypeNameFor(d.localName)}<C>`,
    );
  } else {
    emitter.annotatePropsParam(propsParamId, d.localName);
  }

  emitted.push(
    withLeadingComments(
      emitter.buildWrapperFunction({
        localName: d.localName,
        params: [propsParamId],
        bodyStmts: fnBodyStmts,
        typeParameters:
          allowAsProp && emitTypes ? buildPolymorphicTypeParams(j, tagName) : undefined,
      }),
      d,
    ),
  );
}

export function emitInputWrappers(ctx: EmitIntrinsicContext): void {
  const { emitter, j, wrapperDecls, stylesIdentifier } = ctx;
  const { emitPropsType, hasForwardedAsUsage, shouldAllowAsProp, withForwardedAsType } =
    ctx.helpers;
  const inputWrapperDecls = wrapperDecls.filter(
    (d: StyledDecl) =>
      d.base.kind === "intrinsic" && d.base.tagName === "input" && d.attrWrapper?.kind === "input",
  );

  for (const d of inputWrapperDecls) {
    const allowClassNameProp = emitter.shouldAllowClassNameProp(d);
    const allowStyleProp = emitter.shouldAllowStyleProp(d);
    const allowAsProp = shouldAllowAsProp(d, "input");
    const includesForwardedAs = hasForwardedAsUsage(d);
    const explicit = emitter.stringifyTsType(d.propsType);
    const baseTypeText = withForwardedAsType(
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
      includesForwardedAs,
    );
    emitPropsType({
      localName: d.localName,
      tagName: "input",
      typeText: baseTypeText,
      allowAsProp,
      allowClassNameProp,
      allowStyleProp,
    });

    const aw = d.attrWrapper!;
    const { beforeBase: extraStyleArgs, afterBase: extraStyleArgsAfterBase } =
      emitter.splitExtraStyleArgs(d);
    const styleArgs: ExpressionKind[] = [
      ...extraStyleArgs,
      ...emitter.baseStyleExpr(d),
      ...extraStyleArgsAfterBase,
      ...(aw.checkboxKey
        ? [
            j.logicalExpression(
              "&&",
              j.binaryExpression("===", j.identifier("type"), j.literal("checkbox")),
              styleRef(j, stylesIdentifier, aw.checkboxKey),
            ),
          ]
        : []),
      ...(aw.radioKey
        ? [
            j.logicalExpression(
              "&&",
              j.binaryExpression("===", j.identifier("type"), j.literal("radio")),
              styleRef(j, stylesIdentifier, aw.radioKey),
            ),
          ]
        : []),
      ...(aw.readonlyKey
        ? [
            j.logicalExpression(
              "&&",
              j.identifier("readOnly"),
              styleRef(j, stylesIdentifier, aw.readonlyKey),
            ),
          ]
        : []),
    ];

    const pseudoGuardProps = appendAllPseudoStyleArgs(d, styleArgs, j, stylesIdentifier);

    // Extra props to destructure: type, plus readOnly if [readonly] is used
    const extraDestructureProps = ["type"];
    if (aw.readonlyKey) {
      extraDestructureProps.push("readOnly");
    }

    buildAttrWrapperBody(ctx, {
      d,
      tagName: "input",
      allowClassNameProp,
      allowAsProp,
      includesForwardedAs,
      includeChildren: false,
      styleArgs,
      extraDestructureProps,
      extraBodyStatements: [],
      extraJsxAttrs: [
        j.jsxAttribute(j.jsxIdentifier("type"), j.jsxExpressionContainer(j.identifier("type"))),
        ...(aw.readonlyKey
          ? [
              j.jsxAttribute(
                j.jsxIdentifier("readOnly"),
                j.jsxExpressionContainer(j.identifier("readOnly")),
              ),
            ]
          : []),
      ],
      pseudoGuardProps,
    });
  }
}

export function emitLinkWrappers(ctx: EmitIntrinsicContext): void {
  const { emitter, j, wrapperDecls, stylesIdentifier } = ctx;
  const { emitPropsType, hasForwardedAsUsage, shouldAllowAsProp, withForwardedAsType } =
    ctx.helpers;
  const linkWrapperDecls = wrapperDecls.filter(
    (d: StyledDecl) =>
      d.base.kind === "intrinsic" && d.base.tagName === "a" && d.attrWrapper?.kind === "link",
  );

  for (const d of linkWrapperDecls) {
    const allowClassNameProp = emitter.shouldAllowClassNameProp(d);
    const allowStyleProp = emitter.shouldAllowStyleProp(d);
    const allowAsProp = shouldAllowAsProp(d, "a");
    const includesForwardedAs = hasForwardedAsUsage(d);
    const explicit = emitter.stringifyTsType(d.propsType);
    const baseTypeText = withForwardedAsType(
      explicit ??
        emitter.withChildren(
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
      includesForwardedAs,
    );
    emitPropsType({
      localName: d.localName,
      tagName: "a",
      typeText: baseTypeText,
      allowAsProp,
      allowClassNameProp,
      allowStyleProp,
    });

    const aw = d.attrWrapper!;
    const { beforeBase: extraStyleArgs, afterBase: extraStyleArgsAfterBase } =
      emitter.splitExtraStyleArgs(d);
    const styleArgs: ExpressionKind[] = [
      ...extraStyleArgs,
      ...emitter.baseStyleExpr(d),
      ...extraStyleArgsAfterBase,
      ...(aw.externalKey
        ? [
            j.logicalExpression(
              "&&",
              j.identifier("isExternal"),
              styleRef(j, stylesIdentifier, aw.externalKey),
            ),
          ]
        : []),
      ...(aw.httpsKey
        ? [
            j.logicalExpression(
              "&&",
              j.identifier("isHttps"),
              styleRef(j, stylesIdentifier, aw.httpsKey),
            ),
          ]
        : []),
      ...(aw.pdfKey
        ? [
            j.logicalExpression(
              "&&",
              j.identifier("isPdf"),
              styleRef(j, stylesIdentifier, aw.pdfKey),
            ),
          ]
        : []),
    ];

    const pseudoGuardProps = appendAllPseudoStyleArgs(d, styleArgs, j, stylesIdentifier);

    // Derived variable declarations (isHttps, isPdf, isExternal)
    // Use optional chaining on href: href?.startsWith("https")
    const hrefId = j.identifier("href");
    const targetId = j.identifier("target");
    const extraBodyStatements: StatementKind[] = [
      j.variableDeclaration("const", [
        j.variableDeclarator(
          j.identifier("isHttps"),
          j.callExpression(j.optionalMemberExpression(hrefId, j.identifier("startsWith")), [
            j.literal("https"),
          ]),
        ),
      ]),
      j.variableDeclaration("const", [
        j.variableDeclarator(
          j.identifier("isPdf"),
          j.callExpression(j.optionalMemberExpression(hrefId, j.identifier("endsWith")), [
            j.literal(".pdf"),
          ]),
        ),
      ]),
      j.variableDeclaration("const", [
        j.variableDeclarator(
          j.identifier("isExternal"),
          j.binaryExpression("===", targetId, j.literal("_blank")),
        ),
      ]),
    ];

    buildAttrWrapperBody(ctx, {
      d,
      tagName: "a",
      allowClassNameProp,
      allowAsProp,
      includesForwardedAs,
      includeChildren: true,
      styleArgs,
      extraDestructureProps: ["href", "target"],
      extraBodyStatements,
      extraJsxAttrs: [
        j.jsxAttribute(j.jsxIdentifier("href"), j.jsxExpressionContainer(hrefId)),
        j.jsxAttribute(j.jsxIdentifier("target"), j.jsxExpressionContainer(targetId)),
      ],
      pseudoGuardProps,
    });
  }
}

export function emitEnumVariantWrappers(ctx: EmitIntrinsicContext): void {
  const { emitter, j, emitTypes, wrapperDecls, stylesIdentifier, emitted } = ctx;
  const {
    emitPropsType,
    hasForwardedAsUsage,
    shouldAllowAsProp,
    asDestructureProp,
    withForwardedAsType,
  } = ctx.helpers;
  // Enum-variant wrappers (e.g. DynamicBox variant mapping from string-interpolation fixture).
  const enumVariantWrappers = wrapperDecls.filter((d: StyledDecl) => d.enumVariant);
  if (enumVariantWrappers.length > 0) {
    for (const d of enumVariantWrappers) {
      if (!d.enumVariant) {
        continue;
      }
      const tagName = "div";
      const includesForwardedAs = hasForwardedAsUsage(d);
      const allowClassNameProp = false;
      const allowStyleProp = false;
      const allowAsProp = shouldAllowAsProp(d, tagName);
      const { propName, baseKey, cases } = d.enumVariant;
      const primary = cases[0];
      const secondary = cases[1];
      if (!primary || !secondary) {
        continue;
      }
      const explicit = emitter.stringifyTsType(d.propsType);
      if (explicit) {
        emitPropsType({
          localName: d.localName,
          tagName,
          typeText: withForwardedAsType(emitter.withChildren(explicit), includesForwardedAs),
          allowAsProp,
          allowClassNameProp,
          allowStyleProp,
        });
      } else {
        // Best-effort: treat enum variant prop as a string-literal union.
        const hasNeq = cases.some((c) => c.kind === "neq");
        const values = [...new Set(cases.map((c) => c.whenValue))].filter(Boolean);
        const union = hasNeq
          ? "string"
          : values.length > 0
            ? values.map((v) => JSON.stringify(v)).join(" | ")
            : "string";
        const typeText = emitter.withChildren(
          `React.HTMLAttributes<HTMLDivElement> & { ${propName}?: ${union} }`,
        );
        emitPropsType({
          localName: d.localName,
          tagName,
          typeText: withForwardedAsType(typeText, includesForwardedAs),
          allowAsProp,
          allowClassNameProp,
          allowStyleProp,
        });
      }
      const propsParamId = j.identifier("props");
      if (allowAsProp && emitTypes) {
        emitter.annotatePropsParam(
          propsParamId,
          d.localName,
          `${emitter.propsTypeNameFor(d.localName)}<C>`,
        );
      } else {
        emitter.annotatePropsParam(propsParamId, d.localName);
      }
      const propsId = j.identifier("props");
      const variantId = j.identifier(propName);
      const childrenId = j.identifier("children");
      const forwardedAsId = j.identifier("forwardedAs");

      const declStmt = j.variableDeclaration("const", [
        j.variableDeclarator(
          j.objectPattern([
            ...(allowAsProp ? [asDestructureProp("div")] : []),
            ...(includesForwardedAs ? [emitter.patternProp("forwardedAs", forwardedAsId)] : []),
            emitter.patternProp(propName, variantId),
            emitter.patternProp("children", childrenId),
          ] as any),
          propsId,
        ),
      ]);

      const base = styleRef(j, stylesIdentifier, baseKey);
      const condPrimary = j.binaryExpression("===", variantId, j.literal(primary.whenValue));
      const condSecondary =
        secondary.kind === "neq"
          ? j.binaryExpression("!==", variantId, j.literal(secondary.whenValue))
          : j.binaryExpression("===", variantId, j.literal(secondary.whenValue));

      const styleArgs: ExpressionKind[] = [
        base,
        j.logicalExpression(
          "&&",
          condPrimary as any,
          styleRef(j, stylesIdentifier, primary.styleKey),
        ),
        j.logicalExpression(
          "&&",
          condSecondary as any,
          styleRef(j, stylesIdentifier, secondary.styleKey),
        ),
      ];

      const pseudoGuardPropsEnum = appendAllPseudoStyleArgs(d, styleArgs, j, stylesIdentifier);

      // Inject guard props into the destructuring pattern
      if (pseudoGuardPropsEnum.length > 0) {
        injectDestructureProps(j, declStmt, pseudoGuardPropsEnum);
      }

      const sxDecl = j.variableDeclaration("const", [
        j.variableDeclarator(
          j.identifier("sx"),
          j.callExpression(
            j.memberExpression(j.identifier("stylex"), j.identifier("props")),
            styleArgs,
          ),
        ),
      ]);

      const openingEl = j.jsxOpeningElement(
        j.jsxIdentifier(allowAsProp ? "Component" : "div"),
        [
          j.jsxSpreadAttribute(j.identifier("sx")),
          ...(includesForwardedAs
            ? [j.jsxAttribute(j.jsxIdentifier("as"), j.jsxExpressionContainer(forwardedAsId))]
            : []),
        ],
        false,
      );
      const jsx = j.jsxElement(
        openingEl,
        j.jsxClosingElement(j.jsxIdentifier(allowAsProp ? "Component" : "div")),
        [j.jsxExpressionContainer(childrenId)],
      );

      emitted.push(
        withLeadingComments(
          (() => {
            const fn = j.functionDeclaration(
              j.identifier(d.localName),
              [propsParamId],
              j.blockStatement([declStmt, sxDecl, j.returnStatement(jsx as any)]),
            );
            if (allowAsProp && emitTypes) {
              (fn as any).typeParameters = buildPolymorphicTypeParams(j, tagName);
            }
            return fn;
          })(),
          d,
        ),
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Injection helpers (used by enum variant emitter)
// ---------------------------------------------------------------------------

type AstRecord = Record<string, unknown>;

/**
 * Inject extra props into destructuring only (not JSX).
 * Used for pseudo-alias guard props that need to be in scope for style expressions.
 */
function injectDestructureProps(j: JSCodeshift, fnDecl: unknown, props: string[]): void {
  if (props.length === 0) {
    return;
  }
  // BFS-walk to find the first ObjectPattern and splice in the new props
  const queue: unknown[] = [fnDecl];
  while (queue.length > 0) {
    const node = queue.pop();
    if (!node || typeof node !== "object") {
      continue;
    }
    if (Array.isArray(node)) {
      for (const item of node) {
        queue.push(item);
      }
      continue;
    }
    const n = node as AstRecord;
    if (n.type === "ObjectPattern" && Array.isArray(n.properties)) {
      const properties = n.properties as unknown[];
      // Collect existing names to avoid duplicates
      const existingNames = new Set<string>();
      for (const p of properties) {
        if (p && typeof p === "object") {
          const pr = p as AstRecord;
          if (pr.type === "Property" && pr.key && typeof pr.key === "object") {
            const key = pr.key as AstRecord;
            if (key.type === "Identifier" && typeof key.name === "string") {
              existingNames.add(key.name);
            }
          }
        }
      }
      // Find rest element index for insertion point
      const restIdx = properties.findIndex(
        (p: unknown) =>
          !!p &&
          typeof p === "object" &&
          ((p as AstRecord).type === "RestElement" ||
            (p as AstRecord).type === "RestProperty" ||
            (p as AstRecord).type === "SpreadProperty"),
      );
      const insertIdx = restIdx >= 0 ? restIdx : properties.length;
      const newProps = props
        .filter((name) => !existingNames.has(name))
        .map((name) => {
          const id = j.identifier(name);
          const prop = j.property("init", id, id);
          (prop as unknown as AstRecord).shorthand = true;
          return prop;
        });
      properties.splice(insertIdx, 0, ...newProps);
      return; // stop after first ObjectPattern
    }
    for (const key of Object.keys(n)) {
      if (key === "loc" || key === "start" || key === "end" || key === "comments") {
        continue;
      }
      const child = n[key];
      if (child && typeof child === "object") {
        queue.push(child);
      }
    }
  }
}
