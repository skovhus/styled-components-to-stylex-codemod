import { toRealPath } from "./path-utils.js";

export function transformedComponentAcceptsSx(args: {
  absolutePath: string;
  componentNames: readonly string[];
  sourceOverrides?: ReadonlyMap<string, string>;
}): boolean {
  const source = readTransformedSource(args.absolutePath, args.sourceOverrides);
  if (!source) {
    return false;
  }
  return args.componentNames.some((componentName) => componentHasSxProp(source, componentName));
}

function readTransformedSource(
  absolutePath: string,
  sourceOverrides: ReadonlyMap<string, string> | undefined,
): string | undefined {
  if (!sourceOverrides) {
    return undefined;
  }
  for (const candidate of sourcePathCandidates(absolutePath)) {
    const source = sourceOverrides.get(toRealPath(candidate));
    if (source !== undefined) {
      return source;
    }
  }
  return undefined;
}

function sourcePathCandidates(absolutePath: string): string[] {
  return ["", ".tsx", ".ts", ".jsx", ".js"].map((ext) => absolutePath + ext);
}

function componentHasSxProp(source: string, componentName: string): boolean {
  return functionParamHasSx(source, componentName) || typedParamHasSx(source, componentName);
}

function functionParamHasSx(source: string, componentName: string): boolean {
  const name = escapeRegex(componentName);
  const functionPattern = new RegExp(
    `(?:export\\s+)?function\\s+${name}\\s*\\(\\s*props\\s*:\\s*([\\s\\S]*?)\\)\\s*\\{`,
  );
  const functionMatch = source.match(functionPattern);
  if (functionMatch?.[1]?.includes("sx?: stylex.StyleXStyles")) {
    return true;
  }

  const arrowPattern = new RegExp(
    `(?:export\\s+)?(?:const|let|var)\\s+${name}\\s*=\\s*\\(\\s*props\\s*:\\s*([\\s\\S]*?)\\)\\s*=>`,
  );
  const arrowMatch = source.match(arrowPattern);
  return arrowMatch?.[1]?.includes("sx?: stylex.StyleXStyles") === true;
}

function typedParamHasSx(source: string, componentName: string): boolean {
  const name = escapeRegex(componentName);
  const functionPattern = new RegExp(
    `(?:export\\s+)?function\\s+${name}\\s*\\(\\s*props\\s*:\\s*([A-Za-z_$][\\w$]*)`,
  );
  const arrowPattern = new RegExp(
    `(?:export\\s+)?(?:const|let|var)\\s+${name}\\s*=\\s*\\(\\s*props\\s*:\\s*([A-Za-z_$][\\w$]*)`,
  );
  const typeName = source.match(functionPattern)?.[1] ?? source.match(arrowPattern)?.[1];
  return typeName ? typeAliasHasSx(source, typeName) : false;
}

function typeAliasHasSx(source: string, typeName: string): boolean {
  const typePattern = new RegExp(`type\\s+${escapeRegex(typeName)}\\b[\\s\\S]*?;`, "g");
  for (const match of source.matchAll(typePattern)) {
    if (match[0].includes("sx?: stylex.StyleXStyles")) {
      return true;
    }
  }
  const interfacePattern = new RegExp(
    `interface\\s+${escapeRegex(typeName)}\\b[\\s\\S]*?\\n\\}`,
    "g",
  );
  for (const match of source.matchAll(interfacePattern)) {
    if (match[0].includes("sx?: stylex.StyleXStyles")) {
      return true;
    }
  }
  return false;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
