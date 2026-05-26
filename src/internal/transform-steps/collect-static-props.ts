/**
 * Step: collect static property assignments on styled components.
 * Core concepts: static metadata capture and inheritance generation.
 */
import type { JSCodeshift } from "jscodeshift";
import { CONTINUE, getActiveStyledDecls, type StepResult } from "../transform-types.js";
import type { StyledDecl } from "../transform-types.js";
import { TransformContext } from "../transform-context.js";
import { getEffectiveBaseIdent } from "../utilities/delegation-utils.js";

type StatementKind = Parameters<JSCodeshift["blockStatement"]>[0][number];

/**
 * Collects static property assignments and generates inheritance statements.
 */
export function collectStaticPropsStep(ctx: TransformContext): StepResult {
  const { root, j } = ctx;
  const allStyledDecls = ctx.styledDecls as StyledDecl[] | undefined;
  if (!allStyledDecls || !ctx.declByLocal || !ctx.extendedBy || !ctx.exportedComponents) {
    return CONTINUE;
  }
  // Skip decls that couldn't be lowered — their static props assignments, if any,
  // remain attached to the original styled-components declaration in the source.
  const styledDecls = getActiveStyledDecls(allStyledDecls) ?? [];

  // Collect static property assignments for styled components (e.g., ListItem.HEIGHT = 42)
  // These need to be repositioned after the wrapper functions are emitted.
  // For base components that are extended, we also generate inheritance assignments.
  const staticPropertyAssignments = new Map<string, any[]>();
  const staticPropertyNames = new Map<string, string[]>(); // componentName -> [propName, ...]
  const styledNames = new Set(styledDecls.map((d) => d.localName));

  // Also track base components of styled components (they may have static properties to inherit)
  const baseComponentNames = new Set<string>();
  for (const decl of styledDecls) {
    const baseIdent = getEffectiveBaseIdent(decl);
    if (baseIdent && !styledNames.has(baseIdent)) {
      baseComponentNames.add(baseIdent);
    }
  }

  root
    .find(j.ExpressionStatement)
    .filter((p) => {
      const expr = p.node.expression;
      if (expr?.type !== "AssignmentExpression") {
        return false;
      }
      const left = expr.left;
      if (left?.type !== "MemberExpression") {
        return false;
      }
      const obj = left.object;
      if (obj?.type !== "Identifier") {
        return false;
      }
      // Track static properties on styled components AND their base components
      return styledNames.has(obj.name) || baseComponentNames.has(obj.name);
    })
    .forEach((p) => {
      const expr = p.node.expression as any;
      const componentName = expr.left.object.name as string;
      const propName = getStaticPropertyNameFromMemberExpression(expr.left);

      // Track property names for inheritance generation
      if (propName) {
        addStaticPropertyName(staticPropertyNames, componentName, propName);
      }

      // For non-styled base components, only track properties for inheritance (don't remove or reposition)
      if (baseComponentNames.has(componentName)) {
        return;
      }

      // Only reposition static properties for exported components
      // Non-exported base components will have their properties inherited by extended components
      // Also reposition static properties for non-exported components that are extended by another
      // styled component (so the base value exists at runtime for inheritance assignments).
      if (ctx.exportedComponents?.has(componentName) || ctx.extendedBy?.has(componentName)) {
        const existing = staticPropertyAssignments.get(componentName) ?? [];
        existing.push(p.node);
        staticPropertyAssignments.set(componentName, existing);
      }

      // Remove from current position
      j(p).remove();
    });

  root.find(j.CallExpression).forEach((path: any) => {
    const callee = path.node.callee;
    if (
      callee?.type !== "MemberExpression" ||
      callee.object?.type !== "Identifier" ||
      callee.object.name !== "Object" ||
      callee.property?.type !== "Identifier" ||
      callee.property.name !== "assign"
    ) {
      return;
    }
    const parent = path.parentPath?.node;
    const assignedName =
      parent?.type === "VariableDeclarator" && parent.id?.type === "Identifier"
        ? parent.id.name
        : null;
    const target = path.node.arguments?.[0];
    const statics = path.node.arguments?.[1];
    if (target?.type !== "Identifier") {
      return;
    }
    const componentNames = [target.name, ...(assignedName ? [assignedName] : [])].filter(
      (name, index, names) => names.indexOf(name) === index && baseComponentNames.has(name),
    );
    if (componentNames.length === 0) {
      return;
    }
    if (statics?.type !== "ObjectExpression") {
      return;
    }
    for (const componentName of componentNames) {
      for (const prop of statics.properties ?? []) {
        const propName = getStaticPropertyNameFromObjectProperty(prop);
        if (propName) {
          addStaticPropertyName(staticPropertyNames, componentName, propName);
        }
      }
    }
  });

  // Generate static property inheritance for extended components
  // e.g., ExtendedButton.HEIGHT = BaseButton.HEIGHT
  // This works for both styled base components AND regular React components with static props
  for (const decl of styledDecls) {
    const baseIdent = getEffectiveBaseIdent(decl);
    if (!baseIdent) {
      continue;
    }

    // Check for static properties on the base component
    // The base can be either a styled component (in declByLocal) or a regular React component
    const baseDecl = ctx.declByLocal.get(baseIdent);
    // Use baseDecl.localName if available, otherwise use baseIdent directly
    const baseComponentName = baseDecl?.localName ?? baseIdent;
    const baseProps = staticPropertyNames.get(baseComponentName);
    if (!baseProps || baseProps.length === 0) {
      continue;
    }

    // Generate inheritance assignments for each static property
    // Skip if the extended component already has existing static property assignments
    // (they were collected earlier from the original code)
    const existing = staticPropertyAssignments.get(decl.localName) ?? [];
    if (existing.length > 0) {
      // Already has inheritance statements from original code, don't duplicate
      continue;
    }

    const inheritanceStatements: StatementKind[] = [];
    for (const propName of baseProps) {
      inheritanceStatements.push(
        buildStaticInheritanceStatement(ctx.j, decl.localName, baseComponentName, propName),
      );
    }

    if (inheritanceStatements.length > 0) {
      staticPropertyAssignments.set(decl.localName, inheritanceStatements);
    }
  }

  // Generate static property inheritance for styled components wrapping IMPORTED components
  // We detect these by:
  // 1. Finding property accesses on styled components that wrap imports (same-file usage)
  // 2. OR by analyzing the imported file to find static property assignments (cross-file)
  for (const decl of styledDecls) {
    const baseIdent = getEffectiveBaseIdent(decl);
    if (!baseIdent) {
      continue;
    }

    // Skip if base is a styled component in this file (handled above)
    if (ctx.declByLocal.has(baseIdent)) {
      continue;
    }

    // Skip if base is a local non-styled component (handled above via staticPropertyNames)
    if (staticPropertyNames.has(baseIdent)) {
      continue;
    }

    // Check if this is an imported component
    const importInfo = ctx.importMap?.get(baseIdent);
    if (!importInfo) {
      continue;
    }

    // Find all property accesses on this styled component (e.g., CommandMenuTextDivider.HEIGHT)
    const accessedProps = new Set<string>();
    root
      .find(j.MemberExpression, {
        object: { type: "Identifier", name: decl.localName },
        property: { type: "Identifier" },
      } as any)
      .forEach((p) => {
        const propName = (p.node.property as any).name;
        // Skip common built-in properties
        if (propName && !["prototype", "name", "length", "displayName"].includes(propName)) {
          accessedProps.add(propName);
        }
      });

    // If no same-file property accesses, try to detect from the imported file
    if (accessedProps.size === 0) {
      const propsFromImport = ctx.getStaticPropertiesFromImport(
        importInfo.source,
        importInfo.importedName,
      );
      for (const propName of propsFromImport) {
        accessedProps.add(propName);
      }
    }

    if (accessedProps.size === 0) {
      continue;
    }

    // Generate inheritance statements for each accessed property
    const inheritanceStatements: StatementKind[] = [];
    for (const propName of accessedProps) {
      const stmt = j.expressionStatement(
        j.assignmentExpression(
          "=",
          j.memberExpression(j.identifier(decl.localName), j.identifier(propName)),
          j.memberExpression(j.identifier(baseIdent), j.identifier(propName)),
        ),
      );
      inheritanceStatements.push(stmt);
    }

    if (inheritanceStatements.length > 0) {
      const existing = staticPropertyAssignments.get(decl.localName) ?? [];
      existing.push(...inheritanceStatements);
      staticPropertyAssignments.set(decl.localName, existing);
    }
  }

  ctx.staticPropertyAssignments = staticPropertyAssignments;
  ctx.staticPropertyNames = staticPropertyNames;

  return CONTINUE;
}

