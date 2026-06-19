/**
 * Pure TypeScript type-text utilities for {@link WrapperEmitter}.
 *
 * These functions stringify AST type nodes and compose type-text strings. They
 * do not depend on emitter instance state, so they live in a sibling module.
 */
import type { ASTNode } from "jscodeshift";
import { isIdentifierNode } from "../utilities/jscodeshift-utils.js";
import { extractObjectLiteralMembers } from "./wrapper-emitter-helpers.js";

type AstNodeOrNull = ASTNode | null | undefined;

export function stringifyTsType(t: AstNodeOrNull): string | null {
  if (!t) {
    return null;
  }
  if (t.type === "TSTypeReference") {
    const base = stringifyTsTypeName((t as any).typeName);
    if (!base) {
      return null;
    }
    const params = (t as any).typeParameters?.params;
    if (Array.isArray(params) && params.length > 0) {
      const inner = params.map((p: any) => stringifyTsType(p)).filter(Boolean) as string[];
      if (inner.length === params.length) {
        return `${base}<${inner.join(", ")}>`;
      }
    }
    return base;
  }
  if (t.type === "TSTypeLiteral") {
    const members = Array.isArray((t as any).members) ? (t as any).members : [];
    const lines: string[] = [];
    for (const m of members) {
      if (!m || m.type !== "TSPropertySignature") {
        continue;
      }
      const key = (() => {
        const k = m.key;
        if (!k) {
          return null;
        }
        if (k.type === "Identifier") {
          return k.name;
        }
        if (k.type === "StringLiteral") {
          return JSON.stringify(k.value);
        }
        if (k.type === "Literal" && typeof k.value === "string") {
          return JSON.stringify(k.value);
        }
        return null;
      })();
      if (!key) {
        continue;
      }
      const ann = m.typeAnnotation?.typeAnnotation;
      const val = stringifyTsType(ann) ?? "any";
      const opt = m.optional ? "?" : "";
      lines.push(`  ${key}${opt}: ${val};`);
    }
    if (lines.length === 0) {
      return "{}";
    }
    return `{\n${lines.join("\n")}\n}`;
  }
  if (t.type === "TSUnionType") {
    const parts = ((t as any).types ?? [])
      .map((p: any) => stringifyTsType(p))
      .filter(Boolean) as string[];
    return parts.length === ((t as any).types ?? []).length ? parts.join(" | ") : null;
  }
  if (t.type === "TSIntersectionType") {
    const parts = ((t as any).types ?? [])
      .map((p: any) => stringifyTsType(p))
      .filter(Boolean) as string[];
    return parts.length === ((t as any).types ?? []).length ? parts.join(" & ") : null;
  }
  if (t.type === "TSLiteralType") {
    const lit = (t as any).literal;
    if (lit?.type === "StringLiteral") {
      return JSON.stringify(lit.value);
    }
    if (lit?.type === "NumericLiteral") {
      return String(lit.value);
    }
    if (lit?.type === "BooleanLiteral") {
      return lit.value ? "true" : "false";
    }
  }
  if (t.type === "TSIndexedAccessType") {
    const obj = stringifyTsType((t as any).objectType);
    const idx = stringifyTsType((t as any).indexType);
    return obj && idx ? `${obj}[${idx}]` : null;
  }
  const maybeKeyof = t as { type?: string; typeAnnotation?: AstNodeOrNull };
  if (maybeKeyof.type === "TSKeyofType") {
    const ref = stringifyTsType(maybeKeyof.typeAnnotation);
    return ref ? `keyof ${ref}` : null;
  }
  if ((t as any).type === "TSTypeOperator" && (t as any).operator === "keyof") {
    const ref = stringifyTsType((t as any).typeAnnotation);
    return ref ? `keyof ${ref}` : null;
  }
  if (t.type === "TSStringKeyword") {
    return "string";
  }
  if (t.type === "TSNumberKeyword") {
    return "number";
  }
  if (t.type === "TSBooleanKeyword") {
    return "boolean";
  }
  if (t.type === "TSAnyKeyword") {
    return "any";
  }
  if (t.type === "TSUndefinedKeyword") {
    return "undefined";
  }
  if (t.type === "TSNullKeyword") {
    return "null";
  }
  if (t.type === "TSVoidKeyword") {
    return "void";
  }
  if (t.type === "TSNeverKeyword") {
    return "never";
  }
  if (t.type === "TSUnknownKeyword") {
    return "unknown";
  }
  return null;
}

