/**
 * Transient ($-prefixed) prop rename machinery extracted from analyze-before-emit.
 * Renames transient prop names across every field of a StyledDecl (style keys,
 * variant conditions, attrs, inline styles, referenced TS types, …) and provides
 * the supporting AST identifier-walk and type-prop collection helpers.
 */
import type { JSCodeshift } from "jscodeshift";
import type { StyledDecl } from "../transform-types.js";
import { TransformContext } from "../transform-context.js";
import { escapeRegex } from "../utilities/string-utils.js";
import { renameVariantSourceOrderConditions } from "../lower-rules/variant-utils.js";
import { nearestNamespacePath } from "./namespace-scope.js";

export function shouldResolveReferencedPropsForTransientRename(
  root: ReturnType<JSCodeshift>,
  j: JSCodeshift,
  propsType: unknown,
): boolean {
  const typeRef = propsType as { type?: string; typeName?: { type?: string; name?: string } };
  if (typeRef?.type !== "TSTypeReference" || typeRef.typeName?.type !== "Identifier") {
    return false;
  }
  const typeName = typeRef.typeName.name;
  const isNamespaced = (path: { parentPath?: unknown }): boolean => {
    let cur = path.parentPath as { node?: { type?: string }; parentPath?: unknown } | undefined;
    while (cur) {
      if (cur.node?.type === "TSModuleDeclaration") {
        return true;
      }
      cur = cur.parentPath as typeof cur;
    }
    return false;
  };
  return (
    root
      .find(j.TSInterfaceDeclaration)
      .filter(
        (p) => p.node.id.type === "Identifier" && p.node.id.name === typeName && isNamespaced(p),
      )
      .size() > 0 ||
    root
      .find(j.TSTypeAliasDeclaration)
      .filter((p) => p.node.id.name === typeName && isNamespaced(p))
      .size() > 0
  );
}

/**
 * Applies transient prop renames to all relevant fields of a StyledDecl.
 */
