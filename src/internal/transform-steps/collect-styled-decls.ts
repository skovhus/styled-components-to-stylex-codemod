/**
 * Step: collect styled declarations and helper mixins.
 * Core concepts: declaration extraction and helper normalization.
 */
import { assertNoNullNodesInArrays } from "../utilities/ast-safety.js";
import { collectStyledDecls } from "../collect-styled-decls.js";
import { extractStyledCallArgs } from "../extract-styled-call-args.js";
import { findUncollectedStyledTemplateLoc } from "../utilities/uncollected-styled-template.js";
import { formatOutput } from "../utilities/format-output.js";
import { UNSUPPORTED_SHOULD_FORWARD_PROP_WARNING } from "../logger.js";
import { CONTINUE, returnResult, type StepResult } from "../transform-types.js";
import { TransformContext } from "../transform-context.js";
import { applyTypeScriptMetadataToDecl } from "../utilities/typescript-metadata.js";
import { expressionsReferenceAnyPath } from "../utilities/member-expression-paths.js";

/**
 * Collects styled declarations and merges extracted css helper declarations.
 */
export function collectStyledDeclsStep(ctx: TransformContext): StepResult {
  const { styledImports, root, j, cssLocal } = ctx;
  if (!styledImports) {
    return CONTINUE;
  }

  // We can have styled-components usage without a default import (e.g. only `keyframes` or `css`).
  // Don't early-return; instead apply what we can.
  const styledDefaultSpecifier = styledImports.find(j.ImportDefaultSpecifier).nodes()[0];
  const namedStyledSpecifier = !styledDefaultSpecifier
    ? styledImports
        .find(j.ImportSpecifier)
        .filter(
          (p: any) => p.node.imported?.type === "Identifier" && p.node.imported.name === "styled",
        )
        .nodes()[0]
    : undefined;
  const styledDefaultImport =
    styledDefaultSpecifier?.local?.type === "Identifier"
      ? styledDefaultSpecifier.local.name
      : namedStyledSpecifier?.local?.type === "Identifier"
        ? namedStyledSpecifier.local.name
        : undefined;
  ctx.styledDefaultImport = styledDefaultImport;

  // Pre-process: extract CallExpression arguments from styled() calls into separate variables.
  // This transforms patterns like styled(motion.create(Component)) into:
  //   const MotionComponent = motion.create(Component);
  //   styled(MotionComponent)
  // which can then be handled by the normal styled(Identifier) collection path.
  if (extractStyledCallArgs({ root, j, styledDefaultImport })) {
    ctx.markChanged();
  }

  const collected = collectStyledDecls({
    root,
    j,
    styledDefaultImport,
    cssLocal,
  });

  const styledDecls = collected.styledDecls;
  for (const decl of styledDecls) {
    applyTypeScriptMetadataToDecl(ctx, decl, [decl.localName]);
  }
  let hasUniversalSelectors = collected.hasUniversalSelectors;
  let universalSelectorLoc = collected.universalSelectorLoc;

  const cssHelpers = ctx.cssHelpers;
  if (cssHelpers?.cssHelperDecls?.length > 0) {
    styledDecls.push(...cssHelpers.cssHelperDecls);
    styledDecls.sort((a: any, b: any) => {
      const aIdx = a.declIndex ?? Number.POSITIVE_INFINITY;
      const bIdx = b.declIndex ?? Number.POSITIVE_INFINITY;
      if (aIdx !== bIdx) {
        return aIdx - bIdx;
      }
      return 0;
    });
  }

  ctx.styledDecls = styledDecls;
  const uncollectedStyledTemplateLoc = findUncollectedStyledTemplateLoc({
    root: ctx.root,
    j: ctx.j,
    isStyledTag: ctx.isStyledTag,
    styledDecls: ctx.styledDecls,
  });
  if (!(ctx.options.allowPartialMigration ?? false) && uncollectedStyledTemplateLoc !== undefined) {
    ctx.warnings.push({
      severity: "warning",
      type: "Higher-order styled factory wrappers (e.g. hoc(styled)) are not supported",
      loc: uncollectedStyledTemplateLoc,
    });
    return returnResult({ code: null, warnings: ctx.warnings }, "bail");
  }

  // Check for unparseable shouldForwardProp - bail to avoid semantic changes
  const unparseableSfpDecl = styledDecls.find(
    (d) => !d.skipTransform && d.hasUnparseableShouldForwardProp,
  );
  if (unparseableSfpDecl) {
    ctx.warnings.push({
      severity: "warning",
      type: UNSUPPORTED_SHOULD_FORWARD_PROP_WARNING,
      loc: unparseableSfpDecl.loc,
    });
    return returnResult({ code: null, warnings: ctx.warnings }, "bail");
  }

  // Both function- and object-form attrs bail when they carry a value we cannot
  // represent (e.g. spreads/getters, inline functions). Object-form unsupported
  // values used to fall through and silently drop the attr, which is lossy.
  // Object/array attrs read by a CSS interpolation (`${p => p.transition.duration}`)
  // also bail: the lowering only substitutes primitive static attrs into
  // interpolations, so the emitted style would read the caller's prop (or throw on
  // an omitted one) while the attr is applied separately — diverging from
  // styled-components, which feeds the attr value into the CSS.
  const declByLocalName = new Map(styledDecls.map((d) => [d.localName, d]));
  const unsupportedAttrsDecls = styledDecls.filter((d) => {
    if (d.skipTransform) {
      return false;
    }
    const ownUnsupported =
      (d.attrsInfo?.sourceKind === "function" || d.attrsInfo?.sourceKind === "object") &&
      d.attrsInfo.hasUnsupportedValues === true;
    // The CSS-read check also covers decls with no own attrs that inherit an
    // object attr from a local base, so it is evaluated independently.
    return ownUnsupported || objectAttrConsumedByCss(d, declByLocalName);
  });
  if (unsupportedAttrsDecls.length > 0) {
    for (const d of unsupportedAttrsDecls) {
      ctx.warnings.push({
        severity: "warning",
        type:
          d.attrsInfo?.sourceKind === "function" && d.attrsInfo.hasUnsupportedValues === true
            ? "Unsupported .attrs() callback pattern"
            : "Unsupported .attrs() object value",
        loc: d.loc,
      });
    }
    // Under partial migration, preserve only the offending declarations so
    // convertible siblings still migrate; otherwise bail the whole file.
    if (ctx.options.allowPartialMigration === true) {
      for (const d of unsupportedAttrsDecls) {
        d.skipTransform = true;
      }
    } else {
      return returnResult({ code: null, warnings: ctx.warnings }, "bail");
    }
  }

  // If we didn't find any styled declarations but performed other edits (e.g. keyframes conversion),
  // we'll still emit output without injecting StyleX styles.
  if (styledDecls.length === 0) {
    return returnResult(
      {
        code: ctx.hasChanges
          ? formatOutput(
              (assertNoNullNodesInArrays(root.get().node),
              root.toSource({
                quote: "double",
                trailingComma: true,
                reuseWhitespace: false,
              })),
            )
          : null,
        warnings: ctx.warnings,
      },
      "skip",
    );
  }

  if (cssHelpers?.cssHelperHasUniversalSelectors) {
    hasUniversalSelectors = true;
    if (!universalSelectorLoc) {
      universalSelectorLoc = cssHelpers.cssHelperUniversalSelectorLoc;
    }
  }

  ctx.hasUniversalSelectors = hasUniversalSelectors;
  ctx.universalSelectorLoc = universalSelectorLoc;

  // Universal selectors (`*`) are currently unsupported (too many edge cases to map to StyleX safely).
  // With partial migration enabled, preserve only the declarations that contain them; otherwise keep
  // the legacy whole-file bail.
  if (hasUniversalSelectors) {
    ctx.warnings.push({
      severity: "warning",
      type: "Universal selectors (`*`) are currently unsupported",
      loc: universalSelectorLoc,
    });
    if (ctx.options.allowPartialMigration === true) {
      markUniversalSelectorCssHelperConsumersSkipped(styledDecls);
      for (const decl of styledDecls) {
        if (decl.hasUniversalSelector) {
          decl.skipTransform = true;
          if (decl.isCssHelper) {
            decl.preserveCssHelperDeclaration = true;
            decl.suppressCssHelperStyleEmission = true;
          }
        }
      }
      return CONTINUE;
    }
    return returnResult({ code: null, warnings: ctx.warnings }, "bail");
  }

  return CONTINUE;
}