function addStaticPropertyName(
  staticPropertyNames: Map<string, string[]>,
  componentName: string,
  propName: string,
): void {
  const names = staticPropertyNames.get(componentName) ?? [];
  if (!names.includes(propName)) {
    names.push(propName);
    staticPropertyNames.set(componentName, names);
  }
}

function getStaticPropertyNameFromMemberExpression(memberExpression: {
  computed?: boolean;
  property?: { type?: string; name?: string; value?: unknown };
}): string | null {
  const property = memberExpression.property;
  if (!memberExpression.computed && property?.type === "Identifier") {
    return property.name ?? null;
  }
  if (
    (property?.type === "Literal" || property?.type === "StringLiteral") &&
    typeof property.value === "string"
  ) {
    return property.value;
  }
  return null;
}

function getStaticPropertyNameFromObjectProperty(prop: unknown): string | null {
  if (!prop || typeof prop !== "object") {
    return null;
  }
  const property = prop as {
    type?: string;
    computed?: boolean;
    key?: { type?: string; name?: string; value?: unknown };
  };
  if (property.type === "SpreadElement" || property.type === "SpreadProperty") {
    return null;
  }
  const key = property.key;
  if (!property.computed && key?.type === "Identifier") {
    return key.name ?? null;
  }
  if ((key?.type === "Literal" || key?.type === "StringLiteral") && typeof key.value === "string") {
    return key.value;
  }
  return null;
}

function buildStaticInheritanceStatement(
  j: TransformContext["j"],
  componentName: string,
  baseComponentName: string,
  propName: string,
): StatementKind {
  const target = isIdentifierPropertyName(propName)
    ? `${componentName}.${propName}`
    : `(${componentName} as any)[${JSON.stringify(propName)}]`;
  const source = isIdentifierPropertyName(propName)
    ? `(${baseComponentName} as any).${propName}`
    : `(${baseComponentName} as any)[${JSON.stringify(propName)}]`;
  return j(`${target} = ${source};`).get().node.program.body[0];
}

function isIdentifierPropertyName(propName: string): boolean {
  return /^[$A-Z_a-z][$\w]*$/.test(propName);
}
