/**
 * Rewrites styled-component param references (`props.$x`, destructured props,
 * transient `$props`) into StyleX-compatible `props`/identifier references.
 * Split out of `css-helper-conditional.ts`.
 *
 * Created once per handler invocation so it can capture the resolved arrow-fn
 * `bindings` while local (nested) param names/bindings are threaded per call.
 */
import type { ASTNode, JSCodeshift } from "jscodeshift";
import type { ExpressionKind } from "./decl-types.js";
import {
  cloneAstNode,
  type ArrowFnParamBindings,
  type ASTNodeRecord,
} from "../utilities/jscodeshift-utils.js";
import { isMemberExpression } from "./utils.js";

export function createParamReplacer(
  j: JSCodeshift,
  bindings: ArrowFnParamBindings,
): {
  replaceParamWithProps: (
    exprNode: ExpressionKind,
    localParamName?: string,
    localBindings?: ArrowFnParamBindings,
  ) => ExpressionKind;
  getFunctionParamName: (node: ExpressionKind) => string | undefined;
} {
  const replaceParamWithProps = (
    exprNode: ExpressionKind,
    localParamName?: string,
    localBindings?: ArrowFnParamBindings,
  ): ExpressionKind => {
    const cloned = cloneAstNode(exprNode);
    // AST traversal requires flexible typing due to jscodeshift's complex type system
    const replace = (node: unknown, parent?: unknown): unknown => {
      if (!node || typeof node !== "object") {
        return node;
      }
      if (Array.isArray(node)) {
        return node.map((child) => replace(child, parent));
      }
      const n = node as ASTNodeRecord;
      if (
        (bindings.kind === "simple" || localParamName || localBindings?.kind === "simple") &&
        isMemberExpression(n) &&
        (n.object as ASTNodeRecord)?.type === "Identifier" &&
        ((bindings.kind === "simple" &&
          (n.object as { name?: string })?.name === bindings.paramName) ||
          (localParamName && (n.object as { name?: string })?.name === localParamName) ||
          (localBindings?.kind === "simple" &&
            (n.object as { name?: string })?.name === localBindings.paramName)) &&
        (n.property as ASTNodeRecord)?.type === "Identifier" &&
        ((n.property as { name?: string })?.name ?? "").startsWith("$") &&
        n.computed === false
      ) {
        return j.identifier((n.property as { name: string }).name);
      }
      if (n.type === "Identifier") {
        const nodeName = (n as { name?: string }).name ?? "";
        if (
          (bindings.kind === "simple" && nodeName === bindings.paramName) ||
          (localParamName && nodeName === localParamName) ||
          (localBindings?.kind === "simple" && nodeName === localBindings.paramName)
        ) {
          const p = parent as ASTNodeRecord | undefined;
          const isMemberProp =
            p && isMemberExpression(p) && p.property === n && p.computed === false;
          const isObjectKey = p && p.type === "Property" && p.key === n && p.shorthand !== true;
          if (!isMemberProp && !isObjectKey) {
            return j.identifier("props");
          }
        }
        if (localBindings?.kind === "destructured" && localBindings.bindings.has(nodeName)) {
          const propName = localBindings.bindings.get(nodeName)!;
          const defaultValue = localBindings.defaults?.get(propName);
          const base = propName.startsWith("$")
            ? j.identifier(propName)
            : j.memberExpression(j.identifier("props"), j.identifier(propName));
          if (defaultValue) {
            return j.logicalExpression("??", base, cloneAstNode(defaultValue) as ExpressionKind);
          }
          return base;
        }
        if (bindings.kind === "destructured" && bindings.bindings.has(nodeName)) {
          const propName = bindings.bindings.get(nodeName)!;
          const defaultValue = bindings.defaults?.get(propName);
          if (propName.startsWith("$")) {
            const base = j.identifier(propName);
            if (defaultValue) {
              return j.logicalExpression("??", base, cloneAstNode(defaultValue) as ExpressionKind);
            }
            return base;
          }
          const memberExpr = j.memberExpression(j.identifier("props"), j.identifier(propName));
          if (defaultValue) {
            return j.logicalExpression(
              "??",
              memberExpr,
              cloneAstNode(defaultValue) as ExpressionKind,
            );
          }
          return memberExpr;
        }
      }
      if (isMemberExpression(n)) {
        n.object = replace(n.object, n);
        if (n.computed) {
          n.property = replace(n.property, n);
        }
        return n;
      }
      if (n.type === "Property") {
        if (n.computed) {
          n.key = replace(n.key, n);
        }
        n.value = replace(n.value, n);
        return n;
      }
      for (const key of Object.keys(n)) {
        if (key === "loc" || key === "comments") {
          continue;
        }
        const child = n[key];
        if (child && typeof child === "object") {
          n[key] = replace(child, n);
        }
      }
      return n;
    };
    return replace(cloned, undefined) as ExpressionKind;
  };

  const getFunctionParamName = (node: ExpressionKind): string | undefined => {
    if (node.type !== "ArrowFunctionExpression" && node.type !== "FunctionExpression") {
      return undefined;
    }
    const firstParam = (node as { params?: ASTNode[] }).params?.[0];
    return firstParam?.type === "Identifier" ? (firstParam as { name: string }).name : undefined;
  };

  return { replaceParamWithProps, getFunctionParamName };
}
