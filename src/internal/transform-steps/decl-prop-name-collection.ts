/**
 * Prop-name collection helpers extracted from analyze-before-emit. Collect the
 * prop names a styled decl reads — from its TypeScript props type, its JSX call
 * sites, and any base component it extends — for transient-rename safety checks.
 */
import type { JSCodeshift } from "jscodeshift";
import type { StyledDecl } from "../transform-types.js";
import { jsxNameTargetsLocalBinding } from "../utilities/jsx-name-utils.js";
import { parseVariantWhenToAst } from "../emit-wrappers/variant-condition.js";
import { getDeclAncestorNamespaceChain, pathReachesNamespace } from "./namespace-scope.js";
import {
  collectResolvedTypePropNames,
  shouldResolveReferencedPropsForTransientRename,
  walkTypePropNames,
} from "./transient-prop-renames.js";

/**
 * Collects non-`$`-prefixed attribute names from JSX call sites of a component.
 * Returns true if any call site uses a JSX spread attribute (e.g., `{...props}`),
 * which means the spread may contain `$`-prefixed keys at runtime — renames are
 * only safe for `$`-props that appear **after** the last spread at every call site,
 * since in JSX later attributes override earlier ones.
 */
interface CallSiteAttrResult {
  hasSpread: boolean;
  /**
   * `$`-prefixed props explicitly passed at every spread-containing call site.
   * Renames for these are safe even with spreads (explicit attrs override spread values).
   * `null` when no spread sites exist.
   */
  explicitTransientAtSpreadSites: Set<string> | null;
}

export function collectCallSiteAttrNames(
  root: ReturnType<JSCodeshift>,
  j: JSCodeshift,
  componentName: string,
  names: Set<string>,
): CallSiteAttrResult {
  let hasSpread = false;
  const spreadSiteTransientProps: Set<string>[] = [];
  const collectFromElement = (openingElement: { attributes?: unknown[] }) => {
    let siteHasSpread = false;
    const siteTransientAfterSpread = new Set<string>();
    const siteTransientBeforeSpread = new Set<string>();
    for (const attr of (openingElement as any).attributes ?? []) {
      if (attr.type === "JSXSpreadAttribute") {
        hasSpread = true;
        siteHasSpread = true;
        // Track props seen before any spread, then clear — only props AFTER
        // the last spread are safe to rename.
        for (const name of siteTransientAfterSpread) {
          siteTransientBeforeSpread.add(name);
        }
        siteTransientAfterSpread.clear();
      } else if (attr.type === "JSXAttribute" && attr.name?.type === "JSXIdentifier") {
        const name: string = attr.name.name;
        if (name.startsWith("$")) {
          siteTransientAfterSpread.add(name);
        } else {
          names.add(name);
        }
      }
    }
    if (siteHasSpread) {
      // Remove props that appear both before AND after a spread — renaming
      // would produce duplicate JSX attributes (e.g., `$open={a} {...rest} $open={b}`
      // → `open={a} {...rest} open={b}` = TS17001 error).
      for (const name of siteTransientBeforeSpread) {
        siteTransientAfterSpread.delete(name);
      }
      spreadSiteTransientProps.push(siteTransientAfterSpread);
    }
  };
  root
    .find(j.JSXElement)
    .filter((p: any) =>
      jsxNameTargetsLocalBinding({
        root,
        j,
        name: p.node.openingElement?.name,
        localName: componentName,
      }),
    )
    .forEach((p: any) => collectFromElement(p.node.openingElement));
  root
    .find(j.JSXSelfClosingElement)
    .filter((p: any) =>
      jsxNameTargetsLocalBinding({
        root,
        j,
        name: p.node.name,
        localName: componentName,
      }),
    )
    .forEach((p: any) => collectFromElement(p.node));
  if (!hasSpread) {
    return { hasSpread: false, explicitTransientAtSpreadSites: null };
  }
  // Intersect: find $-prefixed props that appear at ALL spread-containing sites
  if (spreadSiteTransientProps.length === 0) {
    return { hasSpread: true, explicitTransientAtSpreadSites: new Set() };
  }
  const intersection = new Set(spreadSiteTransientProps[0]);
  for (let i = 1; i < spreadSiteTransientProps.length; i++) {
    for (const prop of intersection) {
      if (!spreadSiteTransientProps[i]!.has(prop)) {
        intersection.delete(prop);
      }
    }
  }
  return { hasSpread: true, explicitTransientAtSpreadSites: intersection };
}

/**
 * Collects prop names from a locally-defined base component's type that match
 * the given filter. Default filter excludes `$`-prefixed names (for collision checking).
 */
