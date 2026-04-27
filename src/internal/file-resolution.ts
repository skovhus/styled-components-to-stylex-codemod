import { existsSync, readFileSync } from "node:fs";

const COMMON_SOURCE_EXTENSIONS = [".tsx", ".ts", ".jsx", ".js"] as const;

export function resolveSourcePath(
  importPath: string,
  options?: { includeIndexFallbacks?: boolean },
): string | null {
  const includeIndexFallbacks = options?.includeIndexFallbacks === true;
  const candidates = buildSourceCandidates(importPath, includeIndexFallbacks);
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

export function readSourceText(
  importPath: string,
  options?: { includeIndexFallbacks?: boolean },
): string | null {
  const resolved = resolveSourcePath(importPath, options);
  if (!resolved) {
    return null;
  }
  try {
    return readFileSync(resolved, "utf-8");
  } catch {
    return null;
  }
}

function buildSourceCandidates(importPath: string, includeIndexFallbacks: boolean): string[] {
  const baseCandidates = [importPath, ...COMMON_SOURCE_EXTENSIONS.map((ext) => importPath + ext)];
  if (!includeIndexFallbacks) {
    return baseCandidates;
  }
  return [...baseCandidates, ...COMMON_SOURCE_EXTENSIONS.map((ext) => `${importPath}/index${ext}`)];
}
