/**
 * Step: emit bridge global selector exports for components targeted by
 * unconverted styled-components consumers.
 *
 * For each styled component with a `bridgeClassName`, emits:
 *   export const FooGlobalSelector = ".sc2sx-Foo-a1b2c3";
 */
import {
  CONTINUE,
  type StepResult,
  type StyledDecl,
  type BridgeComponentResult,
} from "../transform-types.js";
import { TransformContext } from "../transform-context.js";
import { bridgeClassVarName, bridgeExportName } from "../utilities/bridge-classname.js";

export function emitBridgeExportsStep(ctx: TransformContext): StepResult {
  const styledDecls = ctx.styledDecls as StyledDecl[] | undefined;
  if (!styledDecls) {
    return CONTINUE;
  }

  const bridgeDecls = styledDecls.filter(
    (d): d is StyledDecl & { bridgeClassName: string } => !!d.bridgeClassName,
  );
  if (bridgeDecls.length === 0) {
    return CONTINUE;
  }

  const { j, root } = ctx;
  const bridgeResults: BridgeComponentResult[] = [];

  for (const decl of bridgeDecls) {
    const exportVarName = bridgeExportName(decl.localName);
    const internalVarName = bridgeClassVarName(decl.localName);
    const className = decl.bridgeClassName;

    // Build: const fooBridgeClass = "sc2sx-Foo-a1b2c3";
    const internalDecl = j.variableDeclaration("const", [
      j.variableDeclarator(j.identifier(internalVarName), j.stringLiteral(className)),
    ]);

    // Build: export const FooGlobalSelector = `.${fooBridgeClass}`;
    const templateLiteral = j.templateLiteral(
      [
        j.templateElement({ raw: ".", cooked: "." }, false),
        j.templateElement({ raw: "", cooked: "" }, true),
      ],
      [j.identifier(internalVarName)],
    );
    const exportDeclaration = j.variableDeclaration("const", [
      j.variableDeclarator(j.identifier(exportVarName), templateLiteral),
    ]);
    const exportDecl = j.exportNamedDeclaration(exportDeclaration);

    // Add JSDoc deprecation comment
    (exportDecl as any).comments = [
      j.commentBlock(
        "* @deprecated Migrate consumer to stylex.defineMarker() — bridge className for unconverted styled-components consumers ",
        true,
        false,
      ),
    ];

    // Insert at the end of the program body
    const body = root.find(j.Program).get().node.body;
    body.push(internalDecl);
    body.push(exportDecl);

    bridgeResults.push({
      componentName: decl.localName,
      exportName: ctx.exportedComponents?.get(decl.localName)?.exportName,
      className,
      globalSelectorVarName: exportVarName,
    });
  }

  ctx.bridgeResults = bridgeResults;
  ctx.markChanged();

  return CONTINUE;
}
