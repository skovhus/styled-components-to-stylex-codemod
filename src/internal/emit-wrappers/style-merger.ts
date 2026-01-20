import type { Identifier, JSCodeshift } from "jscodeshift";
import type { StyleMergerConfig } from "../../adapter.js";

export type { StyleMergerConfig };

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
  styleMerger: StyleMergerConfig | null;
  styleArgs: ExpressionKind[];
  classNameId: Identifier;
  styleId: Identifier;
  allowClassNameProp: boolean;
  allowStyleProp: boolean;
  inlineStyleProps?: Array<{ prop: string; expr: ExpressionKind }>;
}): StyleMergingResult {
  const {
    j,
    styleMerger,
    styleArgs,
    classNameId,
    styleId,
    allowClassNameProp,
    allowStyleProp,
    inlineStyleProps = [],
  } = args;

  // If neither className nor style merging is needed, just use stylex.props directly
  if (!allowClassNameProp && !allowStyleProp && inlineStyleProps.length === 0) {
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

  // If a merger function is configured and external className/style merging is needed, use it
  if (styleMerger && (allowClassNameProp || allowStyleProp)) {
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
  });
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
  const stylesArg = styleArgs.length === 1 ? styleArgs[0]! : j.arrayExpression(styleArgs);

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
}): StyleMergingResult {
  const {
    j,
    styleArgs,
    classNameId,
    styleId,
    allowClassNameProp,
    allowStyleProp,
    inlineStyleProps,
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
    styleAttr,
  };
}
