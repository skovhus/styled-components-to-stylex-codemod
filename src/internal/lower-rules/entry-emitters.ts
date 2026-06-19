/**
 * Emits dynamic style-function entries and inline-style entries resolved from
 * conditional css`` branches. Split out of `css-helper-conditional.ts`.
 */
import type { ASTNode, JSCodeshift } from "jscodeshift";
import type { StyledDecl } from "../transform-types.js";
import type { ExpressionKind, StyleFnFromPropsEntry } from "./decl-types.js";
import type { LowerRulesState } from "./state.js";
import { cssPropertyToIdentifier, makeCssProperty } from "./shared.js";
import { styleKeyWithSuffix } from "../transform/helpers.js";
import { ensureShouldForwardPropDrop, literalToStaticValue } from "./types.js";

type EntryEmitterDeps = {
  j: JSCodeshift;
  decl: StyledDecl;
  parseExpr: LowerRulesState["parseExpr"];
  styleFnDecls: Map<string, unknown>;
  styleFnFromProps: StyleFnFromPropsEntry[];
  inlineStyleProps: Array<{ prop: string; expr: ExpressionKind; jsxProp?: string }>;
  avoidNames: Set<string>;
  annotateParamFromJsxProp: (paramId: unknown, jsxProp: string) => void;
};

export function createEntryEmitters(deps: EntryEmitterDeps): {
  applyDynamicEntries: (
    entries: Array<{
      jsxProp: string;
      stylexProp: string;
      callArg: ExpressionKind;
      condition?: "always";
    }>,
    conditionWhen?: string,
  ) => void;
  applyInlineEntries: (
    entries: Array<{ jsxProp: string; prop: string; callArg: ExpressionKind }>,
    conditionWhen?: string,
  ) => void;
} {
  const {
    j,
    decl,
    parseExpr,
    styleFnDecls,
    styleFnFromProps,
    inlineStyleProps,
    avoidNames,
    annotateParamFromJsxProp,
  } = deps;

  const applyDynamicEntries = (
    entries: Array<{
      jsxProp: string;
      stylexProp: string;
      callArg: ExpressionKind;
      condition?: "always";
    }>,
    conditionWhen?: string,
  ): void => {
    const inferParamTypeFromCallArg = (
      callArg: ExpressionKind,
      condition?: "always",
    ): ASTNode | null => {
      if (callArg.type === "TemplateLiteral") {
        return j.tsStringKeyword();
      }
      // ConditionalExpression with theme-resolved branches (condition: "always")
      // produces string values (StyleXVar<string>), not the original prop type.
      if (callArg.type === "ConditionalExpression" && condition === "always") {
        return j.tsStringKeyword();
      }
      const staticValue = literalToStaticValue(callArg);
      if (typeof staticValue === "string") {
        return j.tsStringKeyword();
      }
      if (typeof staticValue === "number") {
        return j.tsNumberKeyword();
      }
      if (typeof staticValue === "boolean") {
        return j.tsBooleanKeyword();
      }
      return null;
    };

    for (const entry of entries) {
      const fnKey = styleKeyWithSuffix(decl.styleKey, entry.stylexProp);
      if (!styleFnDecls.has(fnKey)) {
        const entryParamName = cssPropertyToIdentifier(entry.stylexProp, avoidNames);
        const param = j.identifier(entryParamName);
        const inferredParamType = inferParamTypeFromCallArg(entry.callArg, entry.condition);
        if (inferredParamType) {
          (param as { typeAnnotation?: unknown }).typeAnnotation = j.tsTypeAnnotation(
            inferredParamType as any,
          );
        } else {
          annotateParamFromJsxProp(param, entry.jsxProp);
        }
        const p = makeCssProperty(j, entry.stylexProp, entryParamName);
        const bodyExpr = j.objectExpression([p]);
        styleFnDecls.set(fnKey, j.arrowFunctionExpression([param], bodyExpr));
      }
      if (
        !styleFnFromProps.some(
          (p) =>
            p.fnKey === fnKey && p.jsxProp === entry.jsxProp && p.conditionWhen === conditionWhen,
        )
      ) {
        styleFnFromProps.push({
          fnKey,
          jsxProp: entry.jsxProp,
          condition: entry.condition,
          conditionWhen,
          callArg: entry.callArg,
        });
      }
      ensureShouldForwardPropDrop(decl, entry.jsxProp);
    }
  };

  const buildConditionExprFromWhen = (
    when: string,
  ): { cond: ExpressionKind; isBoolean: boolean } | null => {
    const trimmed = when.trim();
    if (!trimmed) {
      return null;
    }
    if (trimmed.startsWith("!")) {
      const propName = trimmed.slice(1).trim();
      if (!propName) {
        return null;
      }
      return {
        cond: j.unaryExpression("!", j.identifier(propName)),
        isBoolean: true,
      };
    }
    if (trimmed.includes("===") || trimmed.includes("!==")) {
      const op = trimmed.includes("!==") ? "!==" : "===";
      const [lhs, rhsRaw0] = trimmed.split(op).map((s) => s.trim());
      const rhsRaw = rhsRaw0 ?? "";
      if (!lhs) {
        return null;
      }
      let rhs: ExpressionKind;
      try {
        rhs = j.literal(JSON.parse(rhsRaw));
      } catch {
        rhs = parseExpr(rhsRaw) ?? j.identifier(rhsRaw);
      }
      return {
        cond: j.binaryExpression(op as any, j.identifier(lhs), rhs),
        isBoolean: true,
      };
    }
    return { cond: j.identifier(trimmed), isBoolean: false };
  };

  const applyInlineEntries = (
    entries: Array<{ jsxProp: string; prop: string; callArg: ExpressionKind }>,
    conditionWhen?: string,
  ): void => {
    const condition = conditionWhen ? buildConditionExprFromWhen(conditionWhen) : null;
    for (const entry of entries) {
      const expr =
        condition && condition.cond
          ? j.conditionalExpression(condition.cond, entry.callArg, j.identifier("undefined"))
          : entry.callArg;
      inlineStyleProps.push({ prop: entry.prop, expr, jsxProp: entry.jsxProp });
      ensureShouldForwardPropDrop(decl, entry.jsxProp);
    }
    if (entries.length > 0) {
      decl.needsWrapperComponent = true;
    }
  };

  return { applyDynamicEntries, applyInlineEntries };
}
