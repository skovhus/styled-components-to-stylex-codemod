import type { API, FileInfo, Options } from "jscodeshift";
import type { Expression, TemplateElement } from "estree";
import { compile } from "stylis";
import type { Element } from "stylis";
import type { Adapter } from "./adapter.js";
import { defaultAdapter } from "./adapter.js";

/**
 * Warning emitted during transformation for unsupported features
 */
export interface TransformWarning {
  type: "unsupported-feature";
  feature: string;
  message: string;
  line?: number;
  column?: number;
}

/**
 * Result of the transform including any warnings
 */
export interface TransformResult {
  code: string | null;
  warnings: TransformWarning[];
}

/**
 * Options for the transform
 */
export interface TransformOptions extends Options {
  /** Adapter for transforming theme values (defaults to cssVariablesAdapter) */
  adapter?: Adapter;
}

/**
 * Transform styled-components to StyleX
 *
 * This is a sample transform that serves as a starting point.
 * You'll need to implement the actual transformation logic based on your needs.
 */
export default function transform(
  file: FileInfo,
  api: API,
  options: TransformOptions,
): string | null {
  const result = transformWithWarnings(file, api, options);

  // Log warnings to console
  for (const warning of result.warnings) {
    const location = warning.line
      ? ` (${file.path}:${warning.line}:${warning.column ?? 0})`
      : ` (${file.path})`;
    console.warn(`[styled-components-to-stylex] Warning${location}: ${warning.message}`);
  }

  return result.code;
}

/**
 * Transform with detailed warnings returned (for testing)
 */
export function transformWithWarnings(
  file: FileInfo,
  api: API,
  options: TransformOptions,
): TransformResult {
  const j = api.jscodeshift;
  const root = j(file.source);
  const warnings: TransformWarning[] = [];
  const adapter: Adapter = options.adapter ?? defaultAdapter;

  const styledImports = root.find(j.ImportDeclaration, {
    source: { value: "styled-components" },
  });

  if (styledImports.length === 0) {
    return { code: null, warnings: [] };
  }

  const styledLocal = getStyledLocalName(styledImports);

  collectWarnings(root, warnings, j);

  const styleEntries: StyleEntry[] = [];

  root
    .find(j.VariableDeclarator, {
      init: { type: "TaggedTemplateExpression" },
    })
    .forEach((path) => {
      if (!styledLocal) return;
      const tagged = path.node.init;
      if (!tagged || tagged.type !== "TaggedTemplateExpression") return;
      const base = resolveStyledTarget(tagged.tag, styledLocal);
      if (!base) return;
      const quasi = tagged.quasi;
      const { css, placeholders } = buildPlaceholderCSS(quasi);
      const parsed = parseStyle(css, placeholders, j, warnings, adapter);
      if (!parsed) return;

      const key = toStyleKey(path.node.id);
      if (!key) return;
      styleEntries.push({
        key,
        properties: parsed,
        base,
        id: path.node.id,
      });

      const component = buildWrapperComponent({ j, base, styleKey: key });
      if (!component) return;
      path.node.init = component;
    });

  if (styleEntries.length === 0) {
    return { code: root.toSource(), warnings };
  }

  injectStylexImport(root, j);

  const program = getProgram(root, j);
  if (!program) {
    return { code: root.toSource(), warnings };
  }

  const stylesDeclaration = buildStylesDeclaration(j, styleEntries);
  program.body.splice(findLastImportIndex(program.body) + 1, 0, stylesDeclaration);

  pruneStyledImports(root, j, styledImports, styledLocal);

  const adapterImports = adapter.getImports?.() ?? [];
  const adapterDecls = adapter.getDeclarations?.() ?? [];
  if (adapterImports.length > 0) {
    const adapterImportNodes = adapterImportToAST(j, adapterImports);
    program.body.splice(0, 0, ...adapterImportNodes);
  }
  if (adapterDecls.length > 0) {
    const declNodes = adapterDecls
      .map((raw) => parseStatement(j, raw))
      .filter(Boolean) as any[];
    program.body.splice(findLastImportIndex(program.body) + 1, 0, ...declNodes);
  }

  return {
    code: root.toSource(),
    warnings,
  };
}

