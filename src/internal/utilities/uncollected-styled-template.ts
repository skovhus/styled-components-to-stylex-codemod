/**
 * Finds styled tagged templates that survived collection unsupported.
 * Core concepts: styled tag detection and declaration identity.
 */
import type { StyledDecl } from "../transform-types.js";
import type { TransformContext } from "../transform-context.js";
import { getNodeLocStart } from "./jscodeshift-utils.js";

export function findUncollectedStyledTemplateLoc(args: {
  root: TransformContext["root"];
  j: TransformContext["j"];
  isStyledTag: TransformContext["isStyledTag"];
  styledDecls: StyledDecl[];
}): { line: number; column: number } | null | undefined {
  const { root, j, isStyledTag, styledDecls } = args;

  const collectedTemplateKeys = new Set(
    styledDecls.map((decl) => styledTemplateKey(decl.localName, decl.loc)),
  );
  let loc: { line: number; column: number } | null | undefined;

  root.find(j.TaggedTemplateExpression).forEach((path: any) => {
    if (loc !== undefined || !isStyledTag(path.node.tag)) {
      return;
    }

    const declarator = j(path).closest(j.VariableDeclarator);
    const declaratorNode = declarator.size() > 0 ? declarator.get().node : undefined;
    if (declaratorNode?.init !== path.node) {
      return;
    }

    const id = declaratorNode.id;
    const declaratorName = id?.type === "Identifier" ? id.name : undefined;
    if (!declaratorName) {
      return;
    }

    const templateLoc = getNodeLocStart(path.node.quasi) ?? null;
    if (!collectedTemplateKeys.has(styledTemplateKey(declaratorName, templateLoc))) {
      loc = templateLoc;
    }
  });

  return loc;
}

function styledTemplateKey(
  localName: string,
  loc: { line: number; column: number } | null | undefined,
): string {
  return loc ? `${localName}:${loc.line}:${loc.column}` : localName;
}
