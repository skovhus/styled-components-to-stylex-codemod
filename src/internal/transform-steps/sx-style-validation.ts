/**
 * `sx`-prop wrapped-component style validation helpers extracted from
 * analyze-before-emit. Verify that styles routed through a wrapped component's
 * `sx`/`className` channels only use properties the component actually accepts.
 */
import type { StyledDecl } from "../transform-types.js";
import { TransformContext } from "../transform-context.js";
import { findTypeScriptComponentMetadata } from "../utilities/typescript-metadata.js";
import type { TypeScriptComponentMetadata } from "../prepass/typescript-analysis.js";
import { isAstNode } from "../utilities/jscodeshift-utils.js";
import { resolveExistingFilePath } from "../utilities/path-utils.js";
import { wrappedComponentInterfaceFor } from "../utilities/wrapped-component-interface.js";
import { collectAllStyleKeysForDecl } from "./transient-prop-renames.js";
import { isLocalFunctionComponent } from "./binding-scope-analysis.js";

export function validateSxRestrictedWrappedComponentStyles(
  ctx: TransformContext,
  styledDecls: StyledDecl[],
): boolean {
  if (!ctx.adapter.useSxProp || !ctx.resolvedStyleObjects) {
    return true;
  }

  for (const decl of styledDecls) {
    if (decl.skipTransform || decl.base.kind !== "component") {
      continue;
    }

    const componentInterface = wrappedComponentInterfaceFor(ctx, decl.base.ident);
    const excludedProperties = componentInterface?.sxExcludedProperties;
    const allowedProperties = componentInterface?.sxAllowedProperties;
    const hasAllowedProperties = allowedProperties !== undefined;
    if (
      componentInterface?.acceptsSx !== true ||
      (!excludedProperties?.length &&
        !hasAllowedProperties &&
        !componentInterface.rootOnlyProperties?.length)
    ) {
      continue;
    }

    const excluded = new Set(excludedProperties ?? []);
    const allowed = hasAllowedProperties ? new Set(allowedProperties) : null;
    const rootOnly =
      componentInterface.sxTarget === "inner" && componentInterface.rootOnlyProperties?.length
        ? new Set(componentInterface.rootOnlyProperties)
        : null;
    for (const styleKey of collectAllStyleKeysForDecl(decl)) {
      const style = ctx.resolvedStyleObjects.get(styleKey);
      if (!style || typeof style !== "object") {
        continue;
      }
      const rootOnlyProperty = rootOnly ? findSxExcludedStyleProperty(style, rootOnly) : null;
      if (rootOnlyProperty) {
        ctx.warnings.push({
          severity: "error",
          type: "Wrapped component sx prop targets an inner element for a root style property",
          loc: decl.loc,
          context: {
            localName: decl.localName,
            wrappedComponent: decl.base.ident,
            styleKey,
            property: rootOnlyProperty,
          },
        });
        return false;
      }
      const rejectedProperty =
        excluded.size > 0 ? findSxExcludedStyleProperty(style, excluded) : null;
      if (!rejectedProperty) {
        const disallowedProperty = allowed ? findSxDisallowedStyleProperty(style, allowed) : null;
        if (!disallowedProperty) {
          continue;
        }
        /**
         * Keep this as a warning instead of bailing. Some component wrappers expose
         * narrow style APIs (for example icon `color` props instead of raw `fill`
         * styles), but the generated output is still localized and manually fixable
         * by the migration author.
         */
        ctx.warnings.push({
          severity: "warning",
          type: "Wrapped component sx prop does not accept generated StyleX property",
          loc: decl.loc,
          context: {
            localName: decl.localName,
            wrappedComponent: decl.base.ident,
            styleKey,
            property: disallowedProperty,
          },
        });
        continue;
      }
      ctx.warnings.push({
        severity: "error",
        type: "Wrapped component sx prop rejects logical CSS properties that cannot be preserved losslessly",
        loc: decl.loc,
        context: {
          localName: decl.localName,
          wrappedComponent: decl.base.ident,
          styleKey,
          property: rejectedProperty,
        },
      });
      return false;
    }
  }
  return true;
}

