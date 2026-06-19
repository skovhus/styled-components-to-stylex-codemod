import path from "node:path";
import ts from "typescript";
import { resolveExistingFilePath } from "../utilities/path-utils.js";

export function createProgram(rootNames: readonly string[], cwd: string): ts.Program {
  const configPath = findTsConfig(rootNames, cwd);
  const options = configPath ? readCompilerOptions(configPath) : defaultCompilerOptions();
  return ts.createProgram({
    rootNames: [...rootNames],
    options: {
      ...options,
      allowJs: true,
      checkJs: false,
      noEmit: true,
      skipLibCheck: true,
      skipDefaultLibCheck: true,
      // The prepass only needs structural prop-shape metadata; we don't run
      // type-checking and never emit. Skipping global @types packages saves
      // Program-construction time on large apps where the project tsconfig
      // pulls in many ambient type packages (node, react, framework-specific
      // declarations) that take seconds to parse. Override `types: []` to
      // suppress automatic inclusion. `lib` is left untouched so DOM / React
      // intrinsic type references (HTMLAttributes etc.) still resolve.
      types: [],
    },
  });
}

export function getExportedNames(sourceFile: ts.SourceFile, checker: ts.TypeChecker): Set<string> {
  const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
  if (!moduleSymbol) {
    return new Set();
  }
  return new Set(checker.getExportsOfModule(moduleSymbol).map((symbol) => symbol.getName()));
}

export function getDefaultExportedLocalNames(sourceFile: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (!ts.isExportAssignment(statement) || !ts.isIdentifier(statement.expression)) {
      continue;
    }
    names.add(statement.expression.text);
  }
  return names;
}

export function normalizeFilePaths(files: readonly string[]): string[] {
  return [...new Set(files.map(resolveExistingFilePath))].sort();
}

export function normalizeFilePath(filePath: string): string {
  return resolveExistingFilePath(filePath);
}

export function isTypeScriptLikeFile(filePath: string): boolean {
  return /\.(tsx?|jsx?)$/.test(filePath);
}

function readCompilerOptions(configPath: string): ts.CompilerOptions {
  const config = ts.readConfigFile(configPath, (filePath) => ts.sys.readFile(filePath));
  if (config.error) {
    return defaultCompilerOptions();
  }
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, path.dirname(configPath));
  return parsed.options;
}

function defaultCompilerOptions(): ts.CompilerOptions {
  return {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Node10,
    jsx: ts.JsxEmit.ReactJSX,
    esModuleInterop: true,
    skipLibCheck: true,
  };
}

function findTsConfig(rootNames: readonly string[], cwd: string): string | undefined {
  const start = rootNames.length > 0 ? path.dirname(rootNames[0]!) : cwd;
  return (
    ts.findConfigFile(start, (filePath) => ts.sys.fileExists(filePath), "tsconfig.json") ??
    undefined
  );
}
