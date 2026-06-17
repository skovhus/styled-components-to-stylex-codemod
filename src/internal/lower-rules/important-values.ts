/**
 * Shared helpers for preserving CSS importance on lowered StyleX values.
 */
import type { JSCodeshift } from "jscodeshift";

export function appendImportantToStyleValue(
  j: JSCodeshift,
  valueAst: unknown,
  important: boolean,
): unknown {
  if (!important) {
    return valueAst;
  }
  if (typeof valueAst === "string") {
    return valueAst.includes("!important") ? valueAst : `${valueAst} !important`;
  }
  if (typeof valueAst === "number") {
    return `${valueAst} !important`;
  }
  if (!valueAst || typeof valueAst !== "object") {
    return valueAst;
  }

  const node = valueAst as ImportantValueNode;
  if (node.type === "ExpressionStatement") {
    return appendImportantToStyleValue(j, node.expression, important);
  }
  if (node.type === "StringLiteral" || node.type === "Literal" || node.type === "NumericLiteral") {
    if (typeof node.value === "string") {
      return node.value.includes("!important") ? valueAst : j.literal(`${node.value} !important`);
    }
    if (typeof node.value === "number") {
      return j.literal(`${node.value} !important`);
    }
    return valueAst;
  }
  if (node.type === "TemplateLiteral" && Array.isArray(node.quasis)) {
    return appendImportantToTemplateLiteral(j, node.quasis, node.expressions, valueAst);
  }

  return j.templateLiteral(
    [
      j.templateElement({ raw: "", cooked: "" }, false),
      j.templateElement({ raw: " !important", cooked: " !important" }, true),
    ],
    [valueAst as never],
  );
}

type ImportantValueNode = {
  type?: string;
  value?: unknown;
  expression?: unknown;
  quasis?: TemplateQuasiLike[];
  expressions?: unknown[];
};

type TemplateQuasiLike = {
  value?: {
    raw?: string;
    cooked?: string;
  };
};

function appendImportantToTemplateLiteral(
  j: JSCodeshift,
  quasis: TemplateQuasiLike[],
  expressions: unknown[] | undefined,
  originalValue: unknown,
): unknown {
  const lastIndex = quasis.length - 1;
  const last = quasis[lastIndex];
  const lastRaw = last?.value?.raw ?? last?.value?.cooked ?? "";
  const lastCooked = last?.value?.cooked ?? last?.value?.raw ?? "";
  if (lastRaw.includes("!important") || lastCooked.includes("!important")) {
    return originalValue;
  }

  const importantQuasis = quasis.map((quasi, i) => {
    const raw = quasi?.value?.raw ?? quasi?.value?.cooked ?? "";
    const cooked = quasi?.value?.cooked ?? quasi?.value?.raw ?? "";
    return i === lastIndex
      ? j.templateElement({ raw: `${raw} !important`, cooked: `${cooked} !important` }, true)
      : j.templateElement({ raw, cooked }, false);
  });
  return j.templateLiteral(importantQuasis, (expressions ?? []) as never[]);
}