function markUniversalSelectorCssHelperConsumersSkipped(
  styledDecls: NonNullable<TransformContext["styledDecls"]>,
): void {
  const universalCssHelperNames = new Set(
    styledDecls
      .filter((decl) => decl.isCssHelper && decl.hasUniversalSelector)
      .map((decl) => decl.localName),
  );
  if (universalCssHelperNames.size === 0) {
    return;
  }
  for (const decl of styledDecls) {
    if (decl.isCssHelper || decl.skipTransform) {
      continue;
    }
    if (expressionsReferenceAnyPath(decl.templateExpressions, universalCssHelperNames)) {
      decl.skipTransform = true;
    }
  }
}

type StyledDeclLike = NonNullable<TransformContext["styledDecls"]>[number];

/**
 * True when an object/array attr's key is read by a CSS interpolation (e.g.
 * `${p => p.transition.duration}` or `${({ transition }) => transition.duration}`
 * with a `transition` object attr). The lowering only substitutes primitive static
 * attrs into interpolations, so the emitted style would read the caller's prop (or
 * throw on an omitted one) while the attr is applied separately — diverging from
 * styled-components, which feeds the attr value into the CSS. These cases bail.
 *
 * Considers attrs inherited from local styled bases (`Child = styled(Base)`),
 * since the attrs merge passes the inherited object attr down to the child.
 */