export function applyTransientPropRenames(decl: StyledDecl, renames: Map<string, string>): void {
  if (decl.variantStyleKeys) {
    const updated: Record<string, string> = {};
    for (const [when, key] of Object.entries(decl.variantStyleKeys)) {
      updated[renamePropsInWhenString(when, renames)] = key;
    }
    decl.variantStyleKeys = updated;
  }

  if (decl.variantSourceOrder) {
    const updated: Record<string, number> = {};
    for (const [when, order] of Object.entries(decl.variantSourceOrder)) {
      updated[renamePropsInWhenString(when, renames)] = order;
    }
    decl.variantSourceOrder = updated;
  }
  renameVariantSourceOrderConditions(decl, (when) => renamePropsInWhenString(when, renames));

  if (decl.styleFnFromProps) {
    for (const sf of decl.styleFnFromProps) {
      sf.jsxProp = renames.get(sf.jsxProp) ?? sf.jsxProp;
      if (sf.propsObjectKey) {
        sf.propsObjectKey = renames.get(sf.propsObjectKey) ?? sf.propsObjectKey;
      }
      if (sf.conditionWhen) {
        sf.conditionWhen = renamePropsInWhenString(sf.conditionWhen, renames);
      }
      if (sf.callArg) {
        renameIdentifiersInAst(sf.callArg, renames);
      }
      if (sf.extraCallArgs) {
        for (const extra of sf.extraCallArgs) {
          extra.jsxProp = renames.get(extra.jsxProp) ?? extra.jsxProp;
          if (extra.callArg) {
            renameIdentifiersInAst(extra.callArg, renames);
          }
        }
      }
    }
  }

  if (decl.inlineStyleProps) {
    for (const isp of decl.inlineStyleProps) {
      const jprop = isp.jsxProp ?? isp.prop;
      const renamed = renames.get(jprop);
      if (renamed) {
        if (isp.jsxProp) {
          isp.jsxProp = renamed;
        } else {
          isp.prop = renamed;
        }
      }
      renameIdentifiersInAst(isp.expr, renames);
    }
  }

  if (decl.compoundVariants) {
    for (const cv of decl.compoundVariants) {
      if (cv.kind === "3branch" || cv.kind === "4branch") {
        cv.outerProp = renames.get(cv.outerProp) ?? cv.outerProp;
        cv.innerProp = renames.get(cv.innerProp) ?? cv.innerProp;
        if (cv.kind === "3branch") {
          cv.innerTruthyWhen = renamePropsInWhenString(cv.innerTruthyWhen, renames);
          cv.innerFalsyWhen = renamePropsInWhenString(cv.innerFalsyWhen, renames);
        }
      }
    }
  }

  if (decl.variantDimensions) {
    for (const vd of decl.variantDimensions) {
      const renamedProp = renames.get(vd.propName);
      if (renamedProp) {
        // Also update the variant object name if it was derived from the $-prefixed prop name
        if (vd.variantObjectName.startsWith(vd.propName)) {
          vd.variantObjectName = renamedProp + vd.variantObjectName.slice(vd.propName.length);
        }
        vd.propName = renamedProp;
      }
    }
  }

  if (decl.staticBooleanVariants) {
    for (const sbv of decl.staticBooleanVariants) {
      sbv.propName = renames.get(sbv.propName) ?? sbv.propName;
    }
  }

  if (decl.enumVariant) {
    decl.enumVariant.propName = renames.get(decl.enumVariant.propName) ?? decl.enumVariant.propName;
  }

  walkTypePropNames(decl.propsType, (name, keyNode) => {
    const renamed = renames.get(name);
    if (renamed) {
      keyNode.name = renamed;
    }
  });

  if (decl.shouldForwardProp?.dropProps) {
    decl.shouldForwardProp.dropProps = decl.shouldForwardProp.dropProps.map(
      (p) => renames.get(p) ?? p,
    );
  }

  if (decl.attrsInfo?.defaultAttrs) {
    for (const attr of decl.attrsInfo.defaultAttrs) {
      attr.jsxProp = renames.get(attr.jsxProp) ?? attr.jsxProp;
      attr.attrName = renames.get(attr.attrName) ?? attr.attrName;
    }
  }
  if (decl.attrsInfo?.conditionalAttrs) {
    for (const attr of decl.attrsInfo.conditionalAttrs) {
      attr.jsxProp = renames.get(attr.jsxProp) ?? attr.jsxProp;
      attr.attrName = renames.get(attr.attrName) ?? attr.attrName;
    }
  }
  if (decl.attrsInfo?.invertedBoolAttrs) {
    for (const attr of decl.attrsInfo.invertedBoolAttrs) {
      attr.jsxProp = renames.get(attr.jsxProp) ?? attr.jsxProp;
      attr.attrName = renames.get(attr.attrName) ?? attr.attrName;
    }
  }
  if (decl.attrsInfo?.dynamicAttrs) {
    for (const attr of decl.attrsInfo.dynamicAttrs) {
      attr.jsxProp = renames.get(attr.jsxProp) ?? attr.jsxProp;
      attr.attrName = renames.get(attr.attrName) ?? attr.attrName;
    }
  }
  if (decl.attrsInfo?.staticAttrs) {
    decl.attrsInfo.staticAttrs = renameStaticAttrKeys(decl.attrsInfo.staticAttrs, renames);
  }
  if (decl.attrsInfo?.attrsDynamicStyles) {
    for (const ds of decl.attrsInfo.attrsDynamicStyles) {
      ds.jsxProp = renames.get(ds.jsxProp) ?? ds.jsxProp;
      renameIdentifiersInAst(ds.callArgExpr, renames);
    }
  }

  if (decl.extraStylexPropsArgs) {
    for (const arg of decl.extraStylexPropsArgs) {
      if (arg.when) {
        arg.when = renamePropsInWhenString(arg.when, renames);
      }
      renameIdentifiersInAst(arg.expr, renames);
    }
  }

  if (decl.preResolvedFnDecls) {
    for (const value of Object.values(decl.preResolvedFnDecls)) {
      renameIdentifiersInAst(value, renames);
    }
  }

  if (decl.pseudoAliasSelectors) {
    for (const pas of decl.pseudoAliasSelectors) {
      if (pas.guard?.when) {
        pas.guard.when = renamePropsInWhenString(pas.guard.when, renames);
      }
    }
  }

  if (decl.callSiteCombinedStyles) {
    for (const cs of decl.callSiteCombinedStyles) {
      cs.propNames = cs.propNames.map((p) => renames.get(p) ?? p);
    }
  }
}

/**
 * Collects all style keys that belong to a decl (for renaming in resolvedStyleObjects).
 */
