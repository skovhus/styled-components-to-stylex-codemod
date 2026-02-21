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
    | "styleMerger"
    | "stylesIdentifier"
    | "emptyStyleKeys"
    | "ancestorSelectorParents"
    | "siblingMarkers"
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

  const { styleMerger, emptyStyleKeys, stylesIdentifier, ancestorSelectorParents, siblingMarkers } =
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
    const needsMarker = styleArgs.some((arg) =>
      hasStyleArgKey(arg, stylesIdentifier, ancestorSelectorParents),
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

  // Add sibling marker identifiers when any style arg references a style key with a sibling marker.
  // Analogous to the defaultMarker() logic above, but for & + & selectors.
  if (siblingMarkers && siblingMarkers.size > 0) {
    const markerKeys = new Set(siblingMarkers.keys());
    for (const arg of styleArgs) {
      const key = getStyleArgKey(arg, stylesIdentifier);
      if (key && markerKeys.has(key)) {
        const markerName = siblingMarkers.get(key)!;
        styleArgs.push(j.identifier(markerName));
      }
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

  const isEmptyStyleRef = (node: ExpressionKind): boolean => {
    const key = getStyleArgKey(node, stylesIdentifier);
    return !!(key && emptyStyleKeys.has(key) && !ancestorSelectorParents?.has(key));
  };

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
}): StyleMergingResult {
  const {
    j,
    classNameId,
    styleId,
    allowClassNameProp,
    allowStyleProp,
    inlineStyleProps,
    staticClassNameExpr,
  } = args;

  const classNameAttr = allowClassNameProp ? classNameId : (staticClassNameExpr ?? null);
  let styleAttr: ExpressionKind | null = null;

  if (allowStyleProp) {
    if (inlineStyleProps.length > 0) {
      styleAttr = j.objectExpression([
        j.spreadElement(styleId),
        ...inlineStyleProps.map((p) => j.property("init", j.identifier(p.prop), p.expr)),
      ]);
    } else {
      styleAttr = styleId;
    }
  } else if (inlineStyleProps.length > 0) {
    styleAttr = j.objectExpression(
      inlineStyleProps.map((p) => j.property("init", j.identifier(p.prop), p.expr)),
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
          j.objectExpression([
            j.spreadElement(styleId),
            ...inlineStyleProps.map((p) => j.property("init", j.identifier(p.prop), p.expr)),
          ]),
        );
      } else {
        mergerArgs.push(styleId);
      }
    } else if (inlineStyleProps.length > 0) {
      // Only inline style props, no external style
      mergerArgs.push(j.identifier("undefined"));
      mergerArgs.push(
        j.objectExpression(
          inlineStyleProps.map((p) => j.property("init", j.identifier(p.prop), p.expr)),
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
      ...inlineStyleProps.map((p) => j.property("init", j.identifier(p.prop), p.expr)),
    ];
    styleAttr = j.objectExpression(spreads);
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

/**
 * If `node` is `<stylesIdentifier>.<key>`, returns the key name; otherwise `null`.
 * Centralises the MemberExpression pattern check used across the style-merger module.
 */
function getStyleArgKey(node: ExpressionKind, stylesIdentifier: string): string | null {
  const n = node as { type?: string; object?: any; property?: any };
  if (
    n?.type === "MemberExpression" &&
    n.object?.type === "Identifier" &&
    n.object.name === stylesIdentifier &&
    n.property?.type === "Identifier"
  ) {
    return n.property.name as string;
  }
  return null;
}

/**
 * Returns `true` when at least one style arg references a key in the given set.
 */
function hasStyleArgKey(
  node: ExpressionKind,
  stylesIdentifier: string,
  keys: Set<string>,
): boolean {
  const key = getStyleArgKey(node, stylesIdentifier);
  return !!(key && keys.has(key));
}