export function validateWrappedComponentStyleChannels(
  ctx: TransformContext,
  styledDecls: StyledDecl[],
): boolean {
  if (!ctx.resolvedStyleObjects) {
    return true;
  }

  for (const decl of styledDecls) {
    if (decl.skipTransform || decl.base.kind !== "component") {
      continue;
    }
    const baseIdent = decl.base.ident;
    if (styledDecls.some((candidate) => candidate.localName === baseIdent)) {
      continue;
    }
    const importInfo = ctx.importMap?.get(baseIdent);
    const isLocalNonStyledWrappedComponent =
      !importInfo && isLocalFunctionComponent(ctx.root, ctx.j, baseIdent);
    if (!importInfo && !isLocalNonStyledWrappedComponent) {
      continue;
    }
    if (
      importInfo?.source.kind === "absolutePath" &&
      ctx.options.transformedFileSources?.has(resolveExistingFilePath(importInfo.source.value))
    ) {
      continue;
    }
    if (!declHasEmittedStyle(ctx, decl)) {
      continue;
    }
    const componentInterface = wrappedComponentInterfaceFor(ctx, baseIdent);
    if (componentInterface?.acceptsSx === true && componentInterface.sxTarget !== "inner") {
      continue;
    }

    const metadata = findWrappedComponentMetadata(ctx, baseIdent);
    if (!metadata || componentAcceptsStylexClassName(metadata)) {
      continue;
    }
    if (isLocalNonStyledWrappedComponent && !hasInlineObjectPropType(metadata)) {
      continue;
    }

    ctx.warnings.push({
      severity: "error",
      type: "Wrapped component does not accept className or sx for generated StyleX styles",
      loc: decl.loc,
      context: {
        localName: decl.localName,
        wrappedComponent: decl.base.ident,
      },
    });
    return false;
  }
  return true;
}

function declHasEmittedStyle(ctx: TransformContext, decl: StyledDecl): boolean {
  for (const styleKey of collectAllStyleKeysForDecl(decl)) {
    if (ctx.resolvedStyleObjects?.has(styleKey)) {
      return true;
    }
  }
  return false;
}

function findWrappedComponentMetadata(
  ctx: TransformContext,
  componentLocalName: string,
): TypeScriptComponentMetadata | undefined {
  const metadata = ctx.options.crossFileInfo?.typeScriptMetadata;
  const importInfo = ctx.importMap?.get(componentLocalName);
  if (importInfo?.source.kind === "absolutePath") {
    return findTypeScriptComponentMetadata(metadata, importInfo.source.value, [
      importInfo.importedName,
      componentLocalName,
    ]);
  }
  return findTypeScriptComponentMetadata(metadata, ctx.file.path, [componentLocalName]);
}

function componentAcceptsStylexClassName(metadata: TypeScriptComponentMetadata): boolean {
  if (metadata.propType && isIntrinsicReactPropsTypeText(metadata.propType.text)) {
    return true;
  }
  if (metadata.hasIndexSignature) {
    return true;
  }
  if (metadata.explicitPropNames.includes("className")) {
    return true;
  }
  return metadata.props.some((prop) => prop.name === "className");
}

