import { existsSync, readFileSync } from "node:fs";
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
  for (const candidate of sourcePathCandidates(absolutePath)) {
    const source = sourceOverrides?.get(toRealPath(candidate));
    if (source !== undefined) {
      return source;
    }
    if (existsSync(candidate)) {
      try {
        return readFileSync(candidate, "utf8");
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

function sourcePathCandidates(absolutePath: string): string[] {
  return ["", ".tsx", ".ts", ".jsx", ".js"].map((ext) => absolutePath + ext);
}

function componentHasSxProp(source: string, componentName: string): boolean {
  return (
    readFunctionPropsType(source, componentName)?.includes("sx?: stylex.StyleXStyles") === true ||
    readArrowFunctionPropsType(source, componentName)?.includes("sx?: stylex.StyleXStyles") === true
  );
}

function readFunctionPropsType(source: string, componentName: string): string | undefined {
  const match = source.match(
    new RegExp(`(?:export\\s+)?function\\s+${escapeRegex(componentName)}\\s*\\(`),
  );
  return match?.index === undefined
    ? undefined
    : readFirstPropsType(source, match.index + match[0].length);
}

function readArrowFunctionPropsType(source: string, componentName: string): string | undefined {
  const match = source.match(
    new RegExp(`(?:export\\s+)?(?:const|let|var)\\s+${escapeRegex(componentName)}\\s*=\\s*\\(`),
  );
  return match?.index === undefined
    ? undefined
    : readFirstPropsType(source, match.index + match[0].length);
}

function readFirstPropsType(source: string, startIndex: number): string | undefined {
  const prefix = source.slice(startIndex).match(/^\s*props\s*:\s*/);
  if (!prefix) {
    return undefined;
  }
  let depth = 0;
  const typeStart = startIndex + prefix[0].length;
  for (let i = typeStart; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{" || ch === "<" || ch === "[" || ch === "(") {
      depth++;
    } else if (ch === "}" || ch === ">" || ch === "]" || (ch === ")" && depth > 0)) {
      depth--;
    } else if ((ch === "," || ch === ")") && depth <= 0) {
      return source.slice(typeStart, i);
    }
  }
  return undefined;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
