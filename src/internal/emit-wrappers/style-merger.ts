/**
 * Emits style merging logic for wrapper components.
 * Core concepts: stylex.props composition and adapter merger hooks.
 */
import type { Identifier, JSCodeshift } from "jscodeshift";
import type { StyleMergerConfig } from "../../adapter.js";
import type { InlineStyleProp } from "./types.js";
import type { WrapperEmitter } from "./wrapper-emitter.js";
import { mergeAdjacentComplementaryStyleExprs } from "./variant-condition.js";
import { isUndefinedIdentifier } from "../utilities/jscodeshift-utils.js";

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
   * When set, emit `sx={expr}` JSX attribute instead of `{...jsxSpreadExpr}`.
   * Mutually exclusive with `jsxSpreadExpr`.
   */
  sxPropExpr: ExpressionKind | null;

  /**
   * The className attribute expression, or null if using merger.
   */
  classNameAttr: ExpressionKind | null;
  /**
   * Whether className should be emitted before the spread.
   */
  classNameBeforeSpread?: boolean;
  /**
   * Whether generated className/style attrs should be emitted before `sx={...}`.
   * This is used for sx-aware components where `sx` is not a spread.
   */
  externalAttrsBeforeSxProp?: boolean;

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
    | "crossFileMarkers"
    | "parentsNeedingDefaultMarker"
    | "emitTypes"
    | "useSxProp"
  >;
  styleArgs: ExpressionKind[];
  classNameId: Identifier;
  styleId: Identifier;
  allowClassNameProp: boolean;
  allowStyleProp: boolean;
  allowSxProp?: boolean;
  inlineStyleProps?: InlineStyleProp[];
  staticStyleExpr?: ExpressionKind;
  staticClassNameExpr?: ExpressionKind;
  /** Set to true when the rendered tag is an intrinsic HTML element (lowercase).
   * The sx prop is only valid on intrinsic elements (processed by the StyleX babel plugin). */
  isIntrinsicElement?: boolean;
  /** Set to true when the rendered (non-intrinsic) component already accepts a
   * StyleX `sx` prop. Enables the `sx={...}` fast path for component wrappers. */
  wrappedAcceptsSxProp?: boolean;
  /** Keep the external style prop as a JSX `style={style}` attr instead of passing it to the merger. */
  keepStylePropSeparate?: boolean;
}): StyleMergingResult {
  const {
    j,
    emitter,
    styleArgs: rawStyleArgs,
    classNameId,
    styleId,
    allowClassNameProp,
    allowStyleProp,
    allowSxProp,
    inlineStyleProps = [],
    staticStyleExpr,
    staticClassNameExpr,
    isIntrinsicElement = true,
    wrappedAcceptsSxProp = false,
    keepStylePropSeparate = false,
  } = args;

  const {
    styleMerger,
    emptyStyleKeys,
    stylesIdentifier,
    ancestorSelectorParents,
    crossFileMarkers,
    parentsNeedingDefaultMarker,
    emitTypes,
  } = emitter;

  const styleArgs = mergeAdjacentComplementaryStyleExprs(
    j,
    filterEmptyStyleArgs({
      styleArgs: rawStyleArgs,
      emptyStyleKeys,
      stylesIdentifier,
      ancestorSelectorParents,
    }),
  );

  // Add a marker when any style arg references an ancestor selector parent.
  // Scoped markers (from defineMarker) and defaultMarker() coexist: the scoped marker
  // enables targeted sibling/no-pseudo matching, while defaultMarker() enables regular
  // pseudo-reverse selectors like `stylex.when.ancestor(':hover')` (no marker arg).
  if (ancestorSelectorParents && ancestorSelectorParents.size > 0) {
    let needsDefaultMarker = false;
    const pendingMarkers: ExpressionKind[] = [];
    for (const arg of styleArgs) {
      const key = getStyleArgKey(arg, stylesIdentifier);
      if (!key || !ancestorSelectorParents.has(key)) {
        continue;
      }
      const markerVarName = crossFileMarkers.get(key);
      if (markerVarName) {
        pendingMarkers.push(j.identifier(markerVarName));
      }
      // Only emit defaultMarker() when this parent has at least one override
      // without a scoped marker. Pure sibling/no-pseudo cases only need
      // their scoped marker.
      if (!markerVarName || parentsNeedingDefaultMarker.has(key)) {
        needsDefaultMarker = true;
      }
    }
    styleArgs.push(...pendingMarkers);
    if (needsDefaultMarker) {
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
      staticStyleExpr,
      staticClassNameExpr,
      emitTypes,
    });
  }

  if (
    keepStylePropSeparate &&
    allowStyleProp &&
    !wrappedAcceptsSxProp &&
    inlineStyleProps.length === 0 &&
    !staticStyleExpr
  ) {
    return emitVerbosePattern({
      j,
      styleArgs,
      classNameId,
      styleId,
      allowClassNameProp,
      allowStyleProp,
      allowSxProp: allowSxProp || wrappedAcceptsSxProp,
      inlineStyleProps,
      staticClassNameExpr,
      emitTypes,
    });
  }

  // When the wrapped component accepts a StyleX `sx` prop (per adapter), emit
  // `sx={...}` directly. If there is no generated static class/style, external
  // className/style flow through `{...rest}` unchanged.
  if (
    wrappedAcceptsSxProp &&
    inlineStyleProps.length === 0 &&
    !staticStyleExpr &&
    !staticClassNameExpr
  ) {
    return buildSxOnlyResult(j, styleArgs, { normalizeOptionalEntries: true });
  }

  // Keep generated StyleX styles in `sx` even when raw CSS variables or attrs
  // style objects have to remain as inline styles. Passing the result of
  // stylex.props()/mergedSx() into an sx-aware custom component materializes
  // className/style one level too early.
  if (wrappedAcceptsSxProp && (inlineStyleProps.length > 0 || staticStyleExpr)) {
    return buildSxWithInlineStyleResult({
      j,
      styleArgs,
      classNameId,
      styleId,
      allowClassNameProp,
      allowStyleProp,
      inlineStyleProps,
      staticStyleExpr,
      staticClassNameExpr,
      emitTypes,
    });
  }

  // A generated static class (attrs/bridge class) must still be forwarded, but
  // sx-aware components should keep StyleX styles in `sx` instead of receiving
  // them through a merger spread that also contains className/style.
  if (
    wrappedAcceptsSxProp &&
    inlineStyleProps.length === 0 &&
    !staticStyleExpr &&
    staticClassNameExpr
  ) {
    return buildSxWithExternalPropsResult({
      j,
      styleArgs,
      classNameId,
      styleId,
      allowClassNameProp,
      allowStyleProp,
      staticClassNameExpr,
    });
  }

  // If neither className nor style merging is needed, just use stylex.props directly
  if (
    !allowClassNameProp &&
    !allowStyleProp &&
    inlineStyleProps.length === 0 &&
    !staticStyleExpr &&
    !staticClassNameExpr
  ) {
    // When useSxProp is enabled, emit sx={expr} instead of {...stylex.props(expr)}
    // Only valid on intrinsic elements (the StyleX babel plugin only processes lowercase tags).
    // sx requires at least one local styles.* reference for the compiler to recognize;
    // fall back to stylex.props() when all styles are external (e.g. mixin map lookups).
    const sid = emitter.stylesIdentifier;
    const hasLocalRef = styleArgs.some((a) => j([a]).find(j.Identifier, { name: sid }).size() > 0);
    if (emitter.useSxProp && isIntrinsicElement && hasLocalRef) {
      return buildSxOnlyResult(j, styleArgs);
    }
    const stylexPropsCall = j.callExpression(
      j.memberExpression(j.identifier("stylex"), j.identifier("props")),
      styleArgs,
    );
    return {
      needsSxVar: false,
      sxDecl: null,
      jsxSpreadExpr: stylexPropsCall,
      sxPropExpr: null,
      classNameAttr: null,
      classNameBeforeSpread: false,
      styleAttr: null,
    };
  }

  // If a merger function is configured and external className/style merging is needed, use it.
  // Static className expressions (attrs/bridge class) are folded into the merger's className arg.
  if (styleMerger && (allowClassNameProp || allowStyleProp || staticStyleExpr)) {
    return emitWithMerger({
      j,
      styleMerger,
      styleArgs,
      classNameId,
      styleId,
      allowClassNameProp,
      allowStyleProp,
      inlineStyleProps,
      staticStyleExpr,
      staticClassNameExpr,
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
    allowSxProp: allowSxProp || wrappedAcceptsSxProp,
    inlineStyleProps,
    staticStyleExpr,
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
  inlineStyleProps: InlineStyleProp[];
  staticStyleExpr?: ExpressionKind;
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
    staticStyleExpr,
    staticClassNameExpr,
    emitTypes,
  } = args;

  const classNameAttr = allowClassNameProp ? classNameId : (staticClassNameExpr ?? null);
  let styleAttr: ExpressionKind | null = null;

  if (allowStyleProp) {
    if (inlineStyleProps.length > 0 || staticStyleExpr) {
      styleAttr = maybeCastStyleForCustomProps(
        j,
        j.objectExpression([
          ...(staticStyleExpr ? [j.spreadElement(staticStyleExpr)] : []),
          ...inlineStyleProps.map((p) => inlineStyleProperty(j, p)),
          j.spreadElement(styleId),
        ]),
        inlineStyleProps,
        emitTypes,
      );
    } else {
      styleAttr = styleId;
    }
  } else if (inlineStyleProps.length > 0 || staticStyleExpr) {
    styleAttr = maybeCastStyleForCustomProps(
      j,
      staticStyleExpr && inlineStyleProps.length === 0
        ? staticStyleExpr
        : j.objectExpression([
            ...(staticStyleExpr ? [j.spreadElement(staticStyleExpr)] : []),
            ...inlineStyleProps.map((p) => inlineStyleProperty(j, p)),
          ]),
      inlineStyleProps,
      emitTypes,
    );
  }

  return {
    needsSxVar: false,
    sxDecl: null,
    jsxSpreadExpr: null,
    sxPropExpr: null,
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
  inlineStyleProps: InlineStyleProp[];
  staticStyleExpr?: ExpressionKind;
  staticClassNameExpr?: ExpressionKind;
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
    staticStyleExpr,
    staticClassNameExpr,
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
  const classNameArg = buildMergerClassNameArg({
    j,
    classNameId,
    allowClassNameProp,
    staticClassNameExpr,
  });

  if (allowClassNameProp || allowStyleProp || classNameArg || staticStyleExpr) {
    // Add className argument (or undefined if not needed but style is)
    if (classNameArg) {
      mergerArgs.push(classNameArg);
    } else if (allowStyleProp || staticStyleExpr || inlineStyleProps.length > 0) {
      mergerArgs.push(j.identifier("undefined"));
    }

    // Add style argument if needed
    if (allowStyleProp) {
      if (inlineStyleProps.length > 0 || staticStyleExpr) {
        // Merge inline style props with the style parameter
        mergerArgs.push(
          maybeCastStyleForCustomProps(
            j,
            j.objectExpression([
              ...(staticStyleExpr ? [j.spreadElement(staticStyleExpr)] : []),
              ...inlineStyleProps.map((p) => inlineStyleProperty(j, p)),
              j.spreadElement(styleId),
            ]),
            inlineStyleProps,
            emitTypes,
          ),
        );
      } else {
        mergerArgs.push(styleId);
      }
    } else if (inlineStyleProps.length > 0 || staticStyleExpr) {
      // Only inline style props, no external style
      mergerArgs.push(
        maybeCastStyleForCustomProps(
          j,
          staticStyleExpr && inlineStyleProps.length === 0
            ? staticStyleExpr
            : j.objectExpression([
                ...(staticStyleExpr ? [j.spreadElement(staticStyleExpr)] : []),
                ...inlineStyleProps.map((p) => inlineStyleProperty(j, p)),
              ]),
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
    sxPropExpr: null,
    classNameAttr: null,
    classNameBeforeSpread: false,
    styleAttr: null,
  };
}

type ClassNamePartsArgs = {
  j: JSCodeshift;
  classNameId: Identifier;
  allowClassNameProp: boolean;
  staticClassNameExpr?: ExpressionKind;
};

/**
 * Collect the className expressions to combine (the static className, if any,
 * then the forwarded `className` prop, if allowed), then return `null` for none,
 * the sole part for one, or `combineMultiple(parts)` for several.
 */
function combineClassNameParts(
  args: ClassNamePartsArgs,
  combineMultiple: (parts: ExpressionKind[]) => ExpressionKind,
): ExpressionKind | null {
  const { classNameId, allowClassNameProp, staticClassNameExpr } = args;
  const parts: ExpressionKind[] = [];
  if (staticClassNameExpr) {
    parts.push(staticClassNameExpr);
  }
  if (allowClassNameProp) {
    parts.push(classNameId);
  }
  if (parts.length === 0) {
    return null;
  }
  if (parts.length === 1) {
    return parts[0] ?? null;
  }
  return combineMultiple(parts);
}

function buildMergerClassNameArg(args: ClassNamePartsArgs): ExpressionKind | null {
  // Pass multiple classNames as an array — the merger function handles joining.
  return combineClassNameParts(args, (parts) => args.j.arrayExpression(parts));
}

function buildClassNameAttributeExpr(args: ClassNamePartsArgs): ExpressionKind | null {
  const { j } = args;
  return combineClassNameParts(args, (parts) =>
    j.callExpression(
      j.memberExpression(
        j.callExpression(j.memberExpression(j.arrayExpression(parts), j.identifier("filter")), [
          j.identifier("Boolean"),
        ]),
        j.identifier("join"),
      ),
      [j.literal(" ")],
    ),
  );
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
  allowSxProp?: boolean;
  inlineStyleProps: InlineStyleProp[];
  staticStyleExpr?: ExpressionKind;
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
    allowSxProp,
    inlineStyleProps,
    staticStyleExpr,
    staticClassNameExpr,
    emitTypes,
  } = args;

  // When the component accepts an `sx` prop, rename the internal variable to avoid
  // shadowing the destructured `sx` prop identifier.
  const sxVarName = allowSxProp ? "_sx" : "sx";

  // Create the stylex.props() call
  const stylexPropsCall = j.callExpression(
    j.memberExpression(j.identifier("stylex"), j.identifier("props")),
    styleArgs,
  );

  // Create the sx variable declaration
  const sxDecl = j.variableDeclaration("const", [
    j.variableDeclarator(j.identifier(sxVarName), stylexPropsCall),
  ]);

  // Create className merging expression if needed
  let classNameAttr: any = null;
  if (allowClassNameProp || staticClassNameExpr) {
    const parts = [
      ...(staticClassNameExpr ? [staticClassNameExpr] : []),
      j.memberExpression(j.identifier(sxVarName), j.identifier("className")),
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
  if (allowStyleProp || inlineStyleProps.length > 0 || staticStyleExpr) {
    const spreads: any[] = [
      j.spreadElement(j.memberExpression(j.identifier(sxVarName), j.identifier("style"))),
      ...(staticStyleExpr ? [j.spreadElement(staticStyleExpr)] : []),
      ...inlineStyleProps.map((p) => inlineStyleProperty(j, p)),
      ...(allowStyleProp ? [j.spreadElement(styleId)] : []),
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
    jsxSpreadExpr: j.identifier(sxVarName),
    sxPropExpr: null,
    classNameAttr,
    // Always emit the merged className AFTER `{...sx}` so it cannot be overwritten by `sx.className`.
    classNameBeforeSpread: false,
    styleAttr,
  };
}

// --- Non-exported helpers ---

/** Returns a string literal key for CSS custom properties (--foo), identifier otherwise. */
function inlineStylePropKey(j: JSCodeshift, prop: string): ExpressionKind {
  if (prop.startsWith("--")) {
    return j.literal(prop);
  }
  return prop.includes(".") ? parseMemberExpressionKey(j, prop) : j.identifier(prop);
}

function parseMemberExpressionKey(j: JSCodeshift, prop: string): ExpressionKind {
  if (!prop.includes(".")) {
    return j.literal(prop);
  }
  const [root, member] = prop.split(".");
  if (!root || !member || prop.split(".").length !== 2) {
    return j.literal(prop);
  }
  return j.memberExpression(j.identifier(root), j.identifier(member));
}

function isCustomPropertyKey(prop: string): boolean {
  return prop.startsWith("--") || prop.includes(".");
}

function inlineStyleProperty(
  j: JSCodeshift,
  prop: InlineStyleProp,
): ReturnType<JSCodeshift["property"]> {
  const key = prop.keyExpr ?? inlineStylePropKey(j, prop.prop);
  const property = j.property("init", key, prop.expr);
  if (prop.keyExpr) {
    property.computed = true;
  }
  return property;
}

/** Wraps an object expression with `as React.CSSProperties` when it contains CSS custom properties (TypeScript only). */
function maybeCastStyleForCustomProps(
  j: JSCodeshift,
  styleExpr: ExpressionKind,
  inlineStyleProps: Array<{ prop: string }>,
  emitTypes: boolean,
): ExpressionKind {
  if (!emitTypes || !inlineStyleProps.some((p) => isCustomPropertyKey(p.prop))) {
    return styleExpr;
  }
  return j.tsAsExpression(
    styleExpr,
    j.tsTypeReference(j.tsQualifiedName(j.identifier("React"), j.identifier("CSSProperties"))),
  );
}

/**
 * Build a `StyleMergingResult` that only emits `sx={...}` (no className/style
 * attributes, no merger var). Two call sites use this: the wrappedAcceptsSx
 * path and the useSxProp+intrinsic path.
 */
function buildSxOnlyResult(
  j: JSCodeshift,
  styleArgs: ExpressionKind[],
  options: { normalizeOptionalEntries?: boolean } = {},
): StyleMergingResult {
  const sxArgs = options.normalizeOptionalEntries ? flattenSxArrayArgs(j, styleArgs) : styleArgs;
  const sxExpr = sxArgs.length === 1 && sxArgs[0] ? sxArgs[0] : j.arrayExpression(sxArgs);
  return {
    needsSxVar: false,
    sxDecl: null,
    jsxSpreadExpr: null,
    sxPropExpr: sxExpr,
    classNameAttr: null,
    classNameBeforeSpread: false,
    styleAttr: null,
  };
}

function buildSxWithExternalPropsResult(args: {
  j: JSCodeshift;
  styleArgs: ExpressionKind[];
  classNameId: Identifier;
  styleId: Identifier;
  allowClassNameProp: boolean;
  allowStyleProp: boolean;
  staticClassNameExpr: ExpressionKind;
}): StyleMergingResult {
  const {
    j,
    styleArgs,
    classNameId,
    styleId,
    allowClassNameProp,
    allowStyleProp,
    staticClassNameExpr,
  } = args;
  const sxResult = buildSxOnlyResult(j, styleArgs, { normalizeOptionalEntries: true });
  return {
    ...sxResult,
    classNameAttr: buildClassNameAttributeExpr({
      j,
      classNameId,
      allowClassNameProp,
      staticClassNameExpr,
    }),
    styleAttr: allowStyleProp ? styleId : null,
    externalAttrsBeforeSxProp: true,
  };
}

function buildSxWithInlineStyleResult(args: {
  j: JSCodeshift;
  styleArgs: ExpressionKind[];
  classNameId: Identifier;
  styleId: Identifier;
  allowClassNameProp: boolean;
  allowStyleProp: boolean;
  inlineStyleProps: InlineStyleProp[];
  staticStyleExpr?: ExpressionKind;
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
    staticStyleExpr,
    staticClassNameExpr,
    emitTypes,
  } = args;
  const sxResult = buildSxOnlyResult(j, styleArgs, { normalizeOptionalEntries: true });
  const stylePieces: Parameters<JSCodeshift["objectExpression"]>[0] = [
    ...(staticStyleExpr ? [j.spreadElement(staticStyleExpr)] : []),
    ...inlineStyleProps.map((p) => inlineStyleProperty(j, p)),
  ];
  if (allowStyleProp) {
    stylePieces.push(j.spreadElement(styleId));
  }

  return {
    ...sxResult,
    classNameAttr: buildClassNameAttributeExpr({
      j,
      classNameId,
      allowClassNameProp,
      staticClassNameExpr,
    }),
    styleAttr:
      stylePieces.length > 0
        ? maybeCastStyleForCustomProps(
            j,
            j.objectExpression(stylePieces),
            inlineStyleProps,
            emitTypes,
          )
        : allowStyleProp
          ? styleId
          : null,
    externalAttrsBeforeSxProp: true,
  };
}

function flattenSxArrayArgs(j: JSCodeshift, styleArgs: ExpressionKind[]): ExpressionKind[] {
  const sxArgs: ExpressionKind[] = [];
  for (const arg of styleArgs) {
    appendSxArrayArg(j, sxArgs, arg);
  }
  return sxArgs;
}

function appendSxArrayArg(j: JSCodeshift, sxArgs: ExpressionKind[], arg: ExpressionKind): void {
  if (arg.type === "ArrayExpression" && arg.elements.every(isPlainArrayElement)) {
    for (const element of arg.elements) {
      appendSxArrayArg(j, sxArgs, element);
    }
    return;
  }
  sxArgs.push(normalizeOptionalSxArg(j, arg));
}

function normalizeOptionalSxArg(j: JSCodeshift, arg: ExpressionKind): ExpressionKind {
  if (isUndefinedIdentifier(arg)) {
    return j.nullLiteral();
  }
  if (isLogicalAndExpression(arg)) {
    return j.conditionalExpression(arg.left, normalizeOptionalSxArg(j, arg.right), j.nullLiteral());
  }
  if (isConditionalExpression(arg)) {
    const alternate = isUndefinedIdentifier(arg.alternate)
      ? j.nullLiteral()
      : normalizeOptionalSxArg(j, arg.alternate);
    return j.conditionalExpression(arg.test, normalizeOptionalSxArg(j, arg.consequent), alternate);
  }
  return arg;
}

function isPlainArrayElement(node: unknown): node is ExpressionKind {
  return !!node && typeof node === "object" && getNodeType(node) !== "SpreadElement";
}

function isLogicalAndExpression(arg: ExpressionKind): arg is ExpressionKind & {
  type: "LogicalExpression";
  operator: "&&";
  left: ExpressionKind;
  right: ExpressionKind;
} {
  return (
    arg.type === "LogicalExpression" &&
    (arg as { operator?: unknown }).operator === "&&" &&
    isExpressionField(arg, "left") &&
    isExpressionField(arg, "right")
  );
}

function isConditionalExpression(arg: ExpressionKind): arg is ExpressionKind & {
  type: "ConditionalExpression";
  test: ExpressionKind;
  consequent: ExpressionKind;
  alternate: ExpressionKind;
} {
  return (
    arg.type === "ConditionalExpression" &&
    isExpressionField(arg, "test") &&
    isExpressionField(arg, "consequent") &&
    isExpressionField(arg, "alternate")
  );
}

function isExpressionField(node: unknown, field: string): boolean {
  return (
    !!node &&
    typeof node === "object" &&
    isPlainArrayElement((node as Record<string, unknown>)[field])
  );
}

function getNodeType(node: unknown): string | undefined {
  if (!node || typeof node !== "object") {
    return undefined;
  }
  const type = (node as { type?: unknown }).type;
  return typeof type === "string" ? type : undefined;
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
