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
  const propsType =
    readFunctionPropsType(source, componentName) ??
    readArrowFunctionPropsType(source, componentName);
  return propsType ? typeTextHasSx(source, propsType, new Set()) : false;
}

function readFunctionPropsType(source: string, componentName: string): string | undefined {
  if (componentName === "default") {
    const defaultMatch = source.match(/export\s+default\s+function\s*\(/);
    if (defaultMatch?.index !== undefined) {
      return readFirstPropsType(source, defaultMatch.index + defaultMatch[0].length);
    }
  }
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

function typeTextHasSx(source: string, typeText: string, visited: Set<string>): boolean {
  if (/\bsx\??\s*:\s*(?:stylex\.)?StyleXStyles\b/.test(typeText)) {
    return true;
  }
  const typeName = typeText.trim().match(/^([A-Za-z_$][\w$]*)$/)?.[1];
  if (!typeName || visited.has(typeName)) {
    return false;
  }
  visited.add(typeName);
  const declaration = readTypeAlias(source, typeName) ?? readInterfaceBody(source, typeName);
  return declaration ? typeTextHasSx(source, declaration, visited) : false;
}

function readTypeAlias(source: string, typeName: string): string | undefined {
  const match = source.match(new RegExp(`type\\s+${escapeRegex(typeName)}\\b\\s*=\\s*`));
  if (match?.index === undefined) {
    return undefined;
  }
  return readUntilTopLevelTerminator(source, match.index + match[0].length, ";");
}

function readInterfaceBody(source: string, typeName: string): string | undefined {
  const match = source.match(new RegExp(`interface\\s+${escapeRegex(typeName)}\\b[^{]*\\{`));
  if (match?.index === undefined) {
    return undefined;
  }
  return readUntilMatchingBrace(source, match.index + match[0].length - 1);
}

function readUntilTopLevelTerminator(
  source: string,
  startIndex: number,
  terminator: string,
): string | undefined {
  let depth = 0;
  for (let i = startIndex; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{" || ch === "<" || ch === "[" || ch === "(") {
      depth++;
    } else if (ch === "}" || ch === ">" || ch === "]" || (ch === ")" && depth > 0)) {
      depth--;
    } else if (ch === terminator && depth <= 0) {
      return source.slice(startIndex, i);
    }
  }
  return undefined;
}

function readUntilMatchingBrace(source: string, braceIndex: number): string | undefined {
  let depth = 0;
  for (let i = braceIndex; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return source.slice(braceIndex + 1, i);
      }
    }
  }
  return undefined;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
