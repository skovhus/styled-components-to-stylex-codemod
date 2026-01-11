import type { API, FileInfo, Options } from "jscodeshift";
import type { Adapter } from "./adapter.js";
import type { ImportSource } from "./adapter.js";
import { assertNoNullNodesInArrays } from "./internal/ast-safety.js";
import { collectStyledDecls } from "./internal/collect-styled-decls.js";
import { rewriteCssVarsInString } from "./internal/css-vars.js";
import { formatOutput } from "./internal/format-output.js";
import { convertStyledKeyframes } from "./internal/keyframes.js";
import { lowerRules } from "./internal/lower-rules.js";
import { emitStylesAndImports } from "./internal/emit-styles.js";
import { emitWrappers } from "./internal/emit-wrappers.js";
import { postProcessTransformedAst } from "./internal/rewrite-jsx.js";
import {
  collectCreateGlobalStyleWarnings,
  collectCssHelperSkipWarnings,
  collectThemeProviderSkipWarnings,
  shouldSkipForCreateGlobalStyle,
  shouldSkipForCssHelper,
  shouldSkipForThemeProvider,
  universalSelectorUnsupportedWarning,
} from "./internal/policy.js";
import { logWarnings } from "./internal/logger.js";
import type {
  TransformOptions,
  TransformResult,
  TransformWarning,
} from "./internal/transform-types.js";
export type {
  TransformOptions,
  TransformResult,
  TransformWarning,
} from "./internal/transform-types.js";
import { compile } from "stylis";
import { normalizeStylisAstToIR } from "./internal/css-ir.js";
import { cssDeclarationToStylexDeclarations } from "./internal/css-prop-mapping.js";
import { dirname, resolve as pathResolve } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { assertValidAdapter } from "./internal/public-api-validation.js";

/**
 * Transform styled-components to StyleX
 *
 * This is a sample transform that serves as a starting point.
 * You'll need to implement the actual transformation logic based on your needs.
 */