function objectAttrConsumedByCss(
  decl: StyledDeclLike,
  declByLocalName: ReadonlyMap<string, StyledDeclLike>,
): boolean {
  const objectKeys = effectiveObjectAttrKeys(decl, declByLocalName, new Set());
  if (objectKeys.size === 0) {
    return false;
  }
  const readNames = new Set<string>();
  collectCssReadNames(decl, declByLocalName, readNames, new Set());
  return [...objectKeys].some((key) => readNames.has(key));
}

/**
 * Collects prop-read names from a decl's own CSS interpolations and from any
 * local `css` helpers it references (`${motionStyles}`), recursively. A referenced
 * helper's interpolations are inlined into the template, so a prop read inside the
 * helper reads the consuming component's props just like an inline interpolation.
 */
function collectCssReadNames(
  decl: StyledDeclLike,
  declByLocalName: ReadonlyMap<string, StyledDeclLike>,
  out: Set<string>,
  seen: Set<string>,
): void {
  if (seen.has(decl.localName)) {
    return;
  }
  seen.add(decl.localName);
  for (const expr of decl.templateExpressions ?? []) {
    collectCssPropReadNames(expr, out);
  }
  for (const candidate of declByLocalName.values()) {
    if (
      candidate.isCssHelper &&
      !seen.has(candidate.localName) &&
      expressionsReferenceAnyPath(decl.templateExpressions, new Set([candidate.localName]))
    ) {
      collectCssReadNames(candidate, declByLocalName, out, seen);
    }
  }
}

/**
 * Object/array attr keys a decl carries, including those inherited from local
 * styled bases (the attrs merge copies a base's attrs into its extenders).
 */
function effectiveObjectAttrKeys(
  decl: StyledDeclLike,
  declByLocalName: ReadonlyMap<string, StyledDeclLike>,
  seen: Set<string>,
): Set<string> {
  const keys = new Set<string>();
  if (seen.has(decl.localName)) {
    return keys;
  }
  seen.add(decl.localName);
  // Both object-form and function-form `.attrs` record static object/array
  // literals in `staticAttrs` (a function returning a constant object is still
  // static), and both diverge from styled-components when that value is read by a
  // CSS interpolation — so collect them regardless of source kind.
  for (const [key, value] of Object.entries(decl.attrsInfo?.staticAttrs ?? {})) {
    if (isObjectOrArrayLiteralNode(value)) {
      keys.add(key);
    }
  }
  if (decl.base?.kind === "component") {
    const baseDecl = declByLocalName.get(decl.base.ident);
    if (baseDecl) {
      for (const key of effectiveObjectAttrKeys(baseDecl, declByLocalName, seen)) {
        keys.add(key);
      }
    }
  }
  return keys;
}

/** True when a (possibly TS-cast) attrs value node is an object/array literal. */
function isObjectOrArrayLiteralNode(value: unknown): boolean {
  let node = value as { type?: string; expression?: unknown };
  while (node?.type === "TSAsExpression" || node?.type === "TSSatisfiesExpression") {
    node = node.expression as { type?: string; expression?: unknown };
  }
  return node?.type === "ObjectExpression" || node?.type === "ArrayExpression";
}

/**
 * Collects prop names a CSS interpolation reads: non-computed member-access
 * properties (`p.transition` → "transition") and destructured object-pattern keys
 * (`({ transition }) => ...` → "transition"), so a prop read either way is caught.
 */
function collectCssPropReadNames(node: unknown, out: Set<string>): void {
  if (!node || typeof node !== "object") {
    return;
  }
  if (Array.isArray(node)) {
    for (const child of node) {
      collectCssPropReadNames(child, out);
    }
    return;
  }
  const n = node as Record<string, unknown>;
  const property = n.property as { type?: string; name?: unknown } | undefined;
  if (
    (n.type === "MemberExpression" || n.type === "OptionalMemberExpression") &&
    n.computed !== true &&
    property?.type === "Identifier" &&
    typeof property.name === "string"
  ) {
    out.add(property.name);
  }
  if (n.type === "ObjectPattern") {
    for (const prop of (n.properties as Array<Record<string, unknown>>) ?? []) {
      if (prop?.computed === true) {
        continue;
      }
      const key = prop?.key as { type?: string; name?: unknown; value?: unknown } | undefined;
      if (key?.type === "Identifier" && typeof key.name === "string") {
        out.add(key.name);
      } else if (key?.type === "StringLiteral" && typeof key.value === "string") {
        out.add(key.value);
      }
    }
  }
  for (const key of Object.keys(n)) {
    if (
      key === "loc" ||
      key === "start" ||
      key === "end" ||
      key === "range" ||
      key === "comments"
    ) {
      continue;
    }
    collectCssPropReadNames(n[key], out);
  }
}