export function collectAllStyleKeysForDecl(decl: StyledDecl): string[] {
  const keys: string[] = [decl.styleKey];
  if (decl.adjacentSiblingStyleKey) {
    keys.push(decl.adjacentSiblingStyleKey);
  }
  for (const key of Object.values(decl.variantStyleKeys ?? {})) {
    keys.push(key);
  }
  for (const sf of decl.styleFnFromProps ?? []) {
    keys.push(sf.fnKey);
  }
  for (const key of decl.extraStyleKeys ?? []) {
    keys.push(key);
  }
  for (const key of decl.extraStyleKeysAfterBase ?? []) {
    keys.push(key);
  }
  if (decl.preResolvedFnDecls) {
    for (const key of Object.keys(decl.preResolvedFnDecls)) {
      keys.push(key);
    }
  }
  if (decl.enumVariant) {
    keys.push(decl.enumVariant.baseKey);
    for (const c of decl.enumVariant.cases) {
      keys.push(c.styleKey);
    }
  }
  for (const sbv of decl.staticBooleanVariants ?? []) {
    keys.push(sbv.styleKey);
  }
  for (const cs of decl.callSiteCombinedStyles ?? []) {
    keys.push(cs.styleKey);
  }
  for (const ps of decl.promotedStyleProps ?? []) {
    if (!ps.mergeIntoBase) {
      keys.push(ps.styleKey);
    }
  }
  for (const pas of decl.pseudoAliasSelectors ?? []) {
    keys.push(...pas.styleKeys);
  }
  for (const pes of decl.pseudoExpandSelectors ?? []) {
    keys.push(pes.styleKey);
  }
  if (decl.attrWrapper) {
    const aw = decl.attrWrapper;
    for (const k of [
      aw.checkboxKey,
      aw.radioKey,
      aw.readonlyKey,
      aw.externalKey,
      aw.httpsKey,
      aw.pdfKey,
    ]) {
      if (k) {
        keys.push(k);
      }
    }
  }
  return keys;
}

/**
 * Recursively renames identifiers in an AST expression node based on the rename map.
 * Only walks structural AST properties (skips metadata like `loc`, `comments`, etc.).
 */
export function renameIdentifiersInAst(node: unknown, renames: Map<string, string>): void {
  if (!node || typeof node !== "object") {
    return;
  }
  const n = node as Record<string, unknown>;
  if (typeof n.type !== "string") {
    return;
  }
  if (n.type === "Identifier" && typeof n.name === "string") {
    const renamed = renames.get(n.name);
    if (renamed) {
      n.name = renamed;
    }
    // Continue walking into Identifier's other properties (e.g., typeAnnotation)
    // which may contain nested identifiers that need renaming.
  }
  for (const [key, value] of Object.entries(n)) {
    if (AST_METADATA_KEYS.has(key)) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        renameIdentifiersInAst(item, renames);
      }
    } else if (value && typeof value === "object") {
      renameIdentifiersInAst(value, renames);
    }
  }
}

export function transientRenameWouldTouchExpressionIdentifier(
  decl: StyledDecl,
  propName: string,
): boolean {
  for (const styleFn of decl.styleFnFromProps ?? []) {
    if (astContainsIdentifier(styleFn.callArg, propName)) {
      return true;
    }
    for (const extra of styleFn.extraCallArgs ?? []) {
      if (astContainsIdentifier(extra.callArg, propName)) {
        return true;
      }
    }
  }
  for (const inlineStyle of decl.inlineStyleProps ?? []) {
    if (astContainsIdentifier(inlineStyle.expr, propName)) {
      return true;
    }
  }
  return false;
}

export function transientRenameWouldTouchResolvedStyleObject(
  decl: StyledDecl,
  propName: string,
  resolvedStyleObjects: Map<string, unknown> | undefined,
): boolean {
  if (!resolvedStyleObjects) {
    return false;
  }
  for (const styleKey of collectAllStyleKeysForDecl(decl)) {
    const value = resolvedStyleObjects.get(styleKey);
    if (value && typeof value === "object" && astContainsIdentifier(value, propName)) {
      return true;
    }
  }
  return false;
}

export function transientRenameHasNormalizedPropUsage(decl: StyledDecl, propName: string): boolean {
  const normalized = propName.startsWith("$") ? propName.slice(1) : propName;
  for (const styleFn of decl.styleFnFromProps ?? []) {
    if (astContainsIdentifier(styleFn.callArg, normalized)) {
      return true;
    }
    for (const extra of styleFn.extraCallArgs ?? []) {
      if (astContainsIdentifier(extra.callArg, normalized)) {
        return true;
      }
    }
  }
  for (const inlineStyle of decl.inlineStyleProps ?? []) {
    if (astContainsIdentifier(inlineStyle.expr, normalized)) {
      return true;
    }
  }
  return false;
}

