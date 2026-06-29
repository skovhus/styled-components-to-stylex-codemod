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
import { collectAttrsInfoAttrNames } from "./attrs-info-merge.js";

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
    return (
      ownUnsupported ||
      objectAttrConsumedByCss(d, declByLocalName) ||
      objectAttrLeaksToIntrinsicElement(d, declByLocalName)
    );
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
  const reads: CssPropReads = { names: new Set(), escapes: false };
  collectCssReadNames(decl, declByLocalName, reads, new Set());
  // A props binding used opaquely — passed to a function, spread, returned bare, or
  // read with a dynamic key — could read any prop, so we cannot prove the object
  // attr is untouched. Treat that as consuming it rather than risk emitting divergent
  // output that reads the caller's (omitted) prop while applying the attr separately.
  if (reads.escapes) {
    return true;
  }
  return [...objectKeys].some((key) => reads.names.has(key));
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
  reads: CssPropReads,
  seen: Set<string>,
): void {
  if (seen.has(decl.localName)) {
    return;
  }
  seen.add(decl.localName);
  for (const expr of decl.templateExpressions ?? []) {
    collectCssPropReads(expr, reads);
  }
  for (const candidate of declByLocalName.values()) {
    if (
      candidate.isCssHelper &&
      !seen.has(candidate.localName) &&
      expressionsReferenceAnyPath(decl.templateExpressions, new Set([candidate.localName]))
    ) {
      collectCssReadNames(candidate, declByLocalName, reads, seen);
    }
  }
  // A local styled base's CSS is inherited by the extender and evaluated with the
  // extender's attrs, so a base template that reads the prop (`Base = styled.div`
  // `width: ${p => p.config.w}px``; `Child = styled(Base).attrs({ config: {...} })`)
  // is a read of the child's attr — walk the base chain too.
  if (decl.base?.kind === "component") {
    const baseDecl = declByLocalName.get(decl.base.ident);
    if (baseDecl) {
      collectCssReadNames(baseDecl, declByLocalName, reads, seen);
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
      // The attrs merge lets a child's own attr override a base attr by name, so a
      // base object key the child redefines (e.g. with a primitive `transition:
      // "none"`) is no longer an object attr on the child. Mirror that precedence —
      // skip inherited keys the child shadows — so the effective value, not the
      // base's object literal, drives the unsupported-attrs scan.
      const ownAttrNames = collectAttrsInfoAttrNames(decl.attrsInfo);
      for (const key of effectiveObjectAttrKeys(baseDecl, declByLocalName, seen)) {
        if (!ownAttrNames.has(key)) {
          keys.add(key);
        }
      }
    }
  }
  return keys;
}

/**
 * True when a decl renders an intrinsic element yet carries an object/array attr
 * whose key is not a forwardable DOM attribute (e.g. `config`, `transition`). The
 * codemod emits a wrapper that passes the attr straight to the intrinsic element
 * (`<div config={...} />`), which both fails TypeScript — non-hyphenated unknown
 * attributes are rejected on intrinsics — and leaks a non-DOM prop styled-components
 * would filter from the host element. Neither can be represented losslessly, so bail.
 *
 * Forwardable keys (`data-*` / `aria-*`, `style`, `dangerouslySetInnerHTML`) are
 * valid DOM attributes that intrinsics accept and styled-components forwards, so
 * they are excluded. Decls that render a component (their props type governs the
 * value) are unaffected — only an intrinsic rendered target leaks.
 */
function objectAttrLeaksToIntrinsicElement(
  decl: StyledDeclLike,
  declByLocalName: ReadonlyMap<string, StyledDeclLike>,
): boolean {
  const objectKeys = effectiveObjectAttrKeys(decl, declByLocalName, new Set());
  if (objectKeys.size === 0) {
    return false;
  }
  if (!rendersIntrinsicElement(decl, declByLocalName, new Set())) {
    return false;
  }
  return [...objectKeys].some((key) => !isForwardableIntrinsicObjectAttrKey(key));
}

