import type { WarningLog } from "../logger.js";
import { literalToString } from "../utilities/jscodeshift-utils.js";

export type CssSwitchParseResult = {
  // Maps explicit string literal cases to the returned css tagged template expression
  caseCssTemplates: Map<string, { quasi: any }>;
  // The default returned css tagged template expression
  defaultCssTemplate: { quasi: any };
};

type ReturnStatementNode = { type: "ReturnStatement"; argument: unknown };

function isReturnStatement(node: unknown): node is ReturnStatementNode {
  return (
    !!node && typeof node === "object" && (node as { type?: string }).type === "ReturnStatement"
  );
}

function getSingleReturnStmt(consequent: any[]): ReturnStatementNode | null {
  if (!Array.isArray(consequent) || consequent.length !== 1) {
    return null;
  }
  const only = consequent[0];
  if (!only || typeof only !== "object") {
    return null;
  }
  if (isReturnStatement(only)) {
    return only;
  }
  // Support `case "x": { return css`...`; }`
  if (only.type === "BlockStatement") {
    const body = only.body;
    if (!Array.isArray(body) || body.length !== 1) {
      return null;
    }
    const inner = body[0];
    if (isReturnStatement(inner)) {
      return inner;
    }
  }
  return null;
}

/**
 * Parse a switch statement into a mapping of case values → returned css`...` template.
 *
 * **Strictness (by design)**:
 * - Requires a `default` case
 * - Every case label must resolve to a `return css`...\`` (fall-through is allowed)
 * - Any non-return statements, missing returns, or non-css returns cause bail
 */
export function parseSwitchReturningCssTemplates(args: {
  switchStmt: any;
  expectedDiscriminantIdent: string;
  isCssHelperTaggedTemplate: (expr: any) => expr is { quasi: any };
  warnings: WarningLog[];
  loc: { line: number; column: number } | null | undefined;
}): CssSwitchParseResult | null {
  const { switchStmt, expectedDiscriminantIdent, isCssHelperTaggedTemplate, warnings, loc } = args;
  if (!switchStmt || switchStmt.type !== "SwitchStatement") {
    return null;
  }
  const disc = switchStmt.discriminant;
  if (disc?.type !== "Identifier" || disc.name !== expectedDiscriminantIdent) {
    return null;
  }

  const cases = Array.isArray(switchStmt.cases) ? switchStmt.cases : [];
  const caseCssTemplates = new Map<string, { quasi: any }>();
  let defaultCssTemplate: { quasi: any } | null = null;

  let pendingLabels: string[] = [];
  const assignToPending = (tpl: { quasi: any }) => {
    for (const l of pendingLabels) {
      caseCssTemplates.set(l, tpl);
    }
    pendingLabels = [];
  };

  for (const c of cases) {
    if (!c || typeof c !== "object") {
      continue;
    }
    const isDefault = c.test == null;
    const label = isDefault ? null : literalToString(c.test);
    if (!isDefault && !label) {
      warnings.push({
        severity: "warning",
        type: "`css` helper function switch must return css templates in all branches",
        loc,
        context: { reason: "non-string-switch-case" },
      });
      return null;
    }

    const ret = getSingleReturnStmt(c.consequent);
    if (!ret) {
      // Allow pure fall-through (no statements)
      if (Array.isArray(c.consequent) && c.consequent.length === 0 && label) {
        pendingLabels.push(label);
        continue;
      }
      warnings.push({
        severity: "warning",
        type: "`css` helper function switch must return css templates in all branches",
        loc,
        context: { reason: "missing-return" },
      });
      return null;
    }

    const arg = ret.argument;
    if (!isCssHelperTaggedTemplate(arg)) {
      warnings.push({
        severity: "warning",
        type: "`css` helper function switch must return css templates in all branches",
        loc,
        context: { reason: "return-not-css-template" },
      });
      return null;
    }

    const tpl = arg as { quasi: any };
    if (isDefault) {
      defaultCssTemplate = tpl;
      // Any fall-through labels reaching default share the default template
      assignToPending(tpl);
      continue;
    }

    // Case label with a return also covers any prior fall-through labels.
    // At this point isDefault is false, and we already returned at line 80-88 if !label
    if (label) {
      pendingLabels.push(label);
    }
    assignToPending(tpl);
  }

  if (!defaultCssTemplate) {
    warnings.push({
      severity: "warning",
      type: "`css` helper function switch must return css templates in all branches",
      loc,
      context: { reason: "missing-default" },
    });
    return null;
  }
  if (pendingLabels.length > 0) {
    warnings.push({
      severity: "warning",
      type: "`css` helper function switch must return css templates in all branches",
      loc,
      context: { reason: "dangling-fallthrough" },
    });
    return null;
  }

  return { caseCssTemplates, defaultCssTemplate };
}
