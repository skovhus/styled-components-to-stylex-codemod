import { CONTINUE, type StepResult } from "../transform-types.js";
import type { StyledDecl } from "../transform-types.js";
import { TransformContext } from "../transform-context.js";

/**
 * Collects static property assignments and generates inheritance statements.
 */
export function collectStaticPropsStep(ctx: TransformContext): StepResult {
  const { root, j } = ctx;
  const styledDecls = ctx.styledDecls as StyledDecl[] | undefined;
  if (!styledDecls || !ctx.declByLocal || !ctx.extendedBy || !ctx.exportedComponents) {
    return CONTINUE;
  }

  // Collect static property assignments for styled components (e.g., ListItem.HEIGHT = 42)
  // These need to be repositioned after the wrapper functions are emitted.
  // For base components that are extended, we also generate inheritance assignments.
  const staticPropertyAssignments = new Map<string, any[]>();
  const staticPropertyNames = new Map<string, string[]>(); // componentName -> [propName, ...]
  const styledNames = new Set(styledDecls.map((d) => d.localName));

  // Also track base components of styled components (they may have static properties to inherit)
  const baseComponentNames = new Set<string>();
  for (const decl of styledDecls) {
    const originalBaseIdent = (decl as any).originalBaseIdent as string | undefined;
    const baseIdent =
      originalBaseIdent ?? (decl.base.kind === "component" ? decl.base.ident : null);
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
      const propName = expr.left.property?.name ?? expr.left.property?.value;

      // Track property names for inheritance generation
      if (propName) {
        const names = staticPropertyNames.get(componentName) ?? [];
        names.push(propName);
        staticPropertyNames.set(componentName, names);
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

  // Generate static property inheritance for extended components
  // e.g., ExtendedButton.HEIGHT = BaseButton.HEIGHT
  // This works for both styled base components AND regular React components with static props
  for (const decl of styledDecls) {
    // Check for originalBaseIdent (set when base was a component that got converted to intrinsic)
    const originalBaseIdent = (decl as any).originalBaseIdent as string | undefined;
    const baseIdent =
      originalBaseIdent ?? (decl.base.kind === "component" ? decl.base.ident : null);
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

    const inheritanceStatements: any[] = [];
    for (const propName of baseProps) {
      // Accessing arbitrary static properties on a function component is legal at runtime,
      // but TypeScript doesn't know about ad-hoc statics. Cast the base to `any` to keep
      // generated outputs typecheck-friendly.
      const rhs = ctx.j(`const __x = (${baseComponentName} as any).${propName};`).get().node.program
        .body[0].declarations[0].init;
      const stmt = ctx.j.expressionStatement(
        ctx.j.assignmentExpression(
          "=",
          ctx.j.memberExpression(ctx.j.identifier(decl.localName), ctx.j.identifier(propName)),
          rhs as any,
        ),
      );
      inheritanceStatements.push(stmt);
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
    const originalBaseIdent = (decl as any).originalBaseIdent as string | undefined;
    const baseIdent =
      originalBaseIdent ?? (decl.base.kind === "component" ? decl.base.ident : null);
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
    const inheritanceStatements: any[] = [];
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
