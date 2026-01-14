import { existsSync, readFileSync } from "node:fs";
import type { ImportSource } from "../adapter.js";

export function patternProp(j: any, keyName: string, valueId?: any): any {
  const key = j.identifier(keyName);
  const value = valueId ?? key;
  const p = j.property("init", key, value) as any;
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
  j: any;
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
      .forEach((p: any) => {
        const propName = ((p.node.expression as any).left.property as any).name;
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
