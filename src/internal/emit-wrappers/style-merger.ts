/**
 * Emits style merging logic for wrapper components.
 * Core concepts: stylex.props composition and adapter merger hooks.
 */
import type { Identifier, JSCodeshift } from "jscodeshift";
import type { StyleMergerConfig } from "../../adapter.js";
import type { WrapperEmitter } from "./wrapper-emitter.js";

/**
 * Result of emitting style merging logic.
 */
type ExpressionKind = Parameters<JSCodeshift["expressionStatement"]>[0];
type StatementKind = Parameters<JSCodeshift["blockStatement"]>[0][number];

export interface StyleMergingResult {
  /**
   * Whether an `sx` variable is needed (verbose pattern only).
   */
  needsSxVar: boolean;

  /**
   * The `const sx = stylex.props(...)` declaration, or null if using merger.
   */
  sxDecl: StatementKind | null;

  /**
   * The expression to spread in JSX (either `sx` or the merger call).
   */
  jsxSpreadExpr: ExpressionKind | null;

  /**
   * The className attribute expression, or null if using merger.
   */
  classNameAttr: ExpressionKind | null;
  /**
   * Whether className should be emitted before the spread.
   */
  classNameBeforeSpread?: boolean;

  /**
   * The style attribute expression, or null if using merger.
   */
  styleAttr: ExpressionKind | null;
}

/**
 * Generates either a merger function call or the verbose className/style pattern.
 *
 * When a merger is configured and external className/style merging is needed, generates:
 *   `{...stylexProps([styles.a, styles.b], className, style)}`
 *
 * When no merger is configured (default), generates:
 *   ```
 *   const sx = stylex.props(styles.a, styles.b);
 *   {...sx}
 *   className={[sx.className, className].filter(Boolean).join(" ")}
 *   style={{...sx.style, ...style}}
 *   ```
 */
export function emitStyleMerging(args: {
  j: JSCodeshift;
  emitter: Pick<
    WrapperEmitter,
    "styleMerger" | "stylesIdentifier" | "emptyStyleKeys" | "ancestorSelectorParents" | "emitTypes"
  >;
  styleArgs: ExpressionKind[];
  classNameId: Identifier;
  styleId: Identifier;
  allowClassNameProp: boolean;
  allowStyleProp: boolean;
  inlineStyleProps?: Array<{ prop: string; expr: ExpressionKind }>;
  staticClassNameExpr?: ExpressionKind;
}): StyleMergingResult {
  const {
    j,
    emitter,
    styleArgs: rawStyleArgs,
    classNameId,
    styleId,
    allowClassNameProp,
    allowStyleProp,
    inlineStyleProps = [],
    staticClassNameExpr,
  } = args;

  const { styleMerger, emptyStyleKeys, stylesIdentifier, ancestorSelectorParents, emitTypes } =
    emitter;

  const styleArgs = filterEmptyStyleArgs({
    styleArgs: rawStyleArgs,
    emptyStyleKeys,
    stylesIdentifier,
    ancestorSelectorParents,
  });

  // Add stylex.defaultMarker() when any style arg references an ancestor selector parent.
  // This is needed for merger/verbose paths that bypass the postProcessTransformedAst traversal.
  if (ancestorSelectorParents && ancestorSelectorParents.size > 0) {
    const needsMarker = styleArgs.some(
      (arg: any) =>
        arg?.type === "MemberExpression" &&
        arg.object?.type === "Identifier" &&
        arg.object.name === stylesIdentifier &&
        arg.property?.type === "Identifier" &&
        ancestorSelectorParents.has(arg.property.name),
    );
    if (needsMarker) {
      styleArgs.push(
        j.callExpression(
          j.memberExpression(j.identifier("stylex"), j.identifier("defaultMarker")),
          [],
        ),
      );
    }
  }

  if (styleArgs.length === 0) {
    return emitWithoutStylex({
      j,
      classNameId,
      styleId,
      allowClassNameProp,
      allowStyleProp,
      inlineStyleProps,
      staticClassNameExpr,
      emitTypes,
    });
  }

  // If neither className nor style merging is needed, just use stylex.props directly
  if (
    !allowClassNameProp &&
    !allowStyleProp &&
    inlineStyleProps.length === 0 &&
    !staticClassNameExpr
  ) {
    const stylexPropsCall = j.callExpression(
      j.memberExpression(j.identifier("stylex"), j.identifier("props")),
      styleArgs,
    );
    return {
      needsSxVar: false,
      sxDecl: null,
      jsxSpreadExpr: stylexPropsCall,
      classNameAttr: null,
      classNameBeforeSpread: false,
      styleAttr: null,
    };
  }

  // If a merger function is configured and external className/style merging is needed, use it
  if (styleMerger && (allowClassNameProp || allowStyleProp) && !staticClassNameExpr) {
    return emitWithMerger({
      j,
      styleMerger,
      styleArgs,
      classNameId,
      styleId,
      allowClassNameProp,
      allowStyleProp,
      inlineStyleProps,
      emitTypes,
    });
  }

  // Default: verbose pattern
  return emitVerbosePattern({
    j,
    styleArgs,
    classNameId,
    styleId,
    allowClassNameProp,
    allowStyleProp,
    inlineStyleProps,
    staticClassNameExpr,
    emitTypes,
  });
}

