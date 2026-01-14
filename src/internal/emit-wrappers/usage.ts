import type { Collection } from "jscodeshift";
import type { StyledDecl } from "../transform-types.js";

export type WrapperUsageHelpers = {
  getUsedAttrs: (localName: string) => Set<string>;
  getJsxCallsites: (localName: string) => { hasAny: boolean };
  hasJsxChildrenUsage: (localName: string) => boolean;
  isUsedAsValueInFile: (localName: string) => boolean;
  shouldAllowClassNameProp: (d: StyledDecl) => boolean;
  shouldAllowStyleProp: (d: StyledDecl) => boolean;
};

export function createWrapperUsageHelpers(args: {
  root: Collection<any>;
  j: any;
}): WrapperUsageHelpers {
  const { root, j } = args;

  const usedAttrsCache = new Map<string, Set<string>>();
  const getUsedAttrs = (localName: string): Set<string> => {
    const cached = usedAttrsCache.get(localName);
    if (cached) {
      return cached;
    }
    const attrs = new Set<string>();
    const collectFromOpening = (opening: any) => {
      for (const a of (opening?.attributes ?? []) as any[]) {
        if (!a) {
          continue;
        }
        if (a.type === "JSXSpreadAttribute") {
          // Unknown props shape -> treat as "needs intrinsic props"
          attrs.add("*");
          continue;
        }
        if (a.type === "JSXAttribute" && a.name?.type === "JSXIdentifier") {
          attrs.add(a.name.name);
        }
      }
    };
    root
      .find(j.JSXElement, {
        openingElement: { name: { type: "JSXIdentifier", name: localName } },
      } as any)
      .forEach((p: any) => collectFromOpening(p.node.openingElement));
    root
      .find(j.JSXSelfClosingElement, { name: { type: "JSXIdentifier", name: localName } } as any)
      .forEach((p: any) => collectFromOpening(p.node));
    usedAttrsCache.set(localName, attrs);
    return attrs;
  };

  const jsxCallsitesCache = new Map<string, { hasAny: boolean }>();
  const getJsxCallsites = (localName: string): { hasAny: boolean } => {
    const cached = jsxCallsitesCache.get(localName);
    if (cached) {
      return cached;
    }
    const hasAny =
      root
        .find(j.JSXElement, {
          openingElement: { name: { type: "JSXIdentifier", name: localName } },
        } as any)
        .size() > 0 ||
      root
        .find(j.JSXSelfClosingElement, { name: { type: "JSXIdentifier", name: localName } } as any)
        .size() > 0;
    const out = { hasAny };
    jsxCallsitesCache.set(localName, out);
    return out;
  };

  const jsxChildrenUsageCache = new Map<string, boolean>();
  const hasJsxChildrenUsage = (localName: string): boolean => {
    const cached = jsxChildrenUsageCache.get(localName);
    if (cached !== undefined) {
      return cached;
    }
    const hasChildren =
      root
        .find(j.JSXElement, {
          openingElement: { name: { type: "JSXIdentifier", name: localName } },
        } as any)
        .filter((p: any) => {
          const children = (p.node as any).children ?? [];
          return (children as any[]).some((c: any) => {
            if (!c) {
              return false;
            }
            if (c.type === "JSXText") {
              return String(c.value ?? "").trim().length > 0;
            }
            if (c.type === "JSXExpressionContainer") {
              return c.expression?.type !== "JSXEmptyExpression";
            }
            return true;
          });
        })
        .size() > 0;
    jsxChildrenUsageCache.set(localName, hasChildren);
    return hasChildren;
  };

  const usedAsValueCache = new Map<string, boolean>();
  const isUsedAsValueInFile = (localName: string): boolean => {
    const cached = usedAsValueCache.get(localName);
    if (cached !== undefined) {
      return cached;
    }
    // Conservative: treat JSX expression usage as "used as value"
    // e.g. outerElementType={OuterWrapper}
    const inJsxExpr =
      root
        .find(j.JSXExpressionContainer, {
          expression: { type: "Identifier", name: localName },
        } as any)
        .size() > 0;
    usedAsValueCache.set(localName, inJsxExpr);
    return inJsxExpr;
  };

  /**
   * Decide whether a wrapper component should accept/merge external `className`/`style`.
   *
   * - Exported components and components extended by other styled components set `supportsExternalStyles`.
   * - Components used as values (passed around) may receive `className`/`style` even without direct JSX callsites.
   * - For local-only components, only support these props if a callsite actually passes them (or spreads unknown props).
   */
  const shouldAllowClassNameProp = (d: StyledDecl): boolean => {
    if (d.supportsExternalStyles) {
      return true;
    }
    if ((d as any).usedAsValue) {
      return true;
    }
    const used = getUsedAttrs(d.localName);
    return used.has("*") || used.has("className");
  };

  const shouldAllowStyleProp = (d: StyledDecl): boolean => {
    if (d.supportsExternalStyles) {
      return true;
    }
    if ((d as any).usedAsValue) {
      return true;
    }
    const used = getUsedAttrs(d.localName);
    return used.has("*") || used.has("style");
  };

  return {
    getUsedAttrs,
    getJsxCallsites,
    hasJsxChildrenUsage,
    isUsedAsValueInFile,
    shouldAllowClassNameProp,
    shouldAllowStyleProp,
  };
}