/**
 * Renames `$`-prefixed members in interface/type alias declarations
 * referenced by a propsType AST node.
 */
export function renameTransientPropsInReferencedTypes(
  root: ReturnType<JSCodeshift>,
  j: JSCodeshift,
  propsType:
    | {
        type?: string;
        typeName?: { type?: string; name?: string };
        types?: unknown[];
      }
    | undefined,
  renames: Map<string, string>,
  namespaceChain: ReadonlyArray<string | null>,
): void {
  if (!propsType) {
    return;
  }
  if (propsType.type === "TSTypeReference" && propsType.typeName?.type === "Identifier") {
    const typeName = propsType.typeName.name;
    if (!typeName) {
      return;
    }
    const interfaceDecl = findFirstTypeDeclInChain(
      root,
      j.TSInterfaceDeclaration,
      typeName,
      namespaceChain,
    );
    if (interfaceDecl) {
      for (const member of (interfaceDecl.body?.body ?? []) as any[]) {
        if (member.type === "TSPropertySignature" && member.key?.type === "Identifier") {
          const renamed = renames.get(member.key.name);
          if (renamed) {
            member.key.name = renamed;
          }
        }
      }
    }
    const typeAliasDecl = findFirstTypeDeclInChain(
      root,
      j.TSTypeAliasDeclaration,
      typeName,
      namespaceChain,
    );
    if (typeAliasDecl) {
      walkTypePropNames(typeAliasDecl.typeAnnotation, (name, keyNode) => {
        const renamed = renames.get(name);
        if (renamed) {
          keyNode.name = renamed;
        }
      });
    }
  }
  if (propsType.type === "TSIntersectionType" && Array.isArray(propsType.types)) {
    for (const t of propsType.types) {
      renameTransientPropsInReferencedTypes(
        root,
        j,
        t as typeof propsType,
        renames,
        namespaceChain,
      );
    }
  }
}

export type TypeNodeLike = { type?: string; members?: unknown[]; types?: unknown[] } | undefined;

/**
 * Walks TSPropertySignature members in a type AST node (TSTypeLiteral,
 * TSIntersectionType) and calls `visitor` with each member's key name
 * and the key node itself. Used for both collecting and renaming props.
 */
export function walkTypePropNames(
  typeNode: TypeNodeLike,
  visitor: (name: string, keyNode: { name: string }) => void,
): void {
  if (!typeNode) {
    return;
  }
  if (typeNode.type === "TSTypeLiteral" && Array.isArray(typeNode.members)) {
    for (const member of typeNode.members) {
      const m = member as {
        type?: string;
        key?: { type?: string; name?: string };
      };
      if (m.type === "TSPropertySignature" && m.key?.type === "Identifier" && m.key.name) {
        visitor(m.key.name, m.key as { name: string });
      }
    }
  }
  if (typeNode.type === "TSIntersectionType" && Array.isArray(typeNode.types)) {
    for (const t of typeNode.types) {
      walkTypePropNames(t as TypeNodeLike, visitor);
    }
  }
}

/**
 * Collects prop names from a propsType AST node, resolving through
 * TSTypeReference nodes to the underlying type declaration.
 */
export function collectResolvedTypePropNames(
  root: ReturnType<JSCodeshift>,
  j: JSCodeshift,
  propsType: unknown,
  namespaceChain: ReadonlyArray<string | null> = [null],
): Set<string> {
  const names = new Set<string>();
  const visit = (node: unknown): void => {
    const n = node as TypeNodeLike & { typeName?: { type?: string; name?: string } };
    if (!n) {
      return;
    }
    if (n.type === "TSTypeLiteral") {
      walkTypePropNames(n, (name) => {
        names.add(name);
      });
    } else if (n.type === "TSIntersectionType" && Array.isArray(n.types)) {
      for (const t of n.types) {
        visit(t);
      }
    } else if (n.type === "TSTypeReference" && n.typeName?.type === "Identifier") {
      const typeName = n.typeName.name;
      if (!typeName) {
        return;
      }
      const interfaceDecl = findFirstTypeDeclInChain(
        root,
        j.TSInterfaceDeclaration,
        typeName,
        namespaceChain,
      );
      if (interfaceDecl) {
        const body = ((interfaceDecl as any).body?.body ?? []) as any[];
        for (const member of body) {
          if (member?.type === "TSPropertySignature" && member.key?.type === "Identifier") {
            names.add(member.key.name);
          }
        }
      }
      const typeAliasDecl = findFirstTypeDeclInChain(
        root,
        j.TSTypeAliasDeclaration,
        typeName,
        namespaceChain,
      );
      if (typeAliasDecl) {
        visit((typeAliasDecl as any).typeAnnotation);
      }
    }
  };
  visit(propsType);
  return names;
}