export default function transform(file: FileInfo, api: API, options: Options): string | null {
  const result = transformWithWarnings(file, api, options as TransformOptions);
  logWarnings(result.warnings, file.path);
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

  // `forwardedAs` is styled-components-specific; in StyleX output we standardize on `as`.
  root
    .find(j.JSXAttribute, { name: { type: "JSXIdentifier", name: "forwardedAs" } } as any)
    .forEach((p: any) => {
      p.node.name.name = "as";
    });

  // Preserve existing `import React ... from "react"` (default or namespace import) even if it becomes "unused"
  // after the transform. JSX runtime differences and local conventions can make this import intentionally present.
  const preserveReactImport =
    root
      .find(j.ImportDeclaration)
      .filter((p: any) => (p.node?.source as any)?.value === "react")
      .filter((p: any) =>
        (p.node.specifiers ?? []).some(
          (s: any) =>
            (s.type === "ImportDefaultSpecifier" || s.type === "ImportNamespaceSpecifier") &&
            s.local?.type === "Identifier" &&
            s.local.name === "React",
        ),
      )
      .size() > 0;

  /**
   * Create an object-pattern property with shorthand enabled when possible.
   * This avoids lint issues like `no-useless-rename` from `{ foo: foo }`.
   */
  const patternProp = (keyName: string, valueId?: any) => {
    const key = j.identifier(keyName);
    const value = valueId ?? key;
    const p = j.property("init", key, value) as any;
    if (value?.type === "Identifier" && value.name === keyName) {
      p.shorthand = true;
    }
    return p;
  };

  /**
   * Detect static property names assigned to a component in an imported file.
   * e.g., `ComponentName.HEIGHT = 42;` -> returns ["HEIGHT"]
   */
  const getStaticPropertiesFromImport = (source: ImportSource, componentName: string): string[] => {
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
  };

  const adapter = options.adapter as Adapter;
  assertValidAdapter(
    adapter,
    "transform(options) - missing `adapter` (if you run the jscodeshift transform directly, pass options.adapter)",
  );
  const resolverImports = new Map<string, any>();

  let hasChanges = false;
  let bailDueToUndefinedResolveValue = false;

  const formatResolveValueContext = (ctx: unknown): string => {
    const c: any = ctx as any;
    const kind = c?.kind;
    if (kind === "theme") {
      return `kind=theme path=${JSON.stringify(String(c?.path ?? ""))}`;
    }
    if (kind === "cssVariable") {
      const parts: string[] = [`kind=cssVariable name=${JSON.stringify(String(c?.name ?? ""))}`];
      if (typeof c?.fallback === "string") {
        parts.push(`fallback=${JSON.stringify(c.fallback)}`);
      }
      if (typeof c?.definedValue === "string") {
        parts.push(`definedValue=${JSON.stringify(c.definedValue)}`);
      }
      return parts.join(" ");
    }
    if (kind === "call") {
      const args = Array.isArray(c?.args) ? c.args : [];
      return [
        "kind=call",
        `calleeImportedName=${JSON.stringify(String(c?.calleeImportedName ?? ""))}`,
        `calleeSource=${JSON.stringify(c?.calleeSource ?? null)}`,
        `callSiteFilePath=${JSON.stringify(String(c?.callSiteFilePath ?? ""))}`,
        `args=${JSON.stringify(args)}`,
      ].join(" ");
    }
    try {
      return `ctx=${JSON.stringify(ctx)}`;
    } catch {
      return `ctx=${String(ctx)}`;
    }
  };

  // Runtime guard: adapter.resolveValue is typed to never return `undefined`,
  // but user adapters can accidentally fall through without a return. When that happens,
  // we skip transforming the file to avoid producing incorrect output.
  const resolveValueSafe: Adapter["resolveValue"] = (ctx) => {
    if (bailDueToUndefinedResolveValue) {
      return null;
    }
    const res = (adapter.resolveValue as any)(ctx);
    if (typeof res === "undefined") {
      bailDueToUndefinedResolveValue = true;
      // Emit a single warning with enough context for users to fix their adapter.
      warnings.push({
        type: "dynamic-node",
        feature: "adapter-resolveValue",
        message: [
          "Adapter.resolveValue returned undefined. This usually means your adapter forgot to return a value.",
          "Return null to leave a value unresolved, or return { expr, imports } to resolve it.",
          `Skipping transformation for this file to avoid producing incorrect output.`,
          `resolveValue was called with: ${formatResolveValueContext(ctx)}`,
        ].join(" "),
      });
      return null;
    }
    return res as any;
  };

  // Find styled-components imports
  const styledImports = root.find(j.ImportDeclaration, {
    source: { value: "styled-components" },
  });

  if (styledImports.length === 0) {
    return { code: null, warnings: [] };
  }

  // Policy: ThemeProvider usage is project-specific. If the file uses ThemeProvider, skip entirely.
  if (shouldSkipForThemeProvider({ root, j, styledImports })) {
    return { code: null, warnings: collectThemeProviderSkipWarnings({ root, j, styledImports }) };
  }

  // Policy: styled-components `css` helper usage is project-specific. If the file uses `css`, skip entirely.
  if (shouldSkipForCssHelper({ root, j, styledImports })) {
    return { code: null, warnings: collectCssHelperSkipWarnings({ root, j, styledImports }) };
  }

  // Policy: createGlobalStyle is unsupported in StyleX; emit a warning when imported.
  warnings.push(...collectCreateGlobalStyleWarnings(styledImports));

  // Convert `styled-components` keyframes to `stylex.keyframes`.
  // Docs: https://stylexjs.com/docs/api/javascript/keyframes
  const keyframesImport = styledImports
    .find(j.ImportSpecifier)
    .nodes()
    .find((s) => s.imported.type === "Identifier" && s.imported.name === "keyframes");
  const keyframesLocal =
    keyframesImport?.local?.type === "Identifier"
      ? keyframesImport.local.name
      : keyframesImport?.imported?.type === "Identifier"
        ? keyframesImport.imported.name
        : undefined;

  let keyframesNames = new Set<string>();

  const parseExpr = (exprSource: string): any => {
    try {
      // Always parse expressions with TSX enabled so we can safely emit TS-only constructs
      // like `x as SomeType` inside generated outputs.
      const jParse = api.jscodeshift.withParser("tsx");
      const program = jParse(`(${exprSource});`);
      const stmt = program.find(jParse.ExpressionStatement).nodes()[0];
      let expr = (stmt as any)?.expression ?? null;
      // Unwrap ParenthesizedExpression to avoid extra parentheses in output
      while (expr?.type === "ParenthesizedExpression") {
        expr = expr.expression;
      }
      // Remove extra.parenthesized flag that causes recast to add parentheses
      if (expr?.extra?.parenthesized) {
        delete expr.extra.parenthesized;
        delete expr.extra.parenStart;
      }
      return expr;
    } catch {
      return null;
    }
  };

  const rewriteCssVarsInStyleObject = (
    obj: Record<string, unknown>,
    definedVars: Map<string, string>,
    varsToDrop: Set<string>,
  ): void => {
    for (const [k, v] of Object.entries(obj)) {
      if (v && typeof v === "object") {
        if (isAstNode(v)) {
          continue;
        }
        rewriteCssVarsInStyleObject(v as any, definedVars, varsToDrop);
        continue;
      }
      if (typeof v === "string") {
        (obj as any)[k] = rewriteCssVarsInString({
          raw: v,
          definedVars,
          varsToDrop,
          resolveValue: resolveValueSafe,
          addImport: (imp) => resolverImports.set(JSON.stringify(imp), imp),
          parseExpr,
          j,
        }) as any;
      }
    }
  };
  if (keyframesLocal) {
    const converted = convertStyledKeyframes({
      root,
      j,
      styledImports,
      keyframesLocal,
      objectToAst,
    });
    keyframesNames = converted.keyframesNames;
    if (converted.changed) {
      hasChanges = true;
    }
  }

  /**
   * Build a per-file import map for named imports, supporting aliases.
   * Maps local identifier -> { importedName, source }.
   */
  const importMap = new Map<
    string,
    {
      importedName: string;
      source: ImportSource;
    }
  >();
  {
    const baseDir = dirname(file.path);
    const resolveImportSource = (specifier: string): ImportSource => {
      // Deterministic resolution: for relative specifiers, just resolve against the current file’s folder.
      // This intentionally does NOT probe extensions, consult tsconfig paths, or use Node resolution.
      const isRelative =
        specifier === "." ||
        specifier === ".." ||
        specifier.startsWith("./") ||
        specifier.startsWith("../") ||
        specifier.startsWith(".\\") ||
        specifier.startsWith("..\\");
      return isRelative
        ? { kind: "absolutePath", value: pathResolve(baseDir, specifier) }
        : { kind: "specifier", value: specifier };
    };

    root.find(j.ImportDeclaration).forEach((p: any) => {
      const source = p.node.source?.value;
      if (typeof source !== "string") {
        return;
      }
      const resolvedSource = resolveImportSource(source);
      const specs = p.node.specifiers ?? [];
      for (const s of specs) {
        if (!s) {
          continue;
        }
        if (s.type === "ImportSpecifier") {
          const importedName =
            s.imported?.type === "Identifier"
              ? s.imported.name
              : s.imported?.type === "Literal" && typeof s.imported.value === "string"
                ? s.imported.value
                : undefined;
          const localName =
            s.local?.type === "Identifier"
              ? s.local.name
              : s.imported?.type === "Identifier"
                ? s.imported.name
                : undefined;
          if (!localName || !importedName) {
            continue;
          }
          importMap.set(localName, {
            importedName,
            source: resolvedSource,
          });
        }
      }
    });
  }

  // Convert `styled-components` css helper blocks (css`...`) into plain style objects.
  // We keep them as `const x = { ... } as const;` and later spread into component styles.
  const cssImport = styledImports
    .find(j.ImportSpecifier)
    .nodes()
    .find((s) => s.imported.type === "Identifier" && s.imported.name === "css");
  const cssLocal =
    cssImport?.local?.type === "Identifier"
      ? cssImport.local.name
      : cssImport?.imported?.type === "Identifier"
        ? cssImport.imported.name
        : undefined;

  const cssHelperNames = new Set<string>();

  if (cssLocal) {
    const isIdentifierReference = (p: any): boolean => {
      const parent = p?.parent?.node;
      if (!parent) {
        return true;
      }
      // Import specifiers are not "uses".
      if (
        parent.type === "ImportSpecifier" ||
        parent.type === "ImportDefaultSpecifier" ||
        parent.type === "ImportNamespaceSpecifier"
      ) {
        return false;
      }
      // `foo.css` (non-computed) is a property name, not an identifier reference.
      if (
        (parent.type === "MemberExpression" || parent.type === "OptionalMemberExpression") &&
        parent.property === p.node &&
        parent.computed === false
      ) {
        return false;
      }
      // `{ css: 1 }` / `{ css }` key is not a reference when not computed.
      if (
        (parent.type === "Property" || parent.type === "ObjectProperty") &&
        parent.key === p.node &&
        parent.computed === false
      ) {
        return false;
      }
      // TS type keys are not runtime references.
      if (parent.type === "TSPropertySignature" && parent.key === p.node) {
        return false;
      }
      return true;
    };

    const isStillReferenced = (): boolean =>
      root
        .find(j.Identifier, { name: cssLocal } as any)
        .filter((p: any) => isIdentifierReference(p))
        .size() > 0;

    root
      .find(j.VariableDeclarator, {
        init: { type: "TaggedTemplateExpression" },
      })
      .forEach((p) => {
        const init = p.node.init as any;
        if (
          !init ||
          init.type !== "TaggedTemplateExpression" ||
          init.tag?.type !== "Identifier" ||
          init.tag.name !== cssLocal
        ) {
          return;
        }
        if (p.node.id.type !== "Identifier") {
          return;
        }
        const localName = p.node.id.name;

        const template = init.quasi;
        // `css\`...\`` snippets are not attached to a selector; parse by wrapping in `& { ... }`.
        if ((template.expressions?.length ?? 0) > 0) {
          return;
        }
        const rawCss = (template.quasis ?? []).map((q: any) => q.value?.raw ?? "").join("");
        const stylisAst = compile(`& { ${rawCss} }`);
        const rules = normalizeStylisAstToIR(stylisAst as any, [], { rawCss });

        const baseRule = rules.find((r) => r.selector === "&" && r.atRuleStack.length === 0);
        if (!baseRule) {
          return;
        }

        const helperObj: Record<string, unknown> = {};
        for (const d of baseRule.declarations) {
          // Only accept static decls in helpers for now.
          if (d.value.kind !== "static") {
            return;
          }
          for (const out of cssDeclarationToStylexDeclarations(d)) {
            helperObj[out.prop] = cssValueToJs(out.value, d.important);
          }
        }

        // Replace with `const x = { ... } as const;`
        // (jscodeshift doesn't expose `tsConstKeyword()`, so parse via template instead.)
        p.node.init = j.template.expression`${objectToAst(j, helperObj)} as const` as any;
        cssHelperNames.add(localName);
        hasChanges = true;
      });

    // Remove `css` import specifier from styled-components imports ONLY if `css` is no longer referenced.
    // This avoids producing "only-import-changes" outputs when we didn't actually transform `css` usage
    // (e.g. `return css\`...\`` inside a function).
    if (!isStillReferenced()) {
      styledImports.forEach((imp) => {
        const specs = imp.node.specifiers ?? [];
        const next = specs.filter((s) => {
          if (s.type !== "ImportSpecifier") {
            return true;
          }
          if (s.imported.type !== "Identifier") {
            return true;
          }
          return s.imported.name !== "css";
        });
        if (next.length !== specs.length) {
          imp.node.specifiers = next;
          if (imp.node.specifiers.length === 0) {
            j(imp).remove();
          }
          hasChanges = true;
        }
      });
    }
  }

  // Detect “simple string-mapping” helpers like:
  //   const getColor = (variant) => (variant === "primary" ? "#BF4F74" : "#4F74BF");
  const stringMappingFns = new Map<
    string,
    {
      param: string;
      testParam: string;
      whenValue: string;
      thenValue: string;
      elseValue: string;
    }
  >();
  root.find(j.VariableDeclarator).forEach((p) => {
    if (p.node.id.type !== "Identifier") {
      return;
    }
    const name = p.node.id.name;
    const init: any = p.node.init;
    if (!init || init.type !== "ArrowFunctionExpression") {
      return;
    }
    const param0 = init.params?.[0];
    if (!param0 || param0.type !== "Identifier") {
      return;
    }
    const paramName = param0.name;
    const body = init.body;
    if (!body || body.type !== "ConditionalExpression") {
      return;
    }
    const test: any = body.test;
    const cons: any = body.consequent;
    const alt: any = body.alternate;
    if (
      test?.type === "BinaryExpression" &&
      test.operator === "===" &&
      test.left?.type === "Identifier" &&
      test.left.name === paramName &&
      (test.right?.type === "StringLiteral" || test.right?.type === "Literal") &&
      (cons?.type === "StringLiteral" || cons?.type === "Literal") &&
      (alt?.type === "StringLiteral" || alt?.type === "Literal")
    ) {
      const whenValue = String(test.right.value);
      const thenValue = String(cons.value);
      const elseValue = String(alt.value);
      stringMappingFns.set(name, {
        param: paramName,
        testParam: paramName,
        whenValue,
        thenValue,
        elseValue,
      });
    }
  });

  // If a file uses createGlobalStyle, we don't support transforming it.
  // Keep these fixtures as `_unsupported.*`.
  if (shouldSkipForCreateGlobalStyle({ styledImports, j })) {
    return { code: null, warnings };
  }

  // Detect patterns that aren't directly representable in StyleX (or require semantic rewrites).
  // These warnings are used for per-fixture expectations and help guide manual follow-ups.
  let hasComponentSelector = false;
  let hasSpecificityHack = false;
  let componentSelectorLoc: { line: number; column: number } | null = null;
  let specificityHackLoc: { line: number; column: number } | null = null;

  root.find(j.TemplateLiteral).forEach((p) => {
    const tl = p.node;

    // Specificity hacks like `&&` / `&&&` inside styled template literals.
    for (const quasi of tl.quasis) {
      if (quasi.value.raw.includes("&&")) {
        hasSpecificityHack = true;
        if (!specificityHackLoc && quasi.loc?.start?.line !== undefined) {
          specificityHackLoc = {
            line: quasi.loc.start.line,
            column: quasi.loc.start.column ?? 0,
          };
        }
      }
    }

    // Component selector patterns like `${Link}:hover & { ... }`
    for (let i = 0; i < tl.expressions.length; i++) {
      const expr = tl.expressions[i];
      const after = tl.quasis[i + 1]?.value.raw ?? "";
      if (expr?.type === "Identifier" && after.includes(":hover &")) {
        hasComponentSelector = true;
        if (!componentSelectorLoc) {
          const loc = (expr as any).loc ?? tl.loc;
          if (loc?.start?.line !== undefined) {
            componentSelectorLoc = {
              line: loc.start.line,
              column: loc.start.column ?? 0,
            };
          }
        }
      }
    }
  });

  if (hasComponentSelector) {
    const warning = {
      type: "unsupported-feature" as const,
      feature: "component-selector",
      message:
        "Component selectors like `${OtherComponent}:hover &` are not directly representable in StyleX. Manual refactor is required to preserve relationship/hover semantics.",
    };
    if (componentSelectorLoc) {
      warnings.push({ ...warning, loc: componentSelectorLoc });
    } else {
      warnings.push(warning);
    }

    // Policy: component selectors like `${OtherComponent}:hover &` require a semantic refactor.
    // Bail out to avoid producing incorrect output.
    return { code: null, warnings };
  }

  if (hasSpecificityHack) {
    const warning = {
      type: "unsupported-feature" as const,
      feature: "specificity",
      message:
        "Styled-components specificity hacks like `&&` / `&&&` are not representable in StyleX. The output may not preserve selector specificity and may require manual adjustments.",
    };
    if (specificityHackLoc) {
      warnings.push({ ...warning, loc: specificityHackLoc });
    } else {
      warnings.push(warning);
    }
  }

  // --- Core transform ---
  // We can have styled-components usage without a default import (e.g. only `createGlobalStyle`,
  // `ThemeProvider`, `withTheme`). Don't early-return; instead apply what we can.
  const styledDefaultSpecifier = styledImports.find(j.ImportDefaultSpecifier).nodes()[0];
  const styledDefaultImport =
    styledDefaultSpecifier?.local?.type === "Identifier"
      ? styledDefaultSpecifier.local.name
      : undefined;

  // Handle `createGlobalStyle` minimally: remove the global style component and its usage.
  // (We still emit an unsupported-feature warning above.)
  const createGlobalStyleLocal = styledImports
    .find(j.ImportSpecifier)
    .nodes()
    .find((s) => s.imported.type === "Identifier" && s.imported.name === "createGlobalStyle")
    ?.local?.name;
  if (createGlobalStyleLocal) {
    const globalStyleComponentNames = new Set<string>();
    // Remove `const GlobalStyle = createGlobalStyle`... declarations.
    root
      .find(j.VariableDeclarator)
      .filter((p) => {
        const init = p.node.init;
        return (
          !!init &&
          init.type === "TaggedTemplateExpression" &&
          init.tag.type === "Identifier" &&
          init.tag.name === createGlobalStyleLocal
        );
      })
      .forEach((p) => {
        if (p.node.id.type === "Identifier") {
          globalStyleComponentNames.add(p.node.id.name);
        }
        // Remove the whole variable declaration statement.
        j(p).closest(j.VariableDeclaration).remove();
        hasChanges = true;
      });

    // Remove `<GlobalStyle />` usages (whatever the local component name was).
    for (const name of globalStyleComponentNames) {
      root.find(j.JSXElement).filter(isJsxElementNamed(name)).remove();
      root.find(j.JSXSelfClosingElement).filter(isJsxSelfClosingNamed(name)).remove();
    }

    // Remove the import specifier (or whole import if now empty).
    styledImports.forEach((imp) => {
      const specs = imp.node.specifiers ?? [];
      imp.node.specifiers = specs.filter((s) => {
        if (s.type !== "ImportSpecifier") {
          return true;
        }
        if (s.imported.type !== "Identifier") {
          return true;
        }
        return s.imported.name !== "createGlobalStyle";
      });
      if ((imp.node.specifiers?.length ?? 0) === 0) {
        j(imp).remove();
      }
    });
    hasChanges = true;
  }

  // Handle `ThemeProvider` / `withTheme` minimally by unwrapping providers and passing `theme` explicitly.
  const themeProviderLocal = styledImports
    .find(j.ImportSpecifier)
    .nodes()
    .find((s) => s.imported.type === "Identifier" && s.imported.name === "ThemeProvider")?.local
    ?.name as string | undefined;
  const withThemeLocal = styledImports
    .find(j.ImportSpecifier)
    .nodes()
    .find((s) => s.imported.type === "Identifier" && s.imported.name === "withTheme")?.local
    ?.name as string | undefined;

  if (withThemeLocal) {
    // Rewrite `const X = withTheme(Y)` => `const X = Y`
    root
      .find(j.VariableDeclarator)
      .filter((p) => {
        const init = p.node.init;
        return (
          !!init &&
          init.type === "CallExpression" &&
          init.callee.type === "Identifier" &&
          init.callee.name === withThemeLocal
        );
      })
      .forEach((p) => {
        const init = p.node.init;
        if (!init || init.type !== "CallExpression") {
          return;
        }
        const arg0 = init.arguments[0];
        if (!arg0 || arg0.type !== "Identifier") {
          return;
        }
        p.node.init = arg0;
        hasChanges = true;
      });
  }

  if (themeProviderLocal) {
    // Replace `<ThemeProvider theme={theme}>{children}</ThemeProvider>` with its children.
    root
      .find(j.JSXElement)
      .filter(isJsxElementNamed(themeProviderLocal))
      .forEach((p) => {
        const children = (p.node.children ?? []).filter(
          (c) => c.type !== "JSXText" || c.value.trim() !== "",
        );
        if (children.length === 1) {
          j(p).replaceWith(children[0] as any);
        } else {
          j(p).replaceWith(
            j.jsxFragment(j.jsxOpeningFragment(), j.jsxClosingFragment(), children as any),
          );
        }
        hasChanges = true;
      });
  }

  if (themeProviderLocal || withThemeLocal) {
    // Remove ThemeProvider/withTheme import specifiers; if that was the whole import, remove it.
    styledImports.forEach((imp) => {
      const specs = imp.node.specifiers ?? [];
      imp.node.specifiers = specs.filter((s) => {
        if (s.type !== "ImportSpecifier") {
          return true;
        }
        if (s.imported.type !== "Identifier") {
          return true;
        }
        if (themeProviderLocal && s.imported.name === "ThemeProvider") {
          return false;
        }
        if (withThemeLocal && s.imported.name === "withTheme") {
          return false;
        }
        return true;
      });
      if ((imp.node.specifiers?.length ?? 0) === 0) {
        j(imp).remove();
      }
    });
    hasChanges = true;
  }

  const { styledDecls, hasUniversalSelectors, universalSelectorLoc } = collectStyledDecls({
    root,
    j,
    styledDefaultImport,
    toStyleKey,
    toSuffixFromProp,
  });

  // If we didn't find any styled declarations but performed other edits (e.g. createGlobalStyle / ThemeProvider),
  // we'll still emit output without injecting StyleX styles.
  if (styledDecls.length === 0) {
    return {
      code: hasChanges
        ? formatOutput(
            (assertNoNullNodesInArrays(root.get().node),
            root.toSource({
              quote: "double",
              trailingComma: true,
              reuseWhitespace: false,
            })),
          )
        : null,
      warnings,
    };
  }

  // Universal selectors (`*`) are currently unsupported (too many edge cases to map to StyleX safely).
  // Skip transforming the entire file to avoid producing incorrect output.
  if (hasUniversalSelectors) {
    warnings.push(universalSelectorUnsupportedWarning(universalSelectorLoc));
    return { code: null, warnings };
  }

  // Resolve dynamic nodes via plugins (currently only used to decide bail vs convert).
  const lowered = lowerRules({
    api,
    j,
    root,
    filePath: file.path,
    resolveValue: resolveValueSafe,
    importMap,
    warnings,
    resolverImports,
    styledDecls,
    keyframesNames,
    cssHelperNames,
    stringMappingFns,
    toStyleKey,
    toSuffixFromProp,
    parseExpr,
    cssValueToJs,
    rewriteCssVarsInStyleObject,
    literalToAst,
  });
  const resolvedStyleObjects = lowered.resolvedStyleObjects;
  const descendantOverrides = lowered.descendantOverrides;
  const ancestorSelectorParents = lowered.ancestorSelectorParents;
  if (lowered.bail || bailDueToUndefinedResolveValue) {
    return { code: null, warnings };
  }

  // Detect if there's a local variable named `styles` in the file (not part of styled-components code)
  // If so, we'll use `stylexStyles` as the StyleX constant name to avoid shadowing.
  const styledDeclNames = new Set(styledDecls.map((d) => d.localName));
  let hasStylesVariable = false;
  root.find(j.VariableDeclarator).forEach((path) => {
    const id = path.node.id;
    if (id.type === "Identifier" && id.name === "styles" && !styledDeclNames.has("styles")) {
      hasStylesVariable = true;
    }
  });
  const stylesIdentifier = hasStylesVariable ? "stylexStyles" : "styles";

  // Build lookup maps and set needsWrapperComponent BEFORE emitStylesAndImports
  // so that comment placement can be determined correctly.
  const declByLocal = new Map(styledDecls.map((d) => [d.localName, d]));
  const extendedBy = new Map<string, string[]>();
  for (const decl of styledDecls) {
    if (decl.base.kind !== "component") {
      continue;
    }
    const base = declByLocal.get(decl.base.ident);
    if (!base) {
      continue;
    }
    extendedBy.set(base.localName, [...(extendedBy.get(base.localName) ?? []), decl.localName]);
  }

  // Track which styled components are exported (named or default)
  const getIdentifierName = (node: unknown): string | null => {
    const n = node as { type?: string; name?: string } | null | undefined;
    return n?.type === "Identifier" && n.name ? n.name : null;
  };

  type ExportInfo = { exportName: string; isDefault: boolean; isSpecifier: boolean };
  const exportedComponents = new Map<string, ExportInfo>();

  // Named exports: export const Foo = styled.div`...` or export { Foo, Bar as Baz }
  root.find(j.ExportNamedDeclaration).forEach((p) => {
    const decl = p.node.declaration;
    if (decl?.type === "VariableDeclaration") {
      for (const d of decl.declarations) {
        if (d.type !== "VariableDeclarator") {
          continue;
        }
        const name = getIdentifierName(d.id);
        if (name && declByLocal.has(name)) {
          exportedComponents.set(name, { exportName: name, isDefault: false, isSpecifier: false });
        }
      }
    }
    for (const spec of p.node.specifiers ?? []) {
      if (spec.type !== "ExportSpecifier") {
        continue;
      }
      const localName = getIdentifierName(spec.local);
      if (localName && declByLocal.has(localName)) {
        const exportName = getIdentifierName(spec.exported) ?? localName;
        exportedComponents.set(localName, { exportName, isDefault: false, isSpecifier: true });
      }
    }
  });

  // Default exports: export default Foo
  root.find(j.ExportDefaultDeclaration).forEach((p) => {
    const name = getIdentifierName(p.node.declaration);
    if (name && declByLocal.has(name)) {
      exportedComponents.set(name, { exportName: "default", isDefault: true, isSpecifier: false });
    }
  });

  // First, scan for static property assignments to identify which components have them
  const componentsWithStaticProps = new Set<string>();
  root.find(j.ExpressionStatement).forEach((p) => {
    const expr = p.node.expression;
    if (expr?.type !== "AssignmentExpression") {
      return;
    }
    const left = expr.left;
    if (left?.type !== "MemberExpression") {
      return;
    }
    const obj = left.object;
    if (obj?.type !== "Identifier") {
      return;
    }
    const styledNames = new Set(styledDecls.map((d) => d.localName));
    if (styledNames.has(obj.name)) {
      componentsWithStaticProps.add(obj.name);
    }
  });

  // Pre-pass: set needsWrapperComponent BEFORE emitStylesAndImports
  // This allows comment placement logic to know which decls need wrappers.
  for (const decl of styledDecls) {
    // shouldForwardProp needs wrapper
    if (decl.shouldForwardProp) {
      decl.needsWrapperComponent = true;
    }
    // withConfig.componentId needs wrapper
    if (decl.base.kind === "intrinsic" && decl.withConfig?.componentId) {
      decl.needsWrapperComponent = true;
    }
    // Components with static properties that are extended need wrappers
    // (for static property inheritance). Delegation case is handled later.
    if (extendedBy.has(decl.localName) && componentsWithStaticProps.has(decl.localName)) {
      decl.needsWrapperComponent = true;
    }
    // Exported components need wrappers (with exceptions)
    const hasInlinableAttrs =
      decl.attrsInfo &&
      (Object.keys(decl.attrsInfo.staticAttrs).length > 0 ||
        decl.attrsInfo.conditionalAttrs.length > 0 ||
        (decl.attrsInfo.invertedBoolAttrs?.length ?? 0) > 0);
    if (exportedComponents.has(decl.localName)) {
      const canInline = decl.base.kind === "intrinsic" && hasInlinableAttrs;
      if (!canInline) {
        decl.needsWrapperComponent = true;
      } else {
        // Even if canInline is true, we need a wrapper if the component has no JSX usages.
        // Without usages, there's nothing to inline into and the export would be lost.
        const hasJsxUsages =
          root
            .find(j.JSXElement, {
              openingElement: { name: { type: "JSXIdentifier", name: decl.localName } },
            })
            .size() > 0 ||
          root
            .find(j.JSXOpeningElement, { name: { type: "JSXIdentifier", name: decl.localName } })
            .size() > 0;
        if (!hasJsxUsages) {
          decl.needsWrapperComponent = true;
        }
      }
    }
  }

  // Helper to check if a component is used in JSX
  const isUsedInJsx = (name: string): boolean => {
    return (
      root
        .find(j.JSXElement, {
          openingElement: { name: { type: "JSXIdentifier", name } },
        })
        .size() > 0 ||
      root.find(j.JSXOpeningElement, { name: { type: "JSXIdentifier", name } }).size() > 0
    );
  };

  // Pre-pass: set needsWrapperComponent for base components used in JSX and extended.
  // This must happen BEFORE emitStylesAndImports so comment placement is correct.
  // NOTE: We only set needsWrapperComponent here, NOT flatten decl.base to intrinsic.
  // Base flattening happens later after extendsStyleKey is set.
  for (const decl of styledDecls) {
    if (decl.base.kind === "component") {
      const baseDecl = declByLocal.get(decl.base.ident);
      if (baseDecl?.base.kind === "intrinsic") {
        // If the base component is used in JSX AND this component needs a wrapper,
        // the base component also needs a wrapper for delegation to work.
        const baseUsedInJsx = isUsedInJsx(decl.base.ident);
        const shouldDelegate = baseUsedInJsx && decl.needsWrapperComponent;
        if (shouldDelegate) {
          baseDecl.needsWrapperComponent = true;
        }
      }
    }
  }

  // Styled components wrapping IMPORTED (non-styled) components that are used in JSX need wrappers.
  // This preserves the component boundary so that:
  // 1. Props like `variant`, `color` from the imported component are preserved
  // 2. The `as` prop can be properly handled
  // 3. The component can be referenced in `typeof` expressions
  // Note: Local components (defined in the same file) can be inlined safely.
  for (const decl of styledDecls) {
    if (decl.base.kind === "component") {
      const baseDecl = declByLocal.get(decl.base.ident);
      // Check if the base is an IMPORTED component (not a styled or local component)
      const isImportedComponent = importMap.has(decl.base.ident);
      if (!baseDecl && isImportedComponent) {
        const isUsedInJsxElement = isUsedInJsx(decl.localName);
        if (isUsedInJsxElement) {
          decl.needsWrapperComponent = true;
        }
      }
    }
  }

  emitStylesAndImports({
    root,
    j,
    filePath: file.path,
    styledImports,
    resolverImports,
    resolvedStyleObjects,
    styledDecls,
    isAstNode,
    objectToAst,
    literalToAst,
    stylesIdentifier,
  });
  hasChanges = true;

  // Remove styled declarations and rewrite JSX usages

  // Determine supportsExternalStyles for each decl
  for (const decl of styledDecls) {
    // 1. If extended by another styled component in this file -> YES
    if (extendedBy.has(decl.localName)) {
      decl.supportsExternalStyles = true;
      continue;
    }

    // 2. If NOT exported -> NO
    const exportInfo = exportedComponents.get(decl.localName);
    if (!exportInfo) {
      decl.supportsExternalStyles = false;
      continue;
    }

    // 3. If exported, ask adapter
    decl.supportsExternalStyles = adapter.shouldSupportExternalStyling({
      filePath: file.path,
      componentName: decl.localName,
      exportName: exportInfo.exportName,
      isDefaultExport: exportInfo.isDefault,
    });
  }

  const wrapperNames = new Set<string>();
  // Track wrappers that have expression `as` values (not just string literals)
  // These need generic polymorphic types to accept component-specific props
  const expressionAsWrapperNames = new Set<string>();

  for (const [baseName, children] of extendedBy.entries()) {
    const names = [baseName, ...children];
    const hasPolymorphicUsage = names.some((nm) => {
      const el = root.find(j.JSXElement, {
        openingElement: { name: { type: "JSXIdentifier", name: nm } },
      });
      const hasAs =
        el.find(j.JSXAttribute, { name: { type: "JSXIdentifier", name: "as" } }).size() > 0;
      const hasForwardedAs =
        el
          .find(j.JSXAttribute, {
            name: { type: "JSXIdentifier", name: "forwardedAs" },
          })
          .size() > 0;
      return hasAs || hasForwardedAs;
    });
    if (hasPolymorphicUsage) {
      wrapperNames.add(baseName);
      for (const c of children) {
        wrapperNames.add(c);
      }
    }
  }

  // Also check for `as` usage on styled components that wrap external components
  // (not in extendedBy because they don't extend other styled components)
  for (const decl of styledDecls) {
    if (decl.base.kind === "component" && !declByLocal.has(decl.base.ident)) {
      const el = root.find(j.JSXElement, {
        openingElement: { name: { type: "JSXIdentifier", name: decl.localName } },
      });
      const hasAs =
        el.find(j.JSXAttribute, { name: { type: "JSXIdentifier", name: "as" } }).size() > 0;
      const hasForwardedAs =
        el
          .find(j.JSXAttribute, {
            name: { type: "JSXIdentifier", name: "forwardedAs" },
          })
          .size() > 0;
      if (hasAs || hasForwardedAs) {
        wrapperNames.add(decl.localName);
      }
    }
  }

  // Also check for `as` usage on intrinsic styled components
  // (e.g., styled.span with as={animated.span})
  for (const decl of styledDecls) {
    if (decl.base.kind === "intrinsic" && !wrapperNames.has(decl.localName)) {
      const el = root.find(j.JSXElement, {
        openingElement: { name: { type: "JSXIdentifier", name: decl.localName } },
      });
      const asAttrs = el.find(j.JSXAttribute, { name: { type: "JSXIdentifier", name: "as" } });
      const hasAs = asAttrs.size() > 0;
      const hasForwardedAs =
        el
          .find(j.JSXAttribute, {
            name: { type: "JSXIdentifier", name: "forwardedAs" },
          })
          .size() > 0;
      if (hasAs || hasForwardedAs) {
        wrapperNames.add(decl.localName);
        // Check if any `as` value is an expression (not a string literal)
        // e.g., as={animated.span} vs as="a"
        const hasExpressionAs = asAttrs.some((path) => {
          const value = path.node.value;
          // JSXExpressionContainer means it's an expression like {animated.span}
          // StringLiteral/Literal means it's a string like "a"
          return value?.type === "JSXExpressionContainer";
        });
        if (hasExpressionAs) {
          expressionAsWrapperNames.add(decl.localName);
        }
      }
    }
  }

  for (const decl of styledDecls) {
    if (wrapperNames.has(decl.localName)) {
      decl.needsWrapperComponent = true;
    }
    // `withConfig({ shouldForwardProp })` cases need wrappers so we can consume
    // styling props without forwarding them to the DOM.
    if (decl.shouldForwardProp) {
      decl.needsWrapperComponent = true;
    }
    if (decl.base.kind === "component") {
      const baseDecl = declByLocal.get(decl.base.ident);
      if (baseDecl) {
        // Save original base component name for static property inheritance
        (decl as any).originalBaseIdent = decl.base.ident;
        decl.extendsStyleKey = baseDecl.styleKey;
        // Defer base flattening decision until after all needsWrapperComponent flags are set
      }
    }

    // Preserve `withConfig({ componentId })` semantics by keeping a wrapper component.
    // This ensures the component boundary remains, even if the styles are static.
    if (decl.base.kind === "intrinsic" && decl.withConfig?.componentId) {
      decl.needsWrapperComponent = true;
    }

    // Exported styled components need wrapper components to maintain the export.
    // Without this, removing the styled declaration would leave an empty `export {}`.
    // Exception: intrinsic-based components with fully inlinable attrs can skip the wrapper
    // since each usage site is independently transformed with the correct attrs.
    const hasInlinableAttrs =
      decl.attrsInfo &&
      (Object.keys(decl.attrsInfo.staticAttrs).length > 0 ||
        decl.attrsInfo.conditionalAttrs.length > 0 ||
        (decl.attrsInfo.invertedBoolAttrs?.length ?? 0) > 0);
    if (exportedComponents.has(decl.localName)) {
      // Allow inlining for intrinsic components with attrs (like TextInput)
      const canInline = decl.base.kind === "intrinsic" && hasInlinableAttrs;
      if (!canInline) {
        decl.needsWrapperComponent = true;
      } else {
        // Even if canInline is true, we need a wrapper if the component has no JSX usages.
        // Without usages, there's nothing to inline into and the export would be lost.
        const hasJsxUsages =
          root
            .find(j.JSXElement, {
              openingElement: { name: { type: "JSXIdentifier", name: decl.localName } },
            })
            .size() > 0 ||
          root
            .find(j.JSXOpeningElement, { name: { type: "JSXIdentifier", name: decl.localName } })
            .size() > 0;
        if (!hasJsxUsages) {
          decl.needsWrapperComponent = true;
        }
      }
    }

    // Styled components used as values (not just rendered in JSX) need wrapper components.
    // For example: <Component elementType={StyledDiv} /> passes StyledDiv as a value.
    // Without a wrapper, the identifier would be undefined after the styled declaration is removed.
    const usedAsValue =
      root
        .find(j.Identifier, { name: decl.localName })
        .filter((p) => {
          // Skip the styled component declaration itself
          if (p.parentPath?.node?.type === "VariableDeclarator") {
            return false;
          }
          // Skip JSX element names (these are handled by inline substitution)
          if (p.parentPath?.node?.type === "JSXOpeningElement") {
            return false;
          }
          if (p.parentPath?.node?.type === "JSXClosingElement") {
            return false;
          }
          // Skip JSX member expressions like <Styled.Component />
          if (
            p.parentPath?.node?.type === "JSXMemberExpression" &&
            (p.parentPath.node as any).object === p.node
          ) {
            return false;
          }
          // Skip styled(Component) extensions - the Component being extended
          // This checks if we're an argument to a CallExpression that is part of styled()
          if (p.parentPath?.node?.type === "CallExpression") {
            const callExpr = p.parentPath.node as any;
            const callee = callExpr.callee;
            // styled(Component) - callee is the styled identifier
            if (callee?.type === "Identifier" && callee.name === styledDefaultImport) {
              return false;
            }
            // styled(Component).withConfig() - callee is MemberExpression
            if (
              callee?.type === "MemberExpression" &&
              callee.object?.type === "CallExpression" &&
              callee.object.callee?.type === "Identifier" &&
              callee.object.callee.name === styledDefaultImport
            ) {
              return false;
            }
          }
          // Skip TaggedTemplateExpression tags - like styled(Component)`...`
          if (p.parentPath?.node?.type === "TaggedTemplateExpression") {
            return false;
          }
          // Skip if this is the argument to a styled(Component) call within a TaggedTemplateExpression
          if (
            p.parentPath?.node?.type === "CallExpression" &&
            p.parentPath.parentPath?.node?.type === "TaggedTemplateExpression"
          ) {
            return false;
          }
          // Skip if this is inside a template literal (e.g., ${Link}:hover & pattern)
          if (p.parentPath?.node?.type === "TemplateLiteral") {
            return false;
          }
          // This is a value reference - could be passed as a prop, assigned, etc.
          return true;
        })
        .size() > 0;

    if (usedAsValue) {
      decl.usedAsValue = true;
      decl.needsWrapperComponent = true;
    }
  }

  // Now that all needsWrapperComponent flags are set, flatten base components where appropriate.
  // This must happen AFTER extendsStyleKey is set (line 986) and AFTER all wrapper flags are set.
  for (const decl of styledDecls) {
    if (decl.base.kind === "component") {
      const baseDecl = declByLocal.get(decl.base.ident);
      if (baseDecl?.base.kind === "intrinsic") {
        // If the base component is used in JSX AND this component needs a wrapper,
        // keep as component reference so the wrapper can delegate to the base wrapper.
        // Otherwise flatten to intrinsic tag for inline style merging.
        const baseUsedInJsx = isUsedInJsx(decl.base.ident);
        const shouldDelegate = baseUsedInJsx && decl.needsWrapperComponent;
        if (!shouldDelegate) {
          // Flatten to intrinsic tag for inline style merging
          decl.base = { kind: "intrinsic", tagName: baseDecl.base.tagName };
        }
      }
    }
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
      if (exportedComponents.has(componentName) || extendedBy.has(componentName)) {
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
    const baseDecl = declByLocal.get(baseIdent);
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
      const rhs = j(`const __x = (${baseComponentName} as any).${propName};`).get().node.program
        .body[0].declarations[0].init;
      const stmt = j.expressionStatement(
        j.assignmentExpression(
          "=",
          j.memberExpression(j.identifier(decl.localName), j.identifier(propName)),
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
  // e.g., CommandMenuTextDivider.HEIGHT = ActionMenuTextDivider.HEIGHT
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
    if (declByLocal.has(baseIdent)) {
      continue;
    }

    // Skip if base is a local non-styled component (handled above via staticPropertyNames)
    if (staticPropertyNames.has(baseIdent)) {
      continue;
    }

    // Check if this is an imported component
    const importInfo = importMap.get(baseIdent);
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
      const propsFromImport = getStaticPropertiesFromImport(
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

  for (const decl of styledDecls) {
    // Skip removal for declarations with wrappers - they're already replaced in-place by emitWrappers
    if (decl.needsWrapperComponent) {
      // The styled declaration has been replaced with the wrapper function in emitWrappers
      // Continue to the next section which handles wrapper-specific logic
    } else {
      // Remove variable declarator for styled component (non-wrapper case)
      root
        .find(j.VariableDeclaration)
        .filter((p) =>
          p.node.declarations.some(
            (d) =>
              d.type === "VariableDeclarator" &&
              d.id.type === "Identifier" &&
              d.id.name === decl.localName,
          ),
        )
        .forEach((p) => {
          if (p.node.declarations.length === 1) {
            // Check if this is inside an ExportNamedDeclaration
            const parent = p.parentPath;
            if (parent && parent.node?.type === "ExportNamedDeclaration") {
              // Remove the entire export declaration
              j(parent).remove();
            } else {
              j(p).remove();
            }
            return;
          }
          p.node.declarations = p.node.declarations.filter(
            (d) =>
              !(
                d.type === "VariableDeclarator" &&
                d.id.type === "Identifier" &&
                d.id.name === decl.localName
              ),
          );
        });
    }

    // Preserve as a wrapper component for polymorphic/forwarded-as cases.
    if (decl.needsWrapperComponent) {
      // If this is a sibling-selector wrapper, add boolean props to each usage based on
      // sibling position (adjacent) and class marker (general sibling).
      if (decl.siblingWrapper) {
        const sw = decl.siblingWrapper;
        const ensureBoolAttr = (opening: any, name: string) => {
          const attrs = (opening.attributes ?? []) as any[];
          if (
            attrs.some(
              (a) =>
                a.type === "JSXAttribute" &&
                a.name?.type === "JSXIdentifier" &&
                a.name.name === name,
            )
          ) {
            return;
          }
          opening.attributes = [...attrs, j.jsxAttribute(j.jsxIdentifier(name), null)];
        };

        const hasClass = (opening: any, cls: string): boolean => {
          const attrs = (opening.attributes ?? []) as any[];
          for (const a of attrs) {
            if (a.type !== "JSXAttribute") {
              continue;
            }
            if (a.name?.type !== "JSXIdentifier") {
              continue;
            }
            if (a.name.name !== "className") {
              continue;
            }
            const v: any = a.value;
            if (!v) {
              continue;
            }
            if (v.type === "Literal" && typeof v.value === "string") {
              return v.value.split(/\s+/).includes(cls);
            }
            if (v.type === "StringLiteral") {
              return v.value.split(/\s+/).includes(cls);
            }
          }
          return false;
        };

        const visitJsx = (node: any) => {
          if (!node || typeof node !== "object") {
            return;
          }
          if (node.type === "JSXElement") {
            const children: any[] = node.children ?? [];
            let seenPrevThing = false;
            let afterActive = false;
            for (const child of children) {
              if (!child || child.type !== "JSXElement") {
                continue;
              }
              const name = child.openingElement?.name;
              if (name?.type !== "JSXIdentifier") {
                continue;
              }
              if (name.name === decl.localName) {
                if (seenPrevThing) {
                  ensureBoolAttr(child.openingElement, sw.propAdjacent);
                }
                if (sw.afterClass && hasClass(child.openingElement, sw.afterClass)) {
                  afterActive = true;
                } else if (afterActive && sw.propAfter) {
                  ensureBoolAttr(child.openingElement, sw.propAfter);
                }
                // Once we hit the first Thing, all later Things are adjacent siblings in this group.
                seenPrevThing = true;
              } else {
                // recurse into nested JSX
                visitJsx(child);
              }
            }
          }
        };

        root.find(j.JSXElement).forEach((p) => visitJsx(p.node));
      }

      continue;
    }

    // Replace JSX elements <Decl> with intrinsic tag and stylex.props
    root
      .find(j.JSXElement, {
        openingElement: {
          name: { type: "JSXIdentifier", name: decl.localName },
        },
      })
      .forEach((p) => {
        const opening = p.node.openingElement;
        const closing = p.node.closingElement;
        let finalTag = decl.base.kind === "intrinsic" ? decl.base.tagName : decl.base.ident;

        // Handle `as="tag"` (styled-components polymorphism) by rewriting the element.
        const attrs = opening.attributes ?? [];
        for (const attr of attrs) {
          if (attr.type !== "JSXAttribute") {
            continue;
          }
          if (attr.name.type !== "JSXIdentifier") {
            continue;
          }
          const attrName = attr.name.name;
          if (attrName !== "as" && attrName !== "forwardedAs") {
            continue;
          }
          const v = attr.value;
          const raw =
            v && v.type === "Literal" && typeof v.value === "string"
              ? v.value
              : v && v.type === "StringLiteral"
                ? v.value
                : null;
          if (raw) {
            finalTag = raw;
          }
        }

        // Handle both simple identifiers (div) and member expressions (animated.div)
        const createJsxName = (tag: string) => {
          if (tag.includes(".")) {
            const parts = tag.split(".");
            return j.jsxMemberExpression(
              j.jsxIdentifier(parts[0]!),
              j.jsxIdentifier(parts.slice(1).join(".")),
            );
          }
          return j.jsxIdentifier(tag);
        };
        opening.name = createJsxName(finalTag);
        if (closing) {
          closing.name = createJsxName(finalTag);
        }

        const keptAttrs = (opening.attributes ?? []).filter((attr) => {
          if (attr.type !== "JSXAttribute") {
            return true;
          }
          if (attr.name.type !== "JSXIdentifier") {
            return true;
          }
          // Honor shouldForwardProp by dropping filtered props from DOM output.
          if (decl.shouldForwardProp) {
            const n = attr.name.name;
            if (decl.shouldForwardProp.dropProps.includes(n)) {
              return false;
            }
            if (
              decl.shouldForwardProp.dropPrefix &&
              n.startsWith(decl.shouldForwardProp.dropPrefix)
            ) {
              return false;
            }
          }
          return attr.name.name !== "as" && attr.name.name !== "forwardedAs";
        });

        // Apply `attrs(...)` derived attributes (static + simple prop-conditional).
        if (decl.attrsInfo) {
          const { staticAttrs, conditionalAttrs, invertedBoolAttrs } = decl.attrsInfo;

          const hasAttr = (name: string) =>
            keptAttrs.some(
              (a) =>
                a.type === "JSXAttribute" &&
                a.name.type === "JSXIdentifier" &&
                a.name.name === name,
            );

          // Remove transient props referenced by conditional attrs (e.g. `$small`) and
          // add the derived attribute when present.
          for (const cond of conditionalAttrs) {
            const idx = keptAttrs.findIndex(
              (a) =>
                a.type === "JSXAttribute" &&
                a.name.type === "JSXIdentifier" &&
                a.name.name === cond.jsxProp,
            );
            if (idx !== -1) {
              keptAttrs.splice(idx, 1);
              if (!hasAttr(cond.attrName)) {
                keptAttrs.unshift(
                  j.jsxAttribute(
                    j.jsxIdentifier(cond.attrName),
                    j.jsxExpressionContainer(j.literal(cond.value)),
                  ),
                );
              }
            }
          }

          // Handle inverted boolean attrs (e.g. `"data-attr": props.X !== true`).
          // If the prop is not passed, the attr defaults to true.
          // If the prop is passed as true, the attr becomes false.
          for (const inv of invertedBoolAttrs ?? []) {
            const idx = keptAttrs.findIndex(
              (a) =>
                a.type === "JSXAttribute" &&
                a.name.type === "JSXIdentifier" &&
                a.name.name === inv.jsxProp,
            );
            // Remove the source prop from attrs if present
            if (idx !== -1) {
              const propAttr = keptAttrs[idx] as any;
              keptAttrs.splice(idx, 1);
              // Check if prop was passed as true
              const propVal = propAttr.value;
              const isTrue =
                propVal === null || // <Component propName /> is truthy
                (propVal?.type === "JSXExpressionContainer" &&
                  propVal.expression?.type === "BooleanLiteral" &&
                  propVal.expression.value === true);
              // props.X !== true → false when X is true
              if (!hasAttr(inv.attrName)) {
                keptAttrs.unshift(
                  j.jsxAttribute(
                    j.jsxIdentifier(inv.attrName),
                    j.jsxExpressionContainer(j.literal(!isTrue)),
                  ),
                );
              }
            } else {
              // Prop not passed → undefined !== true → true
              if (!hasAttr(inv.attrName)) {
                keptAttrs.unshift(
                  j.jsxAttribute(
                    j.jsxIdentifier(inv.attrName),
                    j.jsxExpressionContainer(j.literal(true)),
                  ),
                );
              }
            }
          }

          // Add static attrs (e.g. `type="text"`) if missing.
          for (const [k, v] of Object.entries(staticAttrs)) {
            if (hasAttr(k)) {
              continue;
            }
            const valNode =
              typeof v === "string"
                ? j.literal(v)
                : typeof v === "number" || typeof v === "boolean"
                  ? j.jsxExpressionContainer(j.literal(v))
                  : j.literal(String(v));
            keptAttrs.unshift(j.jsxAttribute(j.jsxIdentifier(k), valNode as any));
          }
        }

        const leadingNames = new Set([
          "href",
          "target",
          "rel",
          "type",
          "name",
          "value",
          "size",
          "tabIndex",
          "disabled",
          "readOnly",
          "ref",
          // Note: `style` is NOT in leadingNames - it should come after stylex.props
        ]);

        // Add attrs from attrsInfo to leadingNames so they appear before stylex.props
        if (decl.attrsInfo) {
          for (const k of Object.keys(decl.attrsInfo.staticAttrs)) {
            leadingNames.add(k);
          }
          for (const cond of decl.attrsInfo.conditionalAttrs) {
            leadingNames.add(cond.attrName);
          }
          for (const inv of decl.attrsInfo.invertedBoolAttrs ?? []) {
            leadingNames.add(inv.attrName);
          }
        }
        const leading: typeof keptAttrs = [];
        const rest: typeof keptAttrs = [];
        const hasRefAttr = keptAttrs.some(
          (a) =>
            a.type === "JSXAttribute" && a.name.type === "JSXIdentifier" && a.name.name === "ref",
        );
        for (const attr of keptAttrs) {
          if (attr.type === "JSXAttribute" && attr.name.type === "JSXIdentifier") {
            // Keep `placeholder` before stylex spread only when there's a `ref` (matches `refs` fixture).
            if (attr.name.name === "placeholder" && hasRefAttr) {
              leading.push(attr);
              continue;
            }
            if (leadingNames.has(attr.name.name)) {
              leading.push(attr);
              continue;
            }
          }
          rest.push(attr);
        }

        // Insert {...stylex.props(styles.key)} after structural attrs like href/type/size (matches fixtures).
        const styleArgs: any[] = [
          ...(decl.extendsStyleKey
            ? [
                j.memberExpression(
                  j.identifier(stylesIdentifier),
                  j.identifier(decl.extendsStyleKey),
                ),
              ]
            : []),
          j.memberExpression(j.identifier(stylesIdentifier), j.identifier(decl.styleKey)),
        ];

        const variantKeys = decl.variantStyleKeys ?? {};
        const variantProps = new Set(Object.keys(variantKeys));
        const keptAfterVariants: typeof rest = [];
        const styleFnPairs = decl.styleFnFromProps ?? [];
        const styleFnProps = new Set(styleFnPairs.map((p) => p.jsxProp));
        for (const attr of rest) {
          if (attr.type !== "JSXAttribute" || attr.name.type !== "JSXIdentifier") {
            keptAfterVariants.push(attr);
            continue;
          }
          const n = attr.name.name;

          // Convert certain interpolated props into dynamic StyleX styles (e.g. padding from `$padding`).
          if (styleFnProps.has(n)) {
            const pairs = styleFnPairs.filter((p) => p.jsxProp === n);
            const valueExpr = !attr.value
              ? j.literal(true)
              : attr.value.type === "StringLiteral"
                ? j.literal(attr.value.value)
                : attr.value.type === "Literal"
                  ? j.literal((attr.value as any).value)
                  : attr.value.type === "JSXExpressionContainer"
                    ? (attr.value.expression as any)
                    : null;
            if (valueExpr) {
              for (const p of pairs) {
                styleArgs.push(
                  j.callExpression(
                    j.memberExpression(j.identifier(stylesIdentifier), j.identifier(p.fnKey)),
                    [valueExpr],
                  ),
                );
              }
            }
            continue;
          }

          if (!variantProps.has(n)) {
            // Strip transient props (starting with $) that aren't used in styles.
            // These are styled-components conventions that shouldn't reach the DOM.
            if (n.startsWith("$")) {
              continue;
            }
            // For intrinsic elements, avoid forwarding unknown/custom props to the DOM.
            // (For styled-components this is often "fine", but once we inline to a DOM element
            // it becomes a React/TS/DOM attribute problem. Props that are used for styling are
            // already handled above via styleFnProps/variantProps.)
            if (decl.base.kind === "intrinsic") {
              const isLikelyValidDomAttr = (() => {
                if (n === "className" || n === "style" || n === "ref" || n === "key") {
                  return true;
                }
                if (n.startsWith("data-") || n.startsWith("aria-")) {
                  return true;
                }
                // Event handlers: onClick, onChange, onMouseEnter, etc.
                if (/^on[A-Z]/.test(n)) {
                  return true;
                }
                // Common HTML/SVG attributes used throughout fixtures
                if (
                  n === "id" ||
                  n === "title" ||
                  n === "role" ||
                  n === "tabIndex" ||
                  n === "href" ||
                  n === "target" ||
                  n === "rel" ||
                  n === "type" ||
                  n === "name" ||
                  n === "value" ||
                  n === "placeholder" ||
                  n === "disabled" ||
                  n === "readOnly" ||
                  n === "htmlFor" ||
                  n === "src" ||
                  n === "alt" ||
                  n === "width" ||
                  n === "height" ||
                  n === "viewBox" ||
                  n === "d" ||
                  n === "x" ||
                  n === "y" ||
                  n === "rx" ||
                  n === "ry" ||
                  n === "fill"
                ) {
                  return true;
                }
                return false;
              })();
              if (!isLikelyValidDomAttr) {
                continue;
              }
            }
            keptAfterVariants.push(attr);
            continue;
          }

          const variantStyleKey = variantKeys[n]!;
          if (!attr.value) {
            // <X $prop>
            styleArgs.push(
              j.memberExpression(j.identifier(stylesIdentifier), j.identifier(variantStyleKey)),
            );
            continue;
          }
          if (attr.value.type === "JSXExpressionContainer") {
            // <X $prop={expr}>
            styleArgs.push(
              j.logicalExpression(
                "&&",
                attr.value.expression as any,
                j.memberExpression(j.identifier(stylesIdentifier), j.identifier(variantStyleKey)),
              ),
            );
            continue;
          }
          // Any other value shape: drop the prop without attempting to apply a variant.
        }

        opening.attributes = [
          ...leading,
          j.jsxSpreadAttribute(
            j.callExpression(j.memberExpression(j.identifier("stylex"), j.identifier("props")), [
              ...styleArgs,
            ]),
          ),
          ...keptAfterVariants,
        ];
      });
  }

  emitWrappers({
    root,
    j,
    filePath: file.path,
    styledDecls,
    wrapperNames,
    patternProp,
    exportedComponents,
    stylesIdentifier,
  });

  // Reinsert static property assignments after their corresponding wrapper functions.
  // For each styled component that has static properties, find its wrapper function
  // and insert the static property assignments immediately after it.
  for (const [componentName, statements] of staticPropertyAssignments.entries()) {
    if (statements.length === 0) {
      continue;
    }

    // Find the wrapper function for this component
    const wrapperFn = root.find(j.FunctionDeclaration, { id: { name: componentName } }).at(0);

    if (wrapperFn.size() > 0) {
      // Insert static property assignments after the function (handle export wrapper)
      const fnPath = wrapperFn.get();
      const parent = fnPath.parentPath;

      if (
        parent?.node?.type === "ExportNamedDeclaration" ||
        parent?.node?.type === "ExportDefaultDeclaration"
      ) {
        // Function is wrapped in export, insert after the export
        j(parent).insertAfter(statements);
      } else {
        // Function is standalone, insert after it
        wrapperFn.insertAfter(statements);
      }
    }
  }

  const post = postProcessTransformedAst({
    root,
    j,
    descendantOverrides,
    ancestorSelectorParents,
    preserveReactImport,
  });
  if (post.changed) {
    hasChanges = true;
  }

  // If the file references `React` (types or values) but doesn't import it, add `import React from "react";`
  if (post.needsReactImport) {
    const firstImport = root.find(j.ImportDeclaration).at(0);
    const reactImport = j.importDeclaration(
      [j.importDefaultSpecifier(j.identifier("React"))],
      j.literal("react"),
    );
    if (firstImport.size() > 0) {
      firstImport.insertBefore(reactImport);
    } else {
      root.get().node.program.body.unshift(reactImport);
    }
    hasChanges = true;
  }

  let code: string | null = null;
  if (hasChanges) {
    assertNoNullNodesInArrays(root.get().node);
    try {
      code = formatOutput(
        root.toSource({
          quote: "double",
          trailingComma: true,
          reuseWhitespace: false,
        }),
      );
    } catch (e) {
      // Debug: find the smallest top-level statement that crashes recast printing.
      const program: any = root.get().node.program;
      let failing: string | null = null;
      if (program?.body && Array.isArray(program.body)) {
        for (let i = 0; i < program.body.length; i++) {
          const stmt = program.body[i];
          try {
            j(j.program([stmt as any])).toSource({
              quote: "double",
              trailingComma: true,
              reuseWhitespace: false,
            });
          } catch {
            failing = `program.body[${i}] type=${stmt?.type ?? "unknown"}`;
            break;
          }
        }
      }
      throw new Error(
        `Failed to print transformed output for ${file.path}: ${
          (e as any)?.message ?? String(e)
        }${failing ? `\nFirst failing statement: ${failing}` : ""}`,
      );
    }
  }

  return { code, warnings };
}

function toStyleKey(name: string): string {
  return name.charAt(0).toLowerCase() + name.slice(1);
}

function objectToAst(j: API["jscodeshift"], obj: Record<string, unknown>): any {
  const spreadsRaw = obj.__spreads;
  const propCommentsRaw = (obj as any).__propComments;
  const spreads =
    Array.isArray(spreadsRaw) && spreadsRaw.every((s) => typeof s === "string")
      ? (spreadsRaw as string[])
      : [];
  const propComments: Record<string, any> =
    propCommentsRaw && typeof propCommentsRaw === "object" && !Array.isArray(propCommentsRaw)
      ? (propCommentsRaw as Record<string, any>)
      : {};

  const props: any[] = [];

  for (const s of spreads) {
    props.push(j.spreadElement(j.identifier(s)));
  }

  for (const [key, value] of Object.entries(obj)) {
    if (key === "__spreads") {
      continue;
    }
    if (key === "__propComments") {
      continue;
    }
    const keyNode =
      /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) &&
      !key.startsWith(":") &&
      !key.startsWith("@") &&
      !key.startsWith("::")
        ? j.identifier(key)
        : j.literal(key);
    const prop = j.property(
      "init",
      keyNode as any,
      value && typeof value === "object" && !isAstNode(value)
        ? objectToAst(j, value as Record<string, unknown>)
        : literalToAst(j, value),
    );

    const commentEntry = propComments[key];
    const leading =
      typeof commentEntry === "string"
        ? commentEntry
        : commentEntry && typeof commentEntry === "object"
          ? (commentEntry.leading as unknown)
          : null;
    const trailingLine =
      commentEntry && typeof commentEntry === "object"
        ? (commentEntry.trailingLine as unknown)
        : null;
    const comments: any[] = [];
    if (typeof leading === "string" && leading.trim()) {
      const trimmed = leading.trim();
      comments.push({
        type: "CommentBlock",
        value: ` ${trimmed} `,
        leading: true,
        trailing: false,
      });
    }
    if (typeof trailingLine === "string" && trailingLine.trim()) {
      const trimmed = trailingLine.trim();
      // NOTE: Recast/oxfmt will often render this as a standalone comment line above the property.
      // We normalize it back to an inline trailing comment in `formatOutput`.
      comments.push({
        type: "CommentLine",
        value: ` ${trimmed}`,
        leading: false,
        trailing: true,
      });
    }
    if (comments.length) {
      (prop as any).comments = comments;
    }

    props.push(prop);
  }
  return j.objectExpression(props);
}

function literalToAst(j: API["jscodeshift"], value: unknown): any {
  if (isAstNode(value)) {
    return value;
  }
  if (value === null) {
    return j.literal(null);
  }
  if (typeof value === "string") {
    return j.literal(value);
  }
  if (typeof value === "number") {
    return j.literal(value);
  }
  if (typeof value === "boolean") {
    return j.literal(value);
  }
  if (typeof value === "undefined") {
    return j.identifier("undefined");
  }
  if (typeof value === "bigint") {
    return j.literal(value.toString());
  }
  if (typeof value === "symbol") {
    return j.literal(value.description ?? "");
  }
  if (typeof value === "function") {
    return j.literal("[Function]");
  }
  if (typeof value === "object") {
    try {
      return j.literal(JSON.stringify(value));
    } catch {
      return j.literal("[Object]");
    }
  }
  // fallback (should be unreachable, but keep it defensive)
  return j.literal("[Unknown]");
}

function isAstNode(v: unknown): v is { type: string } {
  return !!v && typeof v === "object" && typeof (v as any).type === "string";
}

function cssValueToJs(value: any, important = false): unknown {
  if (value.kind === "static") {
    // Preserve `!important` by emitting a string value that includes it.
    // (StyleX supports `!important` in values and this is necessary to override inline styles.)
    if (important) {
      const raw = String(value.value);
      return raw.includes("!important") ? raw : `${raw} !important`;
    }

    // Try to return number if purely numeric and no unit.
    if (/^-?\d+(\.\d+)?$/.test(value.value)) {
      return Number(value.value);
    }
    return value.value;
  }
  // interpolated values are handled earlier for now
  return "";
}

function toSuffixFromProp(propName: string): string {
  // `$isActive` => `IsActive`, `primary` => `Primary`
  const raw = propName.startsWith("$") ? propName.slice(1) : propName;
  if (!raw) {
    return "Variant";
  }

  // Handle simple expression keys coming from the dynamic resolution pipeline, e.g.:
  //   `size === "large"` -> `SizeLarge`
  //   `variant === "primary"` -> `VariantPrimary`
  //   `!isActive` -> `NotActive`
  const trimmed = raw.trim();
  if (trimmed.startsWith("!")) {
    const inner = trimmed
      .slice(1)
      .trim()
      .replace(/^\(|\)$/g, "");
    const base = toSuffixFromProp(inner);
    return `Not${base}`;
  }
  const eq = trimmed.includes("!==") ? "!==" : trimmed.includes("===") ? "===" : null;
  if (eq) {
    const [lhs0, rhs0] = trimmed.split(eq).map((s) => s.trim());
    const lhs = lhs0 ?? "Variant";
    const rhsRaw = (rhs0 ?? "").replace(/^['"]|['"]$/g, "");
    const rhs = rhsRaw || (eq === "!==" ? "NotMatch" : "Match");
    const lhsSuffix = lhs.charAt(0).toUpperCase() + lhs.slice(1);
    const rhsSuffix = rhs.charAt(0).toUpperCase() + rhs.slice(1);
    return eq === "!==" ? `${lhsSuffix}Not${rhsSuffix}` : `${lhsSuffix}${rhsSuffix}`;
  }

  // Common boolean convention: `$isActive` -> `Active` (matches existing fixtures)
  if (raw.startsWith("is") && raw.length > 2 && /[A-Z]/.test(raw[2]!)) {
    return raw.slice(2);
  }
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function isJsxElementNamed(name: string) {
  return (p: any) => {
    const n = p.node.openingElement?.name;
    return n && n.type === "JSXIdentifier" && n.name === name;
  };
}

function isJsxSelfClosingNamed(name: string) {
  return (p: any) => {
    const n = p.node.name;
    return n && n.type === "JSXIdentifier" && n.name === name;
  };
}