interface StyleEntry {
  key: string;
  properties: Record<string, unknown>;
  base: StyledTarget;
  id: unknown;
}

type StyledTarget =
  | { type: "intrinsic"; name: string }
  | { type: "component"; expression: unknown };

function collectWarnings(
  root: ReturnType<API["jscodeshift"]>,
  warnings: TransformWarning[],
  j: API["jscodeshift"],
): void {
  // createGlobalStyle usage
  root
    .find(j.ImportDeclaration, { source: { value: "styled-components" } })
    .forEach((importPath) => {
      const specifiers = importPath.node.specifiers ?? [];
      for (const specifier of specifiers) {
        if (
          specifier.type === "ImportSpecifier" &&
          specifier.imported.type === "Identifier" &&
          specifier.imported.name === "createGlobalStyle"
        ) {
          const warning: TransformWarning = {
            type: "unsupported-feature",
            feature: "createGlobalStyle",
            message:
              "createGlobalStyle is not supported in StyleX. Global styles should be handled separately (e.g., in a CSS file or using CSS reset libraries).",
          };
          if (specifier.loc) {
            warning.line = specifier.loc.start.line;
            warning.column = specifier.loc.start.column;
          }
          warnings.push(warning);
        }
      }
    });

  let hasComponentSelector = false;
  let hasSpecificityHack = false;

  root.find(j.TemplateLiteral).forEach((p) => {
    const tl = p.node;
    for (const quasi of tl.quasis) {
      if (quasi.value.raw.includes("&&")) {
        hasSpecificityHack = true;
      }
    }

    for (let i = 0; i < tl.expressions.length; i++) {
      const expr = tl.expressions[i];
      const after = tl.quasis[i + 1]?.value.raw ?? "";
      if (expr?.type === "Identifier" && after.includes(":hover &")) {
        hasComponentSelector = true;
      }
    }
  });

  if (hasComponentSelector) {
    warnings.push({
      type: "unsupported-feature",
      feature: "component-selector",
      message:
        "Component selectors like `${OtherComponent}:hover &` are not directly representable in StyleX. Manual refactor is required to preserve relationship/hover semantics.",
    });
  }

  if (hasSpecificityHack) {
    warnings.push({
      type: "unsupported-feature",
      feature: "specificity",
      message:
        "Styled-components specificity hacks like `&&` / `&&&` are not representable in StyleX. The output may not preserve selector specificity and may require manual adjustments.",
    });
  }
}

function getStyledLocalName(
  imports: ReturnType<API["jscodeshift"]>,
): string | null {
  let local: string | null = null;
  imports.forEach((path) => {
    const specifiers = path.node.specifiers ?? [];
    for (const specifier of specifiers) {
      if (specifier.type === "ImportDefaultSpecifier" && specifier.local) {
        local = specifier.local.name;
      }
    }
  });
  return local;
}

function resolveStyledTarget(tag: any, styledName: string): StyledTarget | null {
  if (!tag) return null;
  if (tag.type === "MemberExpression") {
    if (tag.object.type === "Identifier" && tag.object.name === styledName) {
      if (tag.property.type === "Identifier") {
        return { type: "intrinsic", name: tag.property.name };
      }
    }
  }

  if (tag.type === "CallExpression") {
    if (tag.callee.type === "Identifier" && tag.callee.name === styledName) {
      const first = tag.arguments[0];
      if (!first) return null;
      if (first.type === "Literal" && typeof first.value === "string") {
        return { type: "intrinsic", name: first.value };
      }
      return { type: "component", expression: first };
    }
  }

  return null;
}

function buildPlaceholderCSS(
  quasi: any,
): { css: string; placeholders: (Expression | null)[] } {
  const parts: string[] = [];
  const placeholders: (Expression | null)[] = [];
  quasi.quasis.forEach((q: TemplateElement, index: number) => {
    parts.push(q.value.raw);
    const expr = (quasi.expressions[index] as Expression | null | undefined) ?? null;
    if (expr) {
      parts.push(`var(--__stylex_dyn_${index}__)`);
      placeholders.push(expr);
    }
  });
  return { css: parts.join(""), placeholders };
}