export function joinIntersection(...parts: Array<string | null | undefined>): string {
  const xs = parts
    .map((p) => (p ?? "").trim())
    .filter(Boolean)
    .filter((p) => p !== "{}");
  if (xs.length === 0) {
    return "{}";
  }
  if (xs.length === 1 && xs[0]) {
    return xs[0];
  }
  // Merge consecutive object-literal parts into a single literal
  // so `{ a } & { b }` becomes `{ a, b }` instead.
  const merged: string[] = [];
  let pendingMembers: string[] = [];
  const seenKeys = new Set<string>();
  const addMember = (member: string): void => {
    const key = member.replace(/\??\s*:.*$/, "").trim();
    if (seenKeys.has(key)) {
      return;
    }
    seenKeys.add(key);
    pendingMembers.push(member);
  };
  const flush = (): void => {
    if (pendingMembers.length === 0) {
      return;
    }
    merged.push(
      pendingMembers.length === 1
        ? `{ ${pendingMembers[0]} }`
        : `{\n  ${pendingMembers.join(",\n  ")}\n}`,
    );
    pendingMembers = [];
    seenKeys.clear();
  };
  for (const part of xs) {
    const members = extractObjectLiteralMembers(part);
    if (members) {
      for (const m of members) {
        addMember(m);
      }
    } else {
      flush();
      merged.push(part);
    }
  }
  flush();
  if (merged.length === 0) {
    return "{}";
  }
  if (merged.length === 1 && merged[0]) {
    return merged[0];
  }
  return merged.join(" & ");
}

export function toTypeKey(name: string): string {
  return isValidTypeKeyIdentifier(name) ? name : JSON.stringify(name);
}

export function withChildren(innerTypeText: string): string {
  const t = innerTypeText.trim();
  if (t === "{}") {
    return "{ children?: React.ReactNode }";
  }
  if (t.startsWith("React.PropsWithChildren<")) {
    return t;
  }
  // Types that already include children — skip wrapping.
  // Matches ComponentProps, Pick<ComponentProps, "children" | …>, etc.
  // at the start OR after `&` in an intersection.
  const alreadyHasChildren =
    /(?:^|&\s*)(?:React\.ComponentProps(?:WithRef)?<|(?:Omit|Pick|Partial|Required|Readonly|ReadonlyArray|NonNullable|Extract|Exclude)<\s*React\.ComponentProps(?:WithRef)?<)/.test(
      t,
    );
  if (alreadyHasChildren) {
    return t;
  }
  return `React.PropsWithChildren<${t}>`;
}

/**
 * Build an expression to use in `Omit<..., ${expr}>` for excluding the keys
 * of a props type. When the type is a simple inline object literal, extracts
 * keys as a union of string literals (e.g. `"size" | "color"`). For named
 * type references, returns `keyof TypeName`. Falls back to
 * `keyof (${stringified})` for complex or unresolvable types.
 */
export function keyofExprForType(
  propsType: ASTNode | undefined,
  stringified: string | null,
): string | null {
  if (!propsType || !stringified) {
    return null;
  }
  const keys = extractDirectPropertyKeys(propsType);
  if (keys && keys.length > 0) {
    return keys.map((k) => JSON.stringify(k)).join(" | ");
  }
  return `keyof (${stringified})`;
}

/**
 * Extract property key names directly from an inline TS type literal AST node.
 * Returns an array of key names for `{ key1: T; key2: U }` literals.
 * Returns null for named type references, complex types, or when keys
 * cannot be statically extracted.
 */
function extractDirectPropertyKeys(propsType: ASTNode): string[] | null {
  if (propsType.type !== "TSTypeLiteral") {
    return null;
  }
  const members = (propsType as ASTNode & { members?: unknown[] }).members ?? [];
  const keys: string[] = [];
  for (const member of members) {
    const m = member as {
      type?: string;
      key?: { type?: string; name?: string; value?: string };
    };
    if (m.type !== "TSPropertySignature") {
      return null;
    }
    const key = m.key;
    const name =
      key?.type === "Identifier" ? key.name : key?.type === "StringLiteral" ? key.value : null;
    if (!name) {
      return null;
    }
    keys.push(name);
  }
  return keys.length > 0 ? keys : null;
}

// ---------------------------------------------------------------------------
// Non-exported helpers
// ---------------------------------------------------------------------------

function stringifyTsTypeName(n: AstNodeOrNull): string | null {
  if (!n) {
    return null;
  }
  if (isIdentifierNode(n)) {
    return n.name;
  }
  if (n.type === "TSQualifiedName") {
    const left = stringifyTsTypeName((n as any).left);
    const right = stringifyTsTypeName((n as any).right);
    return left && right ? `${left}.${right}` : null;
  }
  return null;
}

function isValidTypeKeyIdentifier(name: string): boolean {
  return /^[$A-Z_][0-9A-Z_$]*$/i.test(name);
}
