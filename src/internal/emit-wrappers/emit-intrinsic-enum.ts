import type { StyledDecl } from "../transform-types.js";
import type { EmitIntrinsicContext } from "./emit-intrinsic-context.js";
import { withLeadingComments } from "./comments.js";
import { asDestructureProp } from "./emit-intrinsic-helpers.js";

export function emitEnumVariantWrappers(ctx: EmitIntrinsicContext): void {
  const { emitter, emitPropsType, emitted } = ctx;
  const { j, stylesIdentifier, wrapperDecls } = emitter;

  // Enum-variant wrappers (e.g. DynamicBox variant mapping from string-interpolation fixture).
  const enumVariantWrappers = wrapperDecls.filter((d: StyledDecl) => d.enumVariant);
  if (enumVariantWrappers.length === 0) {
    return;
  }

  for (const d of enumVariantWrappers) {
    if (!d.enumVariant) {
      continue;
    }
    const allowAsProp = emitter.shouldAllowAsPropForIntrinsic(d, "div");
    const { propName, baseKey, cases } = d.enumVariant;
    const primary = cases[0];
    const secondary = cases[1];
    if (!primary || !secondary) {
      continue;
    }
    const explicit = emitter.stringifyTsType(d.propsType);
    if (explicit) {
      emitPropsType(d.localName, emitter.withChildren(explicit), allowAsProp);
    } else {
      // Best-effort: treat enum variant prop as a string-literal union.
      const hasNeq = cases.some((c) => c.kind === "neq");
      const values = [...new Set(cases.map((c) => c.whenValue))].filter(Boolean);
      const union = hasNeq
        ? "string"
        : values.length > 0
          ? values.map((v) => JSON.stringify(v)).join(" | ")
          : "string";
      const typeText = emitter.withChildren(
        `React.HTMLAttributes<HTMLDivElement> & { ${propName}?: ${union} }`,
      );
      emitPropsType(d.localName, typeText, allowAsProp);
    }
    const propsParamId = j.identifier("props");
    emitter.annotatePropsParam(propsParamId, d.localName);
    const propsId = j.identifier("props");
    const variantId = j.identifier(propName);
    const childrenId = j.identifier("children");

    const declStmt = j.variableDeclaration("const", [
      j.variableDeclarator(
        j.objectPattern([
          ...(allowAsProp ? [asDestructureProp(j, "div")] : []),
          emitter.patternProp(propName, variantId),
          emitter.patternProp("children", childrenId),
        ] as any),
        propsId,
      ),
    ]);

    const base = j.memberExpression(j.identifier(stylesIdentifier), j.identifier(baseKey));
    const condPrimary = j.binaryExpression("===", variantId, j.literal(primary.whenValue));
    const condSecondary =
      secondary.kind === "neq"
        ? j.binaryExpression("!==", variantId, j.literal(secondary.whenValue))
        : j.binaryExpression("===", variantId, j.literal(secondary.whenValue));

    const sxDecl = j.variableDeclaration("const", [
      j.variableDeclarator(
        j.identifier("sx"),
        j.callExpression(j.memberExpression(j.identifier("stylex"), j.identifier("props")), [
          base,
          j.logicalExpression(
            "&&",
            condPrimary as any,
            j.memberExpression(j.identifier(stylesIdentifier), j.identifier(primary.styleKey)),
          ),
          j.logicalExpression(
            "&&",
            condSecondary as any,
            j.memberExpression(j.identifier(stylesIdentifier), j.identifier(secondary.styleKey)),
          ),
        ]),
      ),
    ]);

    const openingEl = j.jsxOpeningElement(
      j.jsxIdentifier(allowAsProp ? "Component" : "div"),
      [j.jsxSpreadAttribute(j.identifier("sx"))],
      false,
    );
    const jsx = j.jsxElement(
      openingEl,
      j.jsxClosingElement(j.jsxIdentifier(allowAsProp ? "Component" : "div")),
      [j.jsxExpressionContainer(childrenId)],
    );

    emitted.push(
      withLeadingComments(
        j.functionDeclaration(
          j.identifier(d.localName),
          [propsParamId],
          j.blockStatement([declStmt, sxDecl, j.returnStatement(jsx as any)]),
        ),
        d,
      ),
    );
  }
}