/** True when `key` names a DOM attribute an intrinsic element accepts and forwards. */
function isForwardableIntrinsicObjectAttrKey(key: string): boolean {
  return (
    key === "style" ||
    key === "dangerouslySetInnerHTML" ||
    key.startsWith("data-") ||
    key.startsWith("aria-")
  );
}

/**
 * True when the component a decl ultimately renders is an intrinsic element.
 * Honors a polymorphic `as` override (rendering that component instead) and
 * flattens `styled(LocalStyled)` chains to the final rendered target — mirroring
 * the wrapper emitter's `propsTarget = attrsAsTag ?? base` resolution.
 */
function rendersIntrinsicElement(
  decl: StyledDeclLike,
  declByLocalName: ReadonlyMap<string, StyledDeclLike>,
  seen: Set<string>,
): boolean {
  if (seen.has(decl.localName)) {
    return false;
  }
  seen.add(decl.localName);
  // An `as` override renders that component (a component ref, never intrinsic here),
  // so the attr is passed to it rather than to the declared base's element.
  const asTag = decl.attrsInfo?.attrsAsTag;
  if (asTag) {
    const asDecl = declByLocalName.get(asTag);
    return asDecl ? rendersIntrinsicElement(asDecl, declByLocalName, seen) : false;
  }
  if (decl.base.kind === "intrinsic") {
    return true;
  }
  // A local styled base is flattened to render its own target; an imported/external
  // component owns its props, so it is not an intrinsic leak.
  const baseDecl = declByLocalName.get(decl.base.ident);
  return baseDecl ? rendersIntrinsicElement(baseDecl, declByLocalName, seen) : false;
}

/** True when a (possibly TS-cast) attrs value node is an object/array literal. */
function isObjectOrArrayLiteralNode(value: unknown): boolean {
  let node = value as { type?: string; expression?: unknown };
  while (node?.type === "TSAsExpression" || node?.type === "TSSatisfiesExpression") {
    node = node.expression as { type?: string; expression?: unknown };
  }
  return node?.type === "ObjectExpression" || node?.type === "ArrayExpression";
}

/** Prop names a CSS interpolation reads, plus whether its props binding escapes. */
type CssPropReads = { names: Set<string>; escapes: boolean };

/**
 * Analyzes one CSS interpolation for reads of its props binding. A styled
 * interpolation is a function whose first parameter is the component's props, so a
 * read is one rooted at that binding:
 *
 *  - direct member access — `p.transition` / static computed `p["transition"]`,
 *  - a destructured parameter — `({ transition }) => ...`,
 *  - a destructure or alias in the body — `const { transition } = p` / `const q = p`
 *    then `q.transition` (resolved to a fixpoint, since aliases can chain).
 *
 * Reads through any other object are ignored, so a module-scope value sharing an
 * attr's key name (`${() => palette.transition}`) is not a props read. But when the
 * binding is used opaquely — passed to a function, spread, returned bare, or read
 * with a dynamic key — we cannot tell which prop is read, so `escapes` is set and
 * the caller conservatively treats every object attr as consumed.
 */
function collectCssPropReads(expr: unknown, reads: CssPropReads): void {
  // Identifiers bound to the props object: the function parameter plus any aliases.
  const bindings = new Set<string>();
  // Identifier *nodes* that are an accounted use of a binding — its declaration, a
  // member-access object, or an alias initializer — so the escape pass can tell a
  // tracked use from a bare one. Keyed by node identity (each AST node is distinct).
  const accounted = new Set<object>();

  collectParamBindings(expr, reads, bindings, accounted, false);
  // Body destructures/aliases can reference a binding declared earlier and introduce
  // new bindings, so re-scan until the binding/name sets stop growing.
  for (;;) {
    const sizeBefore = bindings.size + reads.names.size;
    collectBodyBindings(expr, reads, bindings, accounted);
    if (bindings.size + reads.names.size === sizeBefore) {
      break;
    }
  }
  collectMemberReads(expr, reads, bindings, accounted);
  if (hasUnaccountedBindingRef(expr, bindings, accounted)) {
    reads.escapes = true;
  }
}

