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
  const name = escapeRegex(componentName);
  const functionPattern = new RegExp(
    `(?:export\\s+)?function\\s+${name}\\s*\\(\\s*props\\s*:\\s*[\\s\\S]*?sx\\?:\\s*stylex\\.StyleXStyles`,
  );
  if (functionPattern.test(source)) {
    return true;
  }

  const arrowPattern = new RegExp(
    `(?:export\\s+)?(?:const|let|var)\\s+${name}\\s*=\\s*\\(\\s*props\\s*:\\s*[\\s\\S]*?sx\\?:\\s*stylex\\.StyleXStyles`,
  );
  return arrowPattern.test(source);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
