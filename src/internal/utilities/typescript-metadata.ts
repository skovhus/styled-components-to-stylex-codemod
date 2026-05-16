import type { TransformContext } from "../transform-context.js";
import type { StyledDecl } from "../transform-types.js";
import { findTypeScriptComponentMetadata } from "../prepass/typescript-analysis.js";

export function applyTypeScriptMetadataToDecl(
  ctx: TransformContext,
  decl: StyledDecl,
  names: readonly string[],
): void {
  const typedComponent = findTypeScriptComponentMetadata(
    ctx.options.crossFileInfo?.typeScriptMetadata,
    ctx.file.path,
    names,
  );
  if (!typedComponent) {
    return;
  }

  decl.typeScriptPropNames = new Set(typedComponent.props.map((prop) => prop.name));
  decl.typeScriptExplicitPropNames = new Set(typedComponent.explicitPropNames);
  decl.typeScriptPropTypes = new Map(typedComponent.props.map((prop) => [prop.name, prop.type]));
  decl.typeScriptOptionalProps = new Set(
    typedComponent.props.filter((prop) => prop.optional).map((prop) => prop.name),
  );
  decl.typeScriptHasIndexSignature = typedComponent.hasIndexSignature;
  decl.typeScriptSupportsSxProp = typedComponent.supportsSxProp;
}