/**
 * Emits a warning and cross-file consumer patching info when an exported
 * component has transient prop renames.
 */
export function emitTransientPropRenameWarning(
  ctx: TransformContext,
  decl: StyledDecl,
  renames: Map<string, string>,
  exportedComponents: Map<string, { exportName?: string }>,
): void {
  const exportInfo = exportedComponents.get(decl.localName);
  if (!exportInfo) {
    return;
  }
  const exportName = exportInfo.exportName ?? decl.localName;
  const renameRecord: Record<string, string> = {};
  const renameList: string[] = [];
  for (const [from, to] of renames) {
    renameRecord[from] = to;
    renameList.push(`${from} → ${to}`);
  }
  ctx.warnings.push({
    severity: "info",
    type: "Transient $-prefixed props renamed on exported component — update consumer call sites to use the new prop names",
    loc: decl.loc ?? null,
    context: {
      componentName: decl.localName,
      renames: renameList.join(", "),
    },
  });
  ctx.transientPropRenames ??= [];
  ctx.transientPropRenames.push({ exportName, renames: renameRecord });
}

/**
 * Renames `$`-prefixed prop references in a "when" condition string.
 * Sorts renames by length descending to avoid partial matches.
 */
function renamePropsInWhenString(when: string, renames: Map<string, string>): string {
  let result = when;
  const sorted = [...renames.entries()].sort((a, b) => b[0].length - a[0].length);
  for (const [from, to] of sorted) {
    const escaped = escapeRegex(from);
    result = result.replace(new RegExp(`(?<![\\w$])${escaped}(?=(?:True|False)?(?!\\w))`, "g"), to);
  }
  return result;
}

function renameStaticAttrKeys(
  attrs: Record<string, unknown>,
  renames: Map<string, string>,
): Record<string, unknown> {
  let changed = false;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(attrs)) {
    const renamed = renames.get(key) ?? key;
    if (renamed !== key) {
      changed = true;
    }
    out[renamed] = value;
  }
  return changed ? out : attrs;
}

const AST_METADATA_KEYS = new Set([
  "loc",
  "start",
  "end",
  "comments",
  "leadingComments",
  "trailingComments",
  "innerComments",
  "extra",
  "range",
  "tokens",
]);

function astContainsIdentifier(node: unknown, name: string): boolean {
  if (!node || typeof node !== "object") {
    return false;
  }
  const n = node as Record<string, unknown>;
  if (typeof n.type !== "string") {
    return false;
  }
  if (n.type === "Identifier" && n.name === name) {
    return true;
  }
  for (const [key, value] of Object.entries(n)) {
    if (AST_METADATA_KEYS.has(key)) {
      continue;
    }
    if (Array.isArray(value)) {
      if (value.some((item) => astContainsIdentifier(item, name))) {
        return true;
      }
    } else if (value && typeof value === "object" && astContainsIdentifier(value, name)) {
      return true;
    }
  }
  return false;
}

/**
 * Mirrors TypeScript name resolution: walks the namespace chain from the inside
 * out and returns the first matching declaration. Used so a type reference inside
 * a nested namespace resolves to the closest enclosing declaration rather than
 * accidentally matching every same-named declaration in the file.
 */
function findFirstTypeDeclInChain(
  root: ReturnType<JSCodeshift>,
  builder: any,
  typeName: string,
  namespaceChain: ReadonlyArray<string | null>,
): any {
  for (const ns of namespaceChain) {
    let found: any = null;
    root
      .find(builder)
      .filter((p: any) => p.node?.id?.name === typeName)
      .filter((p: any) => nearestNamespacePath(p) === ns)
      .forEach((p: any) => {
        if (!found) {
          found = p.node;
        }
      });
    if (found) {
      return found;
    }
  }
  return null;
}
