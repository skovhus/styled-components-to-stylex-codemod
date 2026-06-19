/**
 * Free helper functions for {@link WrapperEmitter}.
 *
 * These are pure utilities that do not depend on emitter instance state. They
 * live in a sibling module to keep `wrapper-emitter.ts` focused on the class.
 */
import type { JSCodeshift } from "jscodeshift";
import type { JsxTagName } from "./jsx-builders.js";

/** Props whose types are the same on every element and can be inlined. */
export const UNIVERSAL_PROP_TYPES: Record<string, string> = {
  className: "className?: string",
  style: "style?: React.CSSProperties",
};

export function isExternalStylePropName(propName: string): boolean {
  return propName === "className" || propName === "style";
}

export function isExternalStyleOrSxPropName(propName: string): boolean {
  return isExternalStylePropName(propName) || propName === "sx";
}

export function inlineTypeNeedsElementGeneric(typeText: string | undefined): boolean {
  if (!typeText) {
    return false;
  }
  return (
    /\bReact\.ComponentProps(?:WithRef)?<C\b/.test(typeText) || /\bas\??:\s*C\b/.test(typeText)
  );
}

export function expressionReferencesComponentAlias(
  node: unknown,
  aliasNames: ReadonlySet<string>,
  seen = new WeakSet<object>(),
): boolean {
  if (!node || typeof node !== "object") {
    return false;
  }
  if (seen.has(node)) {
    return false;
  }
  seen.add(node);
  const maybeNode = node as { type?: string; name?: string };
  if (maybeNode.type === "Identifier") {
    return Boolean(maybeNode.name && aliasNames.has(maybeNode.name));
  }
  if (
    maybeNode.type === "ConditionalExpression" ||
    maybeNode.type === "LogicalExpression" ||
    maybeNode.type === "SequenceExpression"
  ) {
    return Object.values(node as Record<string, unknown>).some((child) =>
      expressionReferencesComponentAlias(child, aliasNames, seen),
    );
  }
  if (
    maybeNode.type === "TSAsExpression" ||
    maybeNode.type === "TSTypeAssertion" ||
    maybeNode.type === "TSNonNullExpression" ||
    maybeNode.type === "ParenthesizedExpression"
  ) {
    return expressionReferencesComponentAlias(
      (node as { expression?: unknown }).expression,
      aliasNames,
      seen,
    );
  }
  return false;
}

/**
 * If `typeText` is a simple `{ prop?: type; … }` object literal, returns the
 * individual member strings.  Returns `null` for any other shape (Pick, Omit,
 * intersections, mapped types, etc.).
 */
export function extractObjectLiteralMembers(typeText: string): string[] | null {
  const t = typeText.trim();
  if (!t.startsWith("{") || !t.endsWith("}")) {
    return null;
  }
  const inner = t.slice(1, -1).trim();
  if (!inner) {
    return null;
  }
  // Reject complex types (mapped types, arrow types)
  if (inner.includes("[") || inner.includes("=>")) {
    return null;
  }
  // Depth-aware split: only split on `;` or `,` at the top level,
  // skipping over `<…>`, `(…)`, `"…"`, `'…'` nesting.
  const members: string[] = [];
  let depth = 0;
  let start = 0;
  let inString: string | null = null;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i]!;
    if (inString) {
      if (ch === inString && inner[i - 1] !== "\\") {
        inString = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = ch;
      continue;
    }
    if (ch === "<" || ch === "(") {
      depth++;
    } else if (ch === ">" || ch === ")") {
      depth--;
    } else if (depth === 0 && (ch === ";" || ch === ",")) {
      const member = inner.slice(start, i).trim();
      if (member) {
        members.push(member);
      }
      start = i + 1;
    }
  }
  const last = inner.slice(start).trim();
  if (last) {
    members.push(last);
  }
  return members.length > 0 ? members : null;
}

export function jsxNameFromString(j: JSCodeshift, name: string): JsxTagName {
  if (!name.includes(".")) {
    return j.jsxIdentifier(name);
  }
  const [root, ...members] = name.split(".");
  if (!root || members.length === 0) {
    return j.jsxIdentifier(name);
  }
  type JsxMemberObject = Parameters<JSCodeshift["jsxMemberExpression"]>[0];
  return members.reduce<JsxMemberObject>(
    (object, member) => j.jsxMemberExpression(object, j.jsxIdentifier(member)),
    j.jsxIdentifier(root),
  );
}