export function collectBaseComponentPropNames(
  root: ReturnType<JSCodeshift>,
  j: JSCodeshift,
  componentName: string,
  names: Set<string>,
  filter: (name: string) => boolean = (n) => !n.startsWith("$"),
): void {
  const extractFromParam = (param: any) => {
    const typeRef = param?.typeAnnotation?.typeAnnotation;
    if (!typeRef) {
      return;
    }
    if (typeRef.type === "TSTypeLiteral") {
      walkTypePropNames(typeRef, (n) => {
        if (filter(n)) {
          names.add(n);
        }
      });
    } else if (typeRef.type === "TSTypeReference" && typeRef.typeName?.type === "Identifier") {
      const typeName = typeRef.typeName.name;
      // Check interface
      root
        .find(j.TSInterfaceDeclaration)
        .filter((p: any) => (p.node as any).id?.name === typeName)
        .forEach((p: any) => {
          for (const member of (p.node.body?.body ?? []) as any[]) {
            if (
              member.type === "TSPropertySignature" &&
              member.key?.type === "Identifier" &&
              filter(member.key.name)
            ) {
              names.add(member.key.name);
            }
          }
        });
      // Check type alias
      root
        .find(j.TSTypeAliasDeclaration)
        .filter((p: any) => (p.node as any).id?.name === typeName)
        .forEach((p: any) => {
          walkTypePropNames(p.node.typeAnnotation, (n) => {
            if (filter(n)) {
              names.add(n);
            }
          });
        });
    }
    if (typeRef.type === "TSIntersectionType") {
      for (const t of typeRef.types ?? []) {
        extractFromParam({ typeAnnotation: { typeAnnotation: t } });
      }
    }
  };

  // Check function declarations
  root
    .find(j.FunctionDeclaration)
    .filter((p) => p.node.id?.type === "Identifier" && p.node.id.name === componentName)
    .forEach((p) => {
      extractFromParam(p.node.params[0]);
    });
  // Check arrow function variable declarations
  root
    .find(j.VariableDeclarator)
    .filter((p: any) => p.node.id?.type === "Identifier" && p.node.id.name === componentName)
    .forEach((p: any) => {
      const init = p.node.init;
      if (init?.type === "ArrowFunctionExpression" && init.params[0]) {
        extractFromParam(init.params[0]);
      }
    });
}

/**
 * Returns true when a named type (interface or type alias) is referenced
 * in the file outside of the given styled component's own declaration.
 * This catches sharing with other styled decls, non-styled components,
 * helper functions, or any other code that uses the type.
 */
export function isTypeNameUsedElsewhere(
  root: ReturnType<JSCodeshift>,
  j: JSCodeshift,
  typeName: string,
  ownerLocalName: string,
  namespaceName: string | null,
): boolean {
  let count = 0;
  root
    .find(j.TSTypeReference)
    .filter((p: any) => {
      const id = p.node.typeName;
      return id?.type === "Identifier" && id.name === typeName;
    })
    // TypeScript name resolution lets descendant namespaces (and top-level code,
    // when the owner is top-level) reach the same declaration, so count those
    // references too — otherwise the type appears solely owned by the styled
    // component and we'd rename it out from under unrelated consumers.
    .filter((p: any) => pathReachesNamespace(p, namespaceName))
    .forEach((p: any) => {
      // Walk up to the nearest variable/function declaration to find the owner.
      // If the owner is the styled decl itself, don't count it.
      let cur = p.parentPath;
      while (cur) {
        const node = cur.node;
        if (
          node?.type === "VariableDeclarator" &&
          node.id?.type === "Identifier" &&
          node.id.name === ownerLocalName
        ) {
          return;
        }
        if (node?.type === "FunctionDeclaration" && node.id?.name === ownerLocalName) {
          return;
        }
        cur = cur.parentPath;
      }
      count++;
    });
  return count > 0;
}

/**
 * Collects prop names from a decl's styling data that match a filter.
 * Reuses `parseVariantWhenToAst` to extract prop names from "when" strings,
 * keeping prop extraction consistent with the emit phase.
 */
export function collectDeclPropNames(
  root: ReturnType<JSCodeshift>,
  j: JSCodeshift,
  decl: StyledDecl,
  filter: (name: string) => boolean,
): Set<string> {
  const result = new Set<string>();
  const addIfMatch = (name: string) => {
    if (filter(name)) {
      result.add(name);
    }
  };
  for (const when of Object.keys(decl.variantStyleKeys ?? {})) {
    for (const p of parseVariantWhenToAst(j, when, undefined, undefined, decl.nonPropConditionRoots)
      .props) {
      addIfMatch(p);
    }
  }
  for (const sf of decl.styleFnFromProps ?? []) {
    addIfMatch(sf.jsxProp);
    if (sf.conditionWhen) {
      for (const p of parseVariantWhenToAst(
        j,
        sf.conditionWhen,
        undefined,
        undefined,
        decl.nonPropConditionRoots,
      ).props) {
        addIfMatch(p);
      }
    }
  }
  for (const isp of decl.inlineStyleProps ?? []) {
    addIfMatch(isp.jsxProp ?? isp.prop);
  }
  for (const cv of decl.compoundVariants ?? []) {
    if (cv.kind === "3branch" || cv.kind === "4branch") {
      addIfMatch(cv.outerProp);
      addIfMatch(cv.innerProp);
    }
  }
  for (const vd of decl.variantDimensions ?? []) {
    addIfMatch(vd.propName);
  }
  for (const sbv of decl.staticBooleanVariants ?? []) {
    addIfMatch(sbv.propName);
  }
  if (decl.enumVariant) {
    addIfMatch(decl.enumVariant.propName);
  }
  walkTypePropNames(decl.propsType, (name) => {
    addIfMatch(name);
  });
  if (shouldResolveReferencedPropsForTransientRename(root, j, decl.propsType)) {
    for (const name of collectResolvedTypePropNames(
      root,
      j,
      decl.propsType,
      getDeclAncestorNamespaceChain(root, j, decl.localName),
    )) {
      addIfMatch(name);
    }
  }
  return result;
}