function parseStyle(
  css: string,
  placeholders: (Expression | null)[],
  j: API["jscodeshift"],
  warnings: TransformWarning[],
  adapter: Adapter,
): Record<string, unknown> | null {
  const scope = ".__stylex_scope__";
  const ast = compile(`${scope}{${css}}`);
  const properties: Record<string, unknown> = {};

  const processRule = (
    nodes: Element[],
    atRules: string[],
  ) => {
    for (const node of nodes) {
      if (node.type === "rule") {
        const props = Array.isArray(node.props) ? node.props : [];
        const selector = props.find((p) => typeof p === "string" && p.includes(scope));
        if (!selector) continue;
        const selectorTail = selector.replace(scope, "").trim();
        const selectorContexts = selectorTail ? normalizeSelectorTail(selectorTail, warnings) : [];
        const children = (node as any).children ?? [];
        for (const child of children) {
          if (child.type !== "decl") continue;
          const propName = normalizePropertyName(String(child.props));
          if (!propName) continue;
          const rawValue = String(child.children ?? child.value ?? "");
          const value = buildValue(rawValue, placeholders, j, adapter);
          properties[propName] = mergeContextValue(
            properties[propName],
            [...atRules, ...selectorContexts],
            value,
          );
        }
      } else if (node.type === "@media" || node.type === "@supports") {
        const mediaChildren = (node as any).children ?? [];
        const label = `${node.value}`;
        processRule(mediaChildren, [...atRules, label]);
      } else if (node.type === "@keyframes") {
        warnings.push({
          type: "unsupported-feature",
          feature: "keyframes",
          message: "keyframes are not converted yet; manual migration required",
        });
      }
    }
  };

  processRule(ast as Element[], []);
  if (Object.keys(properties).length === 0) return null;
  return properties;
}

