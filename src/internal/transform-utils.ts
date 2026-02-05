/**
 * Shared transform helpers for property patterns and static metadata.
 * Core concepts: AST property helpers and static import inspection.
 */
import { existsSync, readFileSync } from "node:fs";
import type { JSCodeshift, Property } from "jscodeshift";
type ExpressionKind = Parameters<JSCodeshift["expressionStatement"]>[0];
import type { ImportSource } from "../adapter.js";

export function patternProp(j: JSCodeshift, keyName: string, valueId?: ExpressionKind): Property {
  const key = j.identifier(keyName);
  const value = valueId ?? key;
  const p = j.property("init", key, value) as Property;
  if (value?.type === "Identifier" && value.name === keyName) {
    p.shorthand = true;
  }
  return p;
}

/**
 * Detect static property names assigned to a component in an imported file.
 * e.g., `ComponentName.HEIGHT = 42;` -> returns ["HEIGHT"]
 */
export function getStaticPropertiesFromImport(args: {
  j: JSCodeshift;
  source: ImportSource;
  componentName: string;
}): string[] {
  const { j, source, componentName } = args;
  // Only handle relative imports with resolved paths
  if (source.kind !== "absolutePath") {
    return [];
  }

  // Try common extensions
  const extensions = [".tsx", ".ts", ".jsx", ".js"];
  let filePath: string | null = null;

  for (const ext of extensions) {
    const candidate = source.value + ext;
    if (existsSync(candidate)) {
      filePath = candidate;
      break;
    }
  }

  // Also try if the path itself exists (might already have extension)
  if (!filePath && existsSync(source.value)) {
    filePath = source.value;
  }

  if (!filePath) {
    return [];
  }

  try {
    const content = readFileSync(filePath, "utf-8");
    const importedRoot = j(content);
    const staticProps: string[] = [];

    // Find patterns like: ComponentName.PROP = value;
    importedRoot
      .find(j.ExpressionStatement, {
        expression: {
          type: "AssignmentExpression",
          operator: "=",
          left: {
            type: "MemberExpression",
            object: { type: "Identifier", name: componentName },
            property: { type: "Identifier" },
          },
        },
      } as any)
      .forEach((p) => {
        const propName = (p.node.expression as any).left.property?.name;
        if (propName) {
          staticProps.push(propName);
        }
      });

    return staticProps;
  } catch {
    // If we can't read/parse the file, return empty
    return [];
  }
}
