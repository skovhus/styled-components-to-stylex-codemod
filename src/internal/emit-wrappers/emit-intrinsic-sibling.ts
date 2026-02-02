import type { StyledDecl } from "../transform-types.js";
import type { EmitIntrinsicContext } from "./emit-intrinsic-context.js";
import type { ExpressionKind } from "./types.js";
import type { JsxAttr, StatementKind } from "./wrapper-emitter.js";
import { emitStyleMerging } from "./style-merger.js";
import { extraStyleArgsFor, asDestructureProp } from "./emit-intrinsic-helpers.js";

export function emitSiblingWrappers(ctx: EmitIntrinsicContext): void {
  const { emitter, emitPropsType, emitted } = ctx;
  const { j, stylesIdentifier, wrapperDecls } = emitter;

  // Sibling selector wrappers (Thing + variants)
  const siblingWrappers = wrapperDecls.filter((d: StyledDecl) => d.siblingWrapper);
  for (const d of siblingWrappers) {
    if (d.base.kind !== "intrinsic" || d.base.tagName !== "div") {
      continue;
    }
    const sw = d.siblingWrapper!;
    const allowAsProp = emitter.shouldAllowAsPropForIntrinsic(d, "div");

    {
      const explicit = emitter.stringifyTsType(d.propsType);
      const extras: string[] = [];
      extras.push(`${sw.propAdjacent}?: boolean;`);
      if (sw.propAfter) {
        extras.push(`${sw.propAfter}?: boolean;`);
      }
      const extraType = `{ ${extras.join(" ")} }`;
      const allowClassNameProp = emitter.shouldAllowClassNameProp(d);
      const allowStyleProp = emitter.shouldAllowStyleProp(d);
      const baseTypeText = emitter.inferredIntrinsicPropsTypeText({
        d,
        tagName: "div",
        allowClassNameProp,
        allowStyleProp,
      });
      const typeText = explicit ?? emitter.joinIntersection(baseTypeText, extraType);
      emitPropsType(d.localName, typeText, allowAsProp);
    }

    const propsParamId = j.identifier("props");
    emitter.annotatePropsParam(propsParamId, d.localName);
    const propsId = j.identifier("props");
    const childrenId = j.identifier("children");
    const classNameId = j.identifier("className");
    const restId = j.identifier("rest");
    const adjId = j.identifier(sw.propAdjacent);
    const afterId = sw.propAfter ? j.identifier(sw.propAfter) : j.identifier("_unused");

    const declStmt = j.variableDeclaration("const", [
      j.variableDeclarator(
        j.objectPattern([
          ...(allowAsProp ? [asDestructureProp(j, "div")] : []),
          emitter.patternProp("children", childrenId),
          emitter.patternProp("className", classNameId),
          emitter.patternProp(sw.propAdjacent, adjId),
          emitter.patternProp(afterId.name, afterId),
          j.restElement(restId),
        ] as any),
        propsId,
      ),
    ]);

    // Build styleArgs for sibling selectors
    const styleArgs: ExpressionKind[] = [
      ...extraStyleArgsFor(emitter, d),
      j.memberExpression(j.identifier(stylesIdentifier), j.identifier(d.styleKey)),
      j.logicalExpression(
        "&&",
        adjId as any,
        j.memberExpression(j.identifier(stylesIdentifier), j.identifier(sw.adjacentKey)),
      ),
      ...(sw.afterKey && sw.propAfter
        ? [
            j.logicalExpression(
              "&&",
              afterId as any,
              j.memberExpression(j.identifier(stylesIdentifier), j.identifier(sw.afterKey)),
            ),
          ]
        : []),
    ];

    const allowClassNameProp = emitter.shouldAllowClassNameProp(d);
    const allowStyleProp = emitter.shouldAllowStyleProp(d);

    // Use the style merger helper
    const merging = emitStyleMerging({
      j,
      emitter,
      styleArgs,
      classNameId,
      styleId: j.identifier("style"),
      allowClassNameProp,
      allowStyleProp,
      inlineStyleProps: [],
    });

    // Build attrs: {...rest} then {...mergedStylexProps(...)} so stylex styles override
    const openingAttrs: JsxAttr[] = [j.jsxSpreadAttribute(restId)];
    emitter.appendMergingAttrs(openingAttrs, merging);

    const jsx = emitter.buildJsxElement({
      tagName: allowAsProp ? "Component" : "div",
      attrs: openingAttrs,
      includeChildren: true,
      childrenExpr: childrenId,
    });

    const bodyStmts: StatementKind[] = [declStmt];
    if (merging.sxDecl) {
      bodyStmts.push(merging.sxDecl);
    }
    bodyStmts.push(j.returnStatement(jsx as any));

    emitted.push(
      emitter.buildWrapperFunction({
        localName: d.localName,
        params: [propsParamId],
        bodyStmts,
      }),
    );
  }
}