function isIntrinsicReactPropsTypeText(typeText: string): boolean {
  return /^(?:[$A-Z_a-z][$\w]*\.)*ComponentProps(?:WithRef|WithoutRef)?\s*<\s*(['"])[^'"]+\1\s*>$/.test(
    typeText.trim(),
  );
}

function hasInlineObjectPropType(metadata: TypeScriptComponentMetadata): boolean {
  return metadata.propType?.text.trim().startsWith("{") === true;
}

function findSxDisallowedStyleProperty(
  style: object,
  allowedProperties: ReadonlySet<string>,
): string | null {
  if (isAstNode(style)) {
    return findSxDisallowedStylePropertyInAstNode(style, allowedProperties);
  }

  for (const [key, value] of Object.entries(style)) {
    if (isStylexConditionKey(key)) {
      if (value && typeof value === "object") {
        const nested = findSxDisallowedStyleProperty(value, allowedProperties);
        if (nested) {
          return nested;
        }
      }
      continue;
    }
    if (!allowedProperties.has(key)) {
      return key;
    }
  }
  return null;
}

function staticObjectPropertyName(prop: unknown): string | null {
  if (!prop || typeof prop !== "object") {
    return null;
  }
  const p = prop as { type?: string; computed?: boolean; key?: unknown };
  if ((p.type !== "Property" && p.type !== "ObjectProperty") || p.computed) {
    return null;
  }
  const key = p.key as { type?: string; name?: string; value?: unknown } | undefined;
  if (!key) {
    return null;
  }
  if (key.type === "Identifier") {
    return key.name ?? null;
  }
  if (key.type === "Literal" || key.type === "StringLiteral") {
    return typeof key.value === "string" ? key.value : null;
  }
  return null;
}

function isStylexConditionKey(key: string): boolean {
  return (
    key === "default" ||
    key === "__computedKeys" ||
    key.startsWith(":") ||
    key.startsWith("@") ||
    key.startsWith("stylex.when")
  );
}

function findSxExcludedStyleProperty(
  style: object,
  excludedProperties: ReadonlySet<string>,
): string | null {
  if (isAstNode(style)) {
    return findSxExcludedStylePropertyInAstNode(style, excludedProperties);
  }

  for (const [key, value] of Object.entries(style)) {
    if (excludedProperties.has(key)) {
      return key;
    }
    if (value && typeof value === "object") {
      const nested = findSxExcludedStyleProperty(value, excludedProperties);
      if (nested) {
        return nested;
      }
    }
  }
  return null;
}

function findSxExcludedStylePropertyInAstNode(
  node: object,
  excludedProperties: ReadonlySet<string>,
): string | null {
  const n = node as {
    type?: string;
    argument?: unknown;
    body?: unknown;
    expression?: unknown;
    properties?: unknown[];
  };
  if (n.type === "ObjectExpression") {
    for (const prop of n.properties ?? []) {
      const name = staticObjectPropertyName(prop);
      if (name && excludedProperties.has(name)) {
        return name;
      }
      const value = (prop as { value?: unknown }).value;
      if (value && typeof value === "object") {
        const nested = findSxExcludedStylePropertyInAstNode(value, excludedProperties);
        if (nested) {
          return nested;
        }
      }
    }
    return null;
  }
  if (n.type === "ArrowFunctionExpression" && n.body && typeof n.body === "object") {
    return findSxExcludedStylePropertyInAstNode(n.body, excludedProperties);
  }
  if (n.type === "BlockStatement" && Array.isArray((n as { body?: unknown[] }).body)) {
    for (const statement of (n as { body?: unknown[] }).body ?? []) {
      const s = statement as { type?: string; argument?: unknown };
      if (s.type === "ReturnStatement" && s.argument && typeof s.argument === "object") {
        const nested = findSxExcludedStylePropertyInAstNode(s.argument, excludedProperties);
        if (nested) {
          return nested;
        }
      }
    }
  }
  return null;
}

function findSxDisallowedStylePropertyInAstNode(
  node: object,
  allowedProperties: ReadonlySet<string>,
): string | null {
  const n = node as {
    type?: string;
    argument?: unknown;
    body?: unknown;
    expression?: unknown;
    properties?: unknown[];
  };
  if (n.type === "ObjectExpression") {
    for (const prop of n.properties ?? []) {
      const name = staticObjectPropertyName(prop);
      const value = (prop as { value?: unknown }).value;
      if (!name) {
        if (value && typeof value === "object") {
          const nested = findSxDisallowedStylePropertyInAstNode(value, allowedProperties);
          if (nested) {
            return nested;
          }
        }
        continue;
      }
      if (isStylexConditionKey(name)) {
        if (value && typeof value === "object") {
          const nested = findSxDisallowedStylePropertyInAstNode(value, allowedProperties);
          if (nested) {
            return nested;
          }
        }
        continue;
      }
      if (!allowedProperties.has(name)) {
        return name;
      }
    }
    return null;
  }
  if (n.type === "ArrowFunctionExpression" && n.body && typeof n.body === "object") {
    return findSxDisallowedStylePropertyInAstNode(n.body, allowedProperties);
  }
  if (n.type === "ParenthesizedExpression" && n.expression && typeof n.expression === "object") {
    return findSxDisallowedStylePropertyInAstNode(n.expression, allowedProperties);
  }
  return null;
}