function normalizePropertyName(prop: string): string | null {
  if (!prop) return null;
  const mapped: Record<string, string> = {
    background: "backgroundColor",
    "background-color": "backgroundColor",
    "border-radius": "borderRadius",
  };
  if (mapped[prop]) return mapped[prop];
  return prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

function buildValue(
  value: string,
  placeholders: (Expression | null)[],
  j: API["jscodeshift"],
  adapter: Adapter,
): unknown {
  const placeholderRegex = /var\(--__stylex_dyn_(\d+)__\)/g;
  const parts: (string | any)[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null = null;
  while ((match = placeholderRegex.exec(value))) {
    const [full, indexRaw] = match;
    const index = Number.parseInt(indexRaw ?? "", 10);
    if (match.index > lastIndex) {
      parts.push(value.slice(lastIndex, match.index));
    }
    parts.push(normalizeExpressionPlaceholder(placeholders[index] ?? null, adapter, j));
    lastIndex = match.index + full.length;
  }
  if (lastIndex < value.length) {
    parts.push(value.slice(lastIndex));
  }

  if (parts.length === 0) {
    return normalizeLiteralValue(value);
  }
  if (parts.length === 1) {
    const only = parts[0];
    if (typeof only === "string") {
      return normalizeLiteralValue(only);
    }
    return only;
  }

  const quasis: any[] = [];
  const exprs: any[] = [];
  for (const part of parts) {
    if (typeof part === "string") {
      quasis.push(j.templateElement({ cooked: part, raw: part }, false));
    } else {
      exprs.push(part);
      if (quasis.length === exprs.length - 1) {
        quasis.push(j.templateElement({ cooked: "", raw: "" }, false));
      }
    }
  }
  if (quasis.length === exprs.length) {
    quasis.push(j.templateElement({ cooked: "", raw: "" }, true));
  } else if (quasis.length > 0) {
    quasis[quasis.length - 1]!.tail = true;
  }
  return j.templateLiteral(quasis, exprs);
}

function normalizeLiteralValue(value: string): string | number {
  const trimmed = value.trim();
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
    return Number.parseFloat(trimmed);
  }
  return trimmed;
}

function normalizeExpressionPlaceholder(
  expr: Expression | null,
  adapter: Adapter,
  j: API["jscodeshift"],
): any {
  if (!expr) return expr;
  const path = expressionToPath(expr);
  if (!path) return expr;

  const adapterValue = adapter.transformValue({
    path,
    valueType: "theme",
  });
  const literalMatch = adapterValue.match(/^['"](.*)['"]$/);
  if (literalMatch) {
    return j.literal(literalMatch[1] ?? "");
  }
  const stmt = j.template.statement`const __stylex_val = ${adapterValue};`();
  if (stmt && stmt.type === "VariableDeclaration") {
    const decl = stmt.declarations?.[0];
    if (decl && decl.type === "VariableDeclarator") {
      return decl.init as any;
    }
  }
  return j.literal(adapterValue);
}

function expressionToPath(expr: Expression): string | null {
  if (expr.type === "MemberExpression" && !expr.computed) {
    const parts: string[] = [];
    let current: any = expr;
    while (current?.type === "MemberExpression" && !current.computed) {
      const property = current.property;
      if (property.type === "Identifier") {
        parts.unshift(property.name);
      }
      current = current.object;
    }
    if (current?.type === "Identifier" && current.name === "theme") {
      return parts.join(".");
    }
    if (
      current?.type === "MemberExpression" &&
      current.object.type === "Identifier" &&
      current.object.name === "props" &&
      current.property.type === "Identifier" &&
      current.property.name === "theme"
    ) {
      return parts.join(".");
    }
  }
  if (expr.type === "ArrowFunctionExpression") {
    const body = expr.body as Expression;
    const path = body && expressionToPath(body as Expression);
    if (path) return path;
  }
  return null;
}

function normalizeSelectorTail(selectorTail: string, _warnings: TransformWarning[]): string[] {
  if (!selectorTail) return [];
  if (selectorTail.startsWith(":")) {
    return [selectorTail];
  }
  return [];
}

function mergeContextValue(
  current: unknown,
  contexts: string[],
  value: unknown,
): unknown {
  if (contexts.length === 0) return value;
  const [head, ...rest] = contexts as [string, ...string[]];
  const existing: Record<string, unknown> =
    current && typeof current === "object" && !Array.isArray(current)
      ? (current as Record<string, unknown>)
      : { default: current ?? null };

  const nextValue = mergeContextValue(existing[head], rest, value);
  existing[head] = nextValue;
  if (!("default" in existing)) {
    existing.default = null;
  }
  return existing;
}

function toStyleKey(id: unknown): string | null {
  if (!id || typeof id !== "object") return null;
  if ((id as any).type === "Identifier") {
    const name = (id as any).name as string;
    return name.charAt(0).toLowerCase() + name.slice(1);
  }
  return null;
}

function buildWrapperComponent({
  j,
  base,
  styleKey,
}: {
  j: API["jscodeshift"];
  base: StyledTarget;
  styleKey: string;
}) {
  const jsxName = styledTargetToJSX(base, j);
  if (!jsxName) return null;

  const styleSpread = j.jsxSpreadAttribute(
    j.callExpression(j.memberExpression(j.identifier("stylex"), j.identifier("props")), [
      j.memberExpression(j.identifier("styles"), j.identifier(styleKey)),
    ]),
  );
  const propsSpread = j.jsxSpreadAttribute(j.identifier("props"));

  const opening = j.jsxOpeningElement(jsxName, [styleSpread, propsSpread]);
  const closing = j.jsxClosingElement(jsxName);
  const children = [
    j.jsxExpressionContainer(
      j.memberExpression(j.identifier("props"), j.identifier("children")),
    ),
  ];

  const element = j.jsxElement(opening, closing, children);
  return j.arrowFunctionExpression([j.identifier("props")], element);
}

function styledTargetToJSX(target: StyledTarget, j: API["jscodeshift"]): any {
  if (target.type === "intrinsic") {
    return j.jsxIdentifier(target.name);
  }
  const expr = target.expression as any;
  if (expr.type === "Identifier") {
    return j.jsxIdentifier(expr.name);
  }
  if (expr.type === "MemberExpression") {
    const object = expressionToJSX(expr.object, j);
    const property = expressionToJSX(expr.property, j);
    if (object && property) {
      return j.jsxMemberExpression(object, property);
    }
  }
  return null;
}

function expressionToJSX(expr: any, j: API["jscodeshift"]): any {
  if (expr.type === "Identifier") {
    return j.jsxIdentifier(expr.name);
  }
  if (expr.type === "MemberExpression") {
    const object = expressionToJSX(expr.object, j);
    const property = expressionToJSX(expr.property, j);
    if (object && property) {
      return j.jsxMemberExpression(object, property);
    }
  }
  return null;
}

function injectStylexImport(root: ReturnType<API["jscodeshift"]>, j: API["jscodeshift"]): void {
  const hasImport = root
    .find(j.ImportDeclaration, { source: { value: "@stylexjs/stylex" } })
    .size() > 0;
  if (hasImport) return;
  const stylexImport = j.importDeclaration(
    [j.importNamespaceSpecifier(j.identifier("stylex"))],
    j.literal("@stylexjs/stylex"),
  );
  const program = getProgram(root, j);
  if (!program) return;
  program.body.splice(findLastImportIndex(program.body) + 1, 0, stylexImport);
}

function pruneStyledImports(
  root: ReturnType<API["jscodeshift"]>,
  j: API["jscodeshift"],
  styledImports: ReturnType<API["jscodeshift"]>,
  styledLocal: string | null,
): void {
  const styledStillUsed = styledLocal
    ? root
        .find(j.Identifier, { name: styledLocal })
        .filter((p) => {
          const parent = p.parentPath?.node;
          return parent?.type !== "ImportDefaultSpecifier" && parent?.type !== "ImportSpecifier";
        })
        .size() > 0
    : false;

  styledImports.forEach((path) => {
    const specifiers = path.node.specifiers ?? [];
    const remaining = specifiers.filter((spec: any) => {
      if (spec.type === "ImportDefaultSpecifier" && spec.local?.name === styledLocal) {
        return styledStillUsed;
      }
      return true;
    });

    if (remaining.length === 0) {
      path.prune();
    } else {
      path.node.specifiers = remaining;
    }
  });
}

function getProgram(
  root: ReturnType<API["jscodeshift"]>,
  j: API["jscodeshift"],
): { body: any[] } | null {
  const programPath = root.find(j.Program).paths?.()[0];
  if (programPath?.node && Array.isArray((programPath.node as any).body)) {
    return programPath.node as any;
  }
  return null;
}

function adapterImportToAST(j: API["jscodeshift"], adapterImports: string[]): any[] {
  return adapterImports.map((raw) => parseStatement(j, raw)).filter(Boolean) as any[];
}

function parseStatement(j: API["jscodeshift"], raw: string): any | null {
  const parsed = j(raw);
  const body = (parsed.nodes?.()[0] as any)?.program?.body ?? (parsed.nodes?.()[0] as any)?.body;
  if (Array.isArray(body) && body[0]) {
    return body[0] as any;
  }
  return null;
}

function buildStylesDeclaration(j: API["jscodeshift"], entries: StyleEntry[]) {
  const properties = entries.map((entry) =>
    j.objectProperty(j.identifier(entry.key), objectFromRecord(j, entry.properties)),
  );
  return j.variableDeclaration("const", [
    j.variableDeclarator(
      j.identifier("styles"),
      j.callExpression(j.memberExpression(j.identifier("stylex"), j.identifier("create")), [
        j.objectExpression(properties),
      ]),
    ),
  ]);
}

function objectFromRecord(j: API["jscodeshift"], record: Record<string, unknown>): any {
  const props: any[] = [];
  for (const [key, value] of Object.entries(record)) {
    const propertyKey = /^(?:[A-Za-z_$][\w$]*)$/.test(key)
      ? j.identifier(key)
      : j.literal(key);
    props.push(j.objectProperty(propertyKey as any, valueToAST(j, value)));
  }
  return j.objectExpression(props);
}

function valueToAST(j: API["jscodeshift"], value: unknown): any {
  if (value && typeof value === "object" && (value as any).type) {
    return value as any;
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return objectFromRecord(j, value as Record<string, unknown>);
  }
  if (typeof value === "number") {
    return j.literal(value);
  }
  if (typeof value === "string") {
    return j.literal(value);
  }
  if (value === null) {
    return j.literal(null);
  }
  return j.literal(String(value));
}

function findLastImportIndex(body: any[]): number {
  let index = -1;
  body.forEach((node, i) => {
    if (node.type === "ImportDeclaration") {
      index = i;
    }
  });
  return index;
}

// Re-export adapter types for convenience
export type { Adapter, AdapterContext } from "./adapter.js";
export { defaultAdapter } from "./adapter.js";