function filterEmptyStyleArgs(args: {
  styleArgs: ExpressionKind[];
  emptyStyleKeys?: Set<string>;
  stylesIdentifier?: string;
  ancestorSelectorParents?: Set<string>;
}): ExpressionKind[] {
  const { styleArgs, emptyStyleKeys, stylesIdentifier = "styles", ancestorSelectorParents } = args;
  if (!emptyStyleKeys || emptyStyleKeys.size === 0) {
    return styleArgs;
  }

  const isEmptyStyleRef = (node: any): boolean =>
    !!(
      node &&
      node.type === "MemberExpression" &&
      node.object?.type === "Identifier" &&
      node.object.name === stylesIdentifier &&
      node.property?.type === "Identifier" &&
      emptyStyleKeys.has(node.property.name) &&
      !ancestorSelectorParents?.has(node.property.name)
    );

  const isEmptyStyleArg = (node: any): boolean => {
    if (isEmptyStyleRef(node)) {
      return true;
    }
    if (node?.type === "LogicalExpression" && node.operator === "&&") {
      return isEmptyStyleRef(node.right);
    }
    return false;
  };

  const filtered = styleArgs.filter((arg) => !isEmptyStyleArg(arg));
  return filtered;
}

function emitWithoutStylex(args: {
  j: JSCodeshift;
  classNameId: Identifier;
  styleId: Identifier;
  allowClassNameProp: boolean;
  allowStyleProp: boolean;
  inlineStyleProps: Array<{ prop: string; expr: ExpressionKind }>;
  staticClassNameExpr?: ExpressionKind;
  emitTypes: boolean;
}): StyleMergingResult {
  const {
    j,
    classNameId,
    styleId,
    allowClassNameProp,
    allowStyleProp,
    inlineStyleProps,
    staticClassNameExpr,
    emitTypes,
  } = args;

  const classNameAttr = allowClassNameProp ? classNameId : (staticClassNameExpr ?? null);
  let styleAttr: ExpressionKind | null = null;

  if (allowStyleProp) {
    if (inlineStyleProps.length > 0) {
      styleAttr = maybeCastStyleForCustomProps(
        j,
        j.objectExpression([
          j.spreadElement(styleId),
          ...inlineStyleProps.map((p) => j.property("init", inlineStylePropKey(j, p.prop), p.expr)),
        ]),
        inlineStyleProps,
        emitTypes,
      );
    } else {
      styleAttr = styleId;
    }
  } else if (inlineStyleProps.length > 0) {
    styleAttr = maybeCastStyleForCustomProps(
      j,
      j.objectExpression(
        inlineStyleProps.map((p) => j.property("init", inlineStylePropKey(j, p.prop), p.expr)),
      ),
      inlineStyleProps,
      emitTypes,
    );
  }

  return {
    needsSxVar: false,
    sxDecl: null,
    jsxSpreadExpr: null,
    classNameAttr,
    classNameBeforeSpread: false,
    styleAttr,
  };
}

/**
 * Generates the merger function call pattern.
 */
function emitWithMerger(args: {
  j: JSCodeshift;
  styleMerger: StyleMergerConfig;
  styleArgs: ExpressionKind[];
  classNameId: Identifier;
  styleId: Identifier;
  allowClassNameProp: boolean;
  allowStyleProp: boolean;
  inlineStyleProps: Array<{ prop: string; expr: ExpressionKind }>;
  emitTypes: boolean;
}): StyleMergingResult {
  const {
    j,
    styleMerger,
    styleArgs,
    classNameId,
    styleId,
    allowClassNameProp,
    allowStyleProp,
    inlineStyleProps,
    emitTypes,
  } = args;

  // Build the styles argument
  // - Single style: pass directly
  // - Multiple styles: wrap in array
  const firstStyleArg = styleArgs[0];
  const stylesArg =
    styleArgs.length === 1 && firstStyleArg ? firstStyleArg : j.arrayExpression(styleArgs);

  // Build the merger function call arguments
  // Signature: merger(styles, className?, style?)
  const mergerArgs: ExpressionKind[] = [stylesArg];

  if (allowClassNameProp || allowStyleProp) {
    // Add className argument (or undefined if not needed but style is)
    if (allowClassNameProp) {
      mergerArgs.push(classNameId);
    } else if (allowStyleProp) {
      mergerArgs.push(j.identifier("undefined"));
    }

    // Add style argument if needed
    if (allowStyleProp) {
      if (inlineStyleProps.length > 0) {
        // Merge inline style props with the style parameter
        mergerArgs.push(
          maybeCastStyleForCustomProps(
            j,
            j.objectExpression([
              j.spreadElement(styleId),
              ...inlineStyleProps.map((p) =>
                j.property("init", inlineStylePropKey(j, p.prop), p.expr),
              ),
            ]),
            inlineStyleProps,
            emitTypes,
          ),
        );
      } else {
        mergerArgs.push(styleId);
      }
    } else if (inlineStyleProps.length > 0) {
      // Only inline style props, no external style
      mergerArgs.push(j.identifier("undefined"));
      mergerArgs.push(
        maybeCastStyleForCustomProps(
          j,
          j.objectExpression(
            inlineStyleProps.map((p) => j.property("init", inlineStylePropKey(j, p.prop), p.expr)),
          ),
          inlineStyleProps,
          emitTypes,
        ),
      );
    }
  }

  const mergerCall = j.callExpression(j.identifier(styleMerger.functionName), mergerArgs);

  return {
    needsSxVar: false,
    sxDecl: null,
    jsxSpreadExpr: mergerCall,
    classNameAttr: null,
    classNameBeforeSpread: false,
    styleAttr: null,
  };
}