const FUNCTION_NODE_TYPES = new Set([
  "ArrowFunctionExpression",
  "FunctionExpression",
  "FunctionDeclaration",
]);

const SKIP_AST_KEYS = new Set(["loc", "start", "end", "range", "comments"]);

/**
 * Records the props binding an interpolation's outermost function introduces: an
 * Identifier first parameter (`(p) => ...`) becomes a binding; a destructured first
 * parameter (`({ transition }) => ...`) contributes its keys as direct reads. Only
 * the outermost function's first parameter is props; nested-callback parameters
 * bind something else and are skipped.
 */
function collectParamBindings(
  node: unknown,
  reads: CssPropReads,
  bindings: Set<string>,
  accounted: Set<object>,
  insideFunction: boolean,
): void {
  if (!node || typeof node !== "object") {
    return;
  }
  if (Array.isArray(node)) {
    for (const child of node) {
      collectParamBindings(child, reads, bindings, accounted, insideFunction);
    }
    return;
  }
  const n = node as Record<string, unknown>;
  let nextInsideFunction = insideFunction;
  if (typeof n.type === "string" && FUNCTION_NODE_TYPES.has(n.type)) {
    if (!insideFunction) {
      addBindingTarget((n.params as unknown[] | undefined)?.[0], reads, bindings, accounted);
    }
    nextInsideFunction = true;
  }
  for (const key of Object.keys(n)) {
    if (SKIP_AST_KEYS.has(key)) {
      continue;
    }
    collectParamBindings(n[key], reads, bindings, accounted, nextInsideFunction);
  }
}

/**
 * Registers a props-binding target (a parameter, or the left side of an alias/
 * destructure): an Identifier becomes a binding; an object pattern contributes its
 * keys as reads and a rest element (`...rest`) as a further binding. Defaulted
 * targets (`(p = {}) => ...`) wrap the binding in an `AssignmentPattern`, so unwrap.
 */
function addBindingTarget(
  target: unknown,
  reads: CssPropReads,
  bindings: Set<string>,
  accounted: Set<object>,
): void {
  let node = target as { type?: string; left?: unknown; name?: unknown } | undefined;
  while (node?.type === "AssignmentPattern") {
    node = node.left as { type?: string; left?: unknown; name?: unknown } | undefined;
  }
  if (node?.type === "Identifier" && typeof node.name === "string") {
    bindings.add(node.name);
    accounted.add(node);
  } else if (node?.type === "ObjectPattern") {
    addObjectPatternKeys(node, reads, bindings, accounted);
  }
}

/**
 * Adds an object-pattern's static keys as reads; a rest element binds the remaining
 * props (also a binding). A computed key (`{ [k]: v }`) reads an unknown prop, so it
 * is treated as an escape.
 */
function addObjectPatternKeys(
  pattern: unknown,
  reads: CssPropReads,
  bindings: Set<string>,
  accounted: Set<object>,
): void {
  const properties = (pattern as { properties?: Array<Record<string, unknown>> }).properties ?? [];
  for (const prop of properties) {
    if (prop?.type === "RestElement") {
      addBindingTarget(prop.argument, reads, bindings, accounted);
      continue;
    }
    if (prop?.computed === true) {
      reads.escapes = true;
      continue;
    }
    const key = prop?.key as { type?: string; name?: unknown; value?: unknown } | undefined;
    if (key?.type === "Identifier" && typeof key.name === "string") {
      reads.names.add(key.name);
    } else if (key?.type === "StringLiteral" && typeof key.value === "string") {
      reads.names.add(key.value);
    }
  }
}

