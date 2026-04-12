/**
 * Step: emit bridge global selector exports for components targeted by
 * unconverted styled-components consumers.
 *
 * For each styled component with a `bridgeMarkerVarName`, emits:
 *   export const FooGlobalSelector = `.${stylex.props(FooMarker).className!}`;
 */
import {
  CONTINUE,
  type StepResult,
  type StyledDecl,
  type BridgeComponentResult,
} from "../transform-types.js";
import { TransformContext } from "../transform-context.js";

export function emitBridgeExportsStep(ctx: TransformContext): StepResult {
  const styledDecls = ctx.styledDecls as StyledDecl[] | undefined;
  if (!styledDecls) {
    return CONTINUE;
  }

  const bridgeDecls = styledDecls.filter(
    (d): d is StyledDecl & { bridgeMarkerVarName: string } => !!d.bridgeMarkerVarName,
  );
  if (bridgeDecls.length === 0) {
    return CONTINUE;
  }

  const { j, root } = ctx;
  const bridgeResults: BridgeComponentResult[] = [];

  for (const decl of bridgeDecls) {
    const exportVarName = bridgeExportName(decl.localName);
    const markerVarName = decl.bridgeMarkerVarName;

    // Build: export const FooGlobalSelector = `.${stylex.props(FooMarker).className!}`;
    const stylexPropsCall = j.callExpression(
      j.memberExpression(j.identifier("stylex"), j.identifier("props")),
      [j.identifier(markerVarName)],
    );
    const classNameAccess = j.tsNonNullExpression(
      j.memberExpression(stylexPropsCall, j.identifier("className")),
    );
    const templateLiteral = j.templateLiteral(
      [
        j.templateElement({ raw: ".", cooked: "." }, false),
        j.templateElement({ raw: "", cooked: "" }, true),
      ],
      [classNameAccess],
    );
    const exportDeclaration = j.variableDeclaration("const", [
      j.variableDeclarator(j.identifier(exportVarName), templateLiteral),
    ]);
    const exportDecl = j.exportNamedDeclaration(exportDeclaration);

    // Add JSDoc deprecation comment
    (exportDecl as any).comments = [
      j.commentBlock(
        "* @deprecated Migrate consumer to stylex.defineMarker() — bridge selector for unconverted styled-components consumers ",
        true,
        false,
      ),
    ];

    // Insert at the end of the program body
    const body = root.find(j.Program).get().node.body;
    body.push(exportDecl);

    bridgeResults.push({
      componentName: decl.localName,
      exportName: ctx.exportedComponents?.get(decl.localName)?.exportName,
      markerVarName,
      globalSelectorVarName: exportVarName,
    });
  }

  ctx.bridgeResults = bridgeResults;
  ctx.markChanged();

  return CONTINUE;
}

// --- Non-exported helpers ---

/** E.g., "Foo" → "FooGlobalSelector" */
function bridgeExportName(componentName: string): string {
  return `${componentName}GlobalSelector`;
}
