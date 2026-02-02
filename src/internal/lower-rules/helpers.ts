import type { JSCodeshift } from "jscodeshift";
import type { ExpressionKind } from "./shared.js";

export function invertWhen(when: string): string | null {
  if (when.startsWith("!")) {
    return when.slice(1);
  }
  const match = when.match(/^(.+)\s+(===|!==)\s+(.+)$/);
  if (match) {
    const [, propName, op, rhs] = match;
    const invOp = op === "===" ? "!==" : "===";
    return `${propName} ${invOp} ${rhs}`;
  }
  if (!when.includes(" ")) {
    return `!${when}`;
  }
  return null;
}

export function buildPseudoMediaPropValue(args: {
  j: JSCodeshift;
  valueExpr: ExpressionKind;
  pseudos?: string[] | null;
  media?: string | null;
}): ExpressionKind {
  const { j, valueExpr, pseudos, media } = args;
  const pseudoList = pseudos ?? [];
  const hasPseudos = pseudoList.length > 0;
  if (!media && !hasPseudos) {
    return valueExpr;
  }
  if (media && hasPseudos) {
    const pseudoProps = pseudoList.map((ps) =>
      j.property(
        "init",
        j.literal(ps),
        j.objectExpression([
          j.property("init", j.identifier("default"), j.literal(null)),
          j.property("init", j.literal(media), valueExpr),
        ]),
      ),
    );
    return j.objectExpression([
      j.property("init", j.identifier("default"), j.literal(null)),
      ...pseudoProps,
    ]);
  }
  if (media) {
    return j.objectExpression([
      j.property("init", j.identifier("default"), j.literal(null)),
      j.property("init", j.literal(media), valueExpr),
    ]);
  }
  const pseudoProps = pseudoList.map((ps) => j.property("init", j.literal(ps), valueExpr));
  return j.objectExpression([
    j.property("init", j.identifier("default"), j.literal(null)),
    ...pseudoProps,
  ]);
}