/**
 * Finds body destructures/aliases of an existing binding — `const { transition } = p`
 * (keys become reads) and `const q = p` (a new binding) — and accounts the binding
 * references they consume so the escape pass does not flag them.
 */
function collectBodyBindings(
  node: unknown,
  reads: CssPropReads,
  bindings: Set<string>,
  accounted: Set<object>,
): void {
  if (!node || typeof node !== "object") {
    return;
  }
  if (Array.isArray(node)) {
    for (const child of node) {
      collectBodyBindings(child, reads, bindings, accounted);
    }
    return;
  }
  const n = node as Record<string, unknown>;
  if (n.type === "VariableDeclarator") {
    const init = n.init as { type?: string; name?: unknown } | undefined;
    if (init?.type === "Identifier" && typeof init.name === "string" && bindings.has(init.name)) {
      accounted.add(init);
      addBindingTarget(n.id, reads, bindings, accounted);
    }
  }
  for (const key of Object.keys(n)) {
    if (SKIP_AST_KEYS.has(key)) {
      continue;
    }
    collectBodyBindings(n[key], reads, bindings, accounted);
  }
}

/**
 * Records a read for every member access rooted at a binding — `p.transition` and
 * static computed `p["transition"]` (both → "transition") — and accounts the object
 * identifier so it is not mistaken for an escape. A dynamic computed key
 * (`p[expr]`) reads an unknown prop, so it is treated as an escape.
 */
function collectMemberReads(
  node: unknown,
  reads: CssPropReads,
  bindings: ReadonlySet<string>,
  accounted: Set<object>,
): void {
  if (!node || typeof node !== "object") {
    return;
  }
  if (Array.isArray(node)) {
    for (const child of node) {
      collectMemberReads(child, reads, bindings, accounted);
    }
    return;
  }
  const n = node as Record<string, unknown>;
  if (n.type === "MemberExpression" || n.type === "OptionalMemberExpression") {
    const object = n.object as { type?: string; name?: unknown } | undefined;
    if (
      object?.type === "Identifier" &&
      typeof object.name === "string" &&
      bindings.has(object.name)
    ) {
      accounted.add(object);
      const property = n.property as { type?: string; name?: unknown; value?: unknown } | undefined;
      if (
        n.computed !== true &&
        property?.type === "Identifier" &&
        typeof property.name === "string"
      ) {
        reads.names.add(property.name);
      } else if (
        n.computed === true &&
        property?.type === "StringLiteral" &&
        typeof property.value === "string"
      ) {
        // Static computed read: `p["transition"]`.
        reads.names.add(property.value);
      } else {
        // Dynamic computed read (`p[expr]`): the key is unknown, so any attr may be read.
        reads.escapes = true;
      }
    }
  }
  for (const key of Object.keys(n)) {
    if (SKIP_AST_KEYS.has(key)) {
      continue;
    }
    collectMemberReads(n[key], reads, bindings, accounted);
  }
}

/**
 * True when a binding identifier is referenced anywhere other than the accounted
 * positions (its declaration, a member-access object, an alias initializer) — i.e.
 * the binding escapes into a context we cannot analyze, so the read set is unknown.
 */
function hasUnaccountedBindingRef(
  node: unknown,
  bindings: ReadonlySet<string>,
  accounted: ReadonlySet<object>,
): boolean {
  if (!node || typeof node !== "object") {
    return false;
  }
  if (Array.isArray(node)) {
    return node.some((child) => hasUnaccountedBindingRef(child, bindings, accounted));
  }
  const n = node as Record<string, unknown>;
  if (
    n.type === "Identifier" &&
    typeof n.name === "string" &&
    bindings.has(n.name) &&
    !accounted.has(n)
  ) {
    return true;
  }
  for (const key of Object.keys(n)) {
    if (SKIP_AST_KEYS.has(key)) {
      continue;
    }
    if (hasUnaccountedBindingRef(n[key], bindings, accounted)) {
      return true;
    }
  }
  return false;
}