/**
 * Generates the verbose className/style merging pattern.
 */
function emitVerbosePattern(args: {
  j: any;
  styleArgs: any[];
  classNameId: any;
  styleId: any;
  allowClassNameProp: boolean;
  allowStyleProp: boolean;
  inlineStyleProps: Array<{ prop: string; expr: any }>;
  staticClassNameExpr?: ExpressionKind;
  emitTypes: boolean;
}): StyleMergingResult {
  const {
    j,
    styleArgs,
    classNameId,
    styleId,
    allowClassNameProp,
    allowStyleProp,
    inlineStyleProps,
    staticClassNameExpr,
    emitTypes,
  } = args;

  // Create the stylex.props() call
  const stylexPropsCall = j.callExpression(
    j.memberExpression(j.identifier("stylex"), j.identifier("props")),
    styleArgs,
  );

  // Create the sx variable declaration
  const sxDecl = j.variableDeclaration("const", [
    j.variableDeclarator(j.identifier("sx"), stylexPropsCall),
  ]);

  // Create className merging expression if needed
  let classNameAttr: any = null;
  if (allowClassNameProp || staticClassNameExpr) {
    const parts = [
      ...(staticClassNameExpr ? [staticClassNameExpr] : []),
      j.memberExpression(j.identifier("sx"), j.identifier("className")),
      ...(allowClassNameProp ? [classNameId] : []),
    ];
    classNameAttr = j.callExpression(
      j.memberExpression(
        j.callExpression(j.memberExpression(j.arrayExpression(parts), j.identifier("filter")), [
          j.identifier("Boolean"),
        ]),
        j.identifier("join"),
      ),
      [j.literal(" ")],
    );
  }

  // Create style merging expression if needed
  let styleAttr: any = null;
  if (allowStyleProp || inlineStyleProps.length > 0) {
    const spreads: any[] = [
      j.spreadElement(j.memberExpression(j.identifier("sx"), j.identifier("style"))),
      ...(allowStyleProp ? [j.spreadElement(styleId)] : []),
      ...inlineStyleProps.map((p) => j.property("init", inlineStylePropKey(j, p.prop), p.expr)),
    ];
    styleAttr = maybeCastStyleForCustomProps(
      j,
      j.objectExpression(spreads),
      inlineStyleProps,
      emitTypes,
    );
  }

  return {
    needsSxVar: true,
    sxDecl,
    jsxSpreadExpr: j.identifier("sx"),
    classNameAttr,
    // Always emit the merged className AFTER `{...sx}` so it cannot be overwritten by `sx.className`.
    classNameBeforeSpread: false,
    styleAttr,
  };
}

// --- Non-exported helpers ---

/** Returns a string literal key for CSS custom properties (--foo), identifier otherwise. */
function inlineStylePropKey(j: JSCodeshift, prop: string): ExpressionKind {
  return prop.startsWith("--") ? j.literal(prop) : j.identifier(prop);
}

/** Wraps an object expression with `as React.CSSProperties` when it contains CSS custom properties (TypeScript only). */
function maybeCastStyleForCustomProps(
  j: JSCodeshift,
  styleExpr: ExpressionKind,
  inlineStyleProps: Array<{ prop: string }>,
  emitTypes: boolean,
): ExpressionKind {
  if (!emitTypes || !inlineStyleProps.some((p) => p.prop.startsWith("--"))) {
    return styleExpr;
  }
  return j.tsAsExpression(
    styleExpr,
    j.tsTypeReference(j.tsQualifiedName(j.identifier("React"), j.identifier("CSSProperties"))),
  );
}
