import { existsSync, realpathSync } from "node:fs";
import path from "node:path";
import type { TransformContext } from "../transform-context.js";
import type { StyledDecl } from "../transform-types.js";
import type {
  TypeScriptComponentMetadata,
  TypeScriptPrepassMetadata,
} from "../prepass/typescript-analysis.js";

export function findTypeScriptComponentMetadata(
  metadata: TypeScriptPrepassMetadata | undefined,
  filePath: string,
  componentNames: readonly string[],
): TypeScriptComponentMetadata | undefined {
  if (!metadata) {
    return undefined;
  }
  const names = new Set(componentNames);
  const resolvedFilePath = resolveExistingFilePath(filePath);
  return metadata.files
    .find((file) => file.filePath === resolvedFilePath)
    ?.components.find(
      (component) => names.has(component.name) || defaultExportMatches(component, names),
    );
}

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

function defaultExportMatches(
  component: TypeScriptComponentMetadata,
  names: ReadonlySet<string>,
): boolean {
  return component.defaultExport && names.has("default");
}

function resolveExistingFilePath(filePath: string): string {
  const resolved = resolveExistingSourceFilePath(filePath);
  if (!existsSync(resolved)) {
    return resolved;
  }
  try {
    return realpathSync(resolved);
  } catch {
    return resolved;
  }
}

function resolveExistingSourceFilePath(filePath: string): string {
  const resolved = path.resolve(filePath);
  if (existsSync(resolved)) {
    return resolved;
  }
  for (const extension of [".tsx", ".ts", ".jsx", ".js", "/index.tsx", "/index.ts"]) {
    const candidate = `${resolved}${extension}`;
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return resolved;
}
