import type { Identifier, JSCodeshift } from "jscodeshift";
import type { StyleMergerConfig } from "../../adapter.js";

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
  jsxSpreadExpr: ExpressionKind;

  /**
   * The className attribute expression, or null if using merger.
   */
  classNameAttr: ExpressionKind | null;

  /**
   * The style attribute expression for inline style props, or null if none.
   * Note: This is for StyleX's inline style props (dynamic values), NOT external style props.
   */
  styleAttr: ExpressionKind | null;
}

/**
 * Generates either a merger function call or the verbose className pattern.
 *
 * When a merger is configured and external className merging is needed, generates:
 *   `{...stylexProps([styles.a, styles.b], className)}`
 *
 * When no merger is configured (default), generates:
 *   ```
 *   const sx = stylex.props(styles.a, styles.b);
 *   {...sx}
 *   className={[sx.className, className].filter(Boolean).join(" ")}
 *   ```
 *
 * Inline style props (for dynamic values) are handled separately via styleAttr.
 *
 * Note: External `style` props are NOT supported. Dynamic styles should be
 * handled via StyleX's inline style props mechanism instead.
 */
export function emitStyleMerging(args: {
  j: JSCodeshift;
  styleMerger: StyleMergerConfig | null;
  styleArgs: ExpressionKind[];
  classNameId: Identifier;
  allowClassNameProp: boolean;
  inlineStyleProps?: Array<{ prop: string; expr: ExpressionKind }>;
}): StyleMergingResult {
  const {
    j,
    styleMerger,
    styleArgs,
    classNameId,
    allowClassNameProp,
    inlineStyleProps = [],
  } = args;

  // If neither className merging nor inline style props are needed, just use stylex.props directly
  if (!allowClassNameProp && inlineStyleProps.length === 0) {
    const stylexPropsCall = j.callExpression(
      j.memberExpression(j.identifier("stylex"), j.identifier("props")),
      styleArgs,
    );
    return {
      needsSxVar: false,
      sxDecl: null,
      jsxSpreadExpr: stylexPropsCall,
      classNameAttr: null,
      styleAttr: null,
    };
  }

  // If a merger function is configured and external className merging is needed, use it
  if (styleMerger && allowClassNameProp) {
    return emitWithMerger({
      j,
      styleMerger,
      styleArgs,
      classNameId,
      allowClassNameProp,
      inlineStyleProps,
    });
  }

  // Default: verbose pattern
  return emitVerbosePattern({
    j,
    styleArgs,
    classNameId,
    allowClassNameProp,
    inlineStyleProps,
  });
}

/**
 * Generates the merger function call pattern.
 *
 * Signature: merger(styles, className?)
 * Note: External style props are NOT supported.
 */
function emitWithMerger(args: {
  j: JSCodeshift;
  styleMerger: StyleMergerConfig;
  styleArgs: ExpressionKind[];
  classNameId: Identifier;
  allowClassNameProp: boolean;
  inlineStyleProps: Array<{ prop: string; expr: ExpressionKind }>;
}): StyleMergingResult {
  const { j, styleMerger, styleArgs, classNameId, allowClassNameProp, inlineStyleProps } = args;

  // Build the styles argument
  // - Single style: pass directly
  // - Multiple styles: wrap in array
  const firstStyleArg = styleArgs[0];
  const stylesArg =
    styleArgs.length === 1 && firstStyleArg ? firstStyleArg : j.arrayExpression(styleArgs);

  // Build the merger function call arguments
  // Signature: merger(styles, className?)
  const mergerArgs: ExpressionKind[] = [stylesArg];

  if (allowClassNameProp) {
    mergerArgs.push(classNameId);
  }

  const mergerCall = j.callExpression(j.identifier(styleMerger.functionName), mergerArgs);

  // Build inline style props attribute if needed (for dynamic values, NOT external style props)
  let styleAttr: ExpressionKind | null = null;
  if (inlineStyleProps.length > 0) {
    styleAttr = j.objectExpression(
      inlineStyleProps.map((p) => j.property("init", j.identifier(p.prop), p.expr)),
    );
  }

  return {
    needsSxVar: false,
    sxDecl: null,
    jsxSpreadExpr: mergerCall,
    classNameAttr: null,
    styleAttr,
  };
}

/**
 * Generates the verbose className merging pattern.
 *
 * Note: External style props are NOT supported. Only inline style props
 * (for dynamic values) are included in the styleAttr.
 */
function emitVerbosePattern(args: {
  j: JSCodeshift;
  styleArgs: ExpressionKind[];
  classNameId: Identifier;
  allowClassNameProp: boolean;
  inlineStyleProps: Array<{ prop: string; expr: ExpressionKind }>;
}): StyleMergingResult {
  const { j, styleArgs, classNameId, allowClassNameProp, inlineStyleProps } = args;

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
  let classNameAttr: ExpressionKind | null = null;
  if (allowClassNameProp) {
    classNameAttr = j.callExpression(
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
  }

  // Create style attribute for inline style props if needed (for dynamic values only)
  // Note: External style props are NOT supported
  let styleAttr: ExpressionKind | null = null;
  if (inlineStyleProps.length > 0) {
    styleAttr = j.objectExpression([
      j.spreadElement(j.memberExpression(j.identifier("sx"), j.identifier("style"))),
      ...inlineStyleProps.map((p) => j.property("init", j.identifier(p.prop), p.expr)),
    ]);
  }

  return {
    needsSxVar: true,
    sxDecl,
    jsxSpreadExpr: j.identifier("sx"),
    classNameAttr,
    styleAttr,
  };
}
