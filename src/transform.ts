import type { API, FileInfo, Options } from "jscodeshift";
import type { Adapter } from "./adapter.js";
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
  shouldSkipForCreateGlobalStyle,
  shouldSkipForThemeProvider,
  universalSelectorUnsupportedWarning,
} from "./internal/policy.js";
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

/**
 * Transform styled-components to StyleX
 *
 * This is a sample transform that serves as a starting point.
 * You'll need to implement the actual transformation logic based on your needs.
 */
export default function transform(file: FileInfo, api: API, options: Options): string | null {
  const result = transformWithWarnings(file, api, options as TransformOptions);

  // Log warnings to stderr
  for (const warning of result.warnings) {
    const location = warning.line
      ? ` (${file.path}:${warning.line}:${warning.column ?? 0})`
      : ` (${file.path})`;
    process.stderr.write(`[styled-components-to-stylex] Warning${location}: ${warning.message}\n`);
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

  const adapter = options.adapter as Adapter;
  if (!adapter || typeof adapter.resolveValue !== "function") {
    throw new Error("Adapter must provide resolveValue(ctx) => { expr, imports } | null");
  }
  const resolverImports = new Set<string>();

  let hasChanges = false;

  // Find styled-components imports
  const styledImports = root.find(j.ImportDeclaration, {
    source: { value: "styled-components" },
  });

  if (styledImports.length === 0) {
    return { code: null, warnings: [] };
  }

  // Policy: ThemeProvider usage is project-specific. If the file uses ThemeProvider, skip entirely.
  if (shouldSkipForThemeProvider({ root, j, styledImports })) {
    return { code: null, warnings: [] };
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
      const program = j(`(${exprSource});`);
      const stmt = program.find(j.ExpressionStatement).nodes()[0];
      return (stmt as any)?.expression ?? null;
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
        if (!adapter.resolveValue) {
          continue;
        }
        (obj as any)[k] = rewriteCssVarsInString({
          raw: v,
          definedVars,
          varsToDrop,
          resolveValue: adapter.resolveValue,
          addImport: (imp) => resolverImports.add(imp),
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
      source: { kind: "filePath"; value: string } | { kind: "module"; value: string };
    }
  >();
  {
    const baseDir = dirname(file.path);
    const resolveImportSource = (
      specifier: string,
    ): { kind: "filePath"; value: string } | { kind: "module"; value: string } => {
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
        ? { kind: "filePath", value: pathResolve(baseDir, specifier) }
        : { kind: "module", value: specifier };
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
  const cssLocal = styledImports
    .find(j.ImportSpecifier)
    .nodes()
    .find((s) => s.imported.type === "Identifier" && s.imported.name === "css")?.local?.name;

  const cssHelperNames = new Set<string>();

  if (cssLocal) {
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
        const rules = normalizeStylisAstToIR(stylisAst as any, []);

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

    // Remove `css` import specifier from styled-components imports.
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

  root.find(j.TemplateLiteral).forEach((p) => {
    const tl = p.node;

    // Specificity hacks like `&&` / `&&&` inside styled template literals.
    for (const quasi of tl.quasis) {
      if (quasi.value.raw.includes("&&")) {
        hasSpecificityHack = true;
      }
    }

    // Component selector patterns like `${Link}:hover & { ... }`
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

  const { styledDecls, hasUniversalSelectors } = collectStyledDecls({
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
    warnings.push(universalSelectorUnsupportedWarning());
    return { code: null, warnings };
  }

  // Resolve dynamic nodes via plugins (currently only used to decide bail vs convert).
  const lowered = lowerRules({
    api,
    j,
    filePath: file.path,
    resolveValue: adapter.resolveValue,
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
  if (lowered.bail) {
    return { code: null, warnings };
  }

  emitStylesAndImports({
    root,
    j,
    styledImports,
    resolverImports,
    resolvedStyleObjects,
    styledDecls,
    cssHelperNames,
    isAstNode,
    objectToAst,
    literalToAst,
  });
  hasChanges = true;

  // Remove styled declarations and rewrite JSX usages
  // Build a quick lookup for extension: if styled(BaseStyled) where BaseStyled is in decl map.
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

  const wrapperNames = new Set<string>();
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
        decl.extendsStyleKey = baseDecl.styleKey;
        // If base is intrinsic, render as intrinsic tag (matches fixtures like extending-styles).
        if (baseDecl.base.kind === "intrinsic") {
          decl.base = { kind: "intrinsic", tagName: baseDecl.base.tagName };
        }
      }
    }

    // Preserve `withConfig({ displayName/componentId })` semantics by keeping a wrapper component.
    // This ensures the component boundary remains (useful for debugging/devtools), even if the styles are static.
    if (
      decl.base.kind === "intrinsic" &&
      (decl.withConfig?.displayName || decl.withConfig?.componentId)
    ) {
      decl.needsWrapperComponent = true;
    }

    // Remove variable declarator for styled component
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
          j(p).remove();
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

      root
        .find(j.JSXElement, {
          openingElement: {
            name: { type: "JSXIdentifier", name: decl.localName },
          },
        })
        .forEach((p) => {
          const opening = p.node.openingElement;
          const attrs = opening.attributes ?? [];
          for (const attr of attrs) {
            if (attr.type !== "JSXAttribute") {
              continue;
            }
            if (attr.name.type !== "JSXIdentifier") {
              continue;
            }
            if (attr.name.name === "forwardedAs") {
              attr.name.name = "as";
            }
          }
        });
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

        opening.name = j.jsxIdentifier(finalTag);
        if (closing) {
          closing.name = j.jsxIdentifier(finalTag);
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
          const { staticAttrs, conditionalAttrs } = decl.attrsInfo;

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
          "disabled",
          "readOnly",
          "ref",
          "style",
        ]);
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
            ? [j.memberExpression(j.identifier("styles"), j.identifier(decl.extendsStyleKey))]
            : []),
          j.memberExpression(j.identifier("styles"), j.identifier(decl.styleKey)),
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
                    j.memberExpression(j.identifier("styles"), j.identifier(p.fnKey)),
                    [valueExpr],
                  ),
                );
              }
            }
            continue;
          }

          if (!variantProps.has(n)) {
            keptAfterVariants.push(attr);
            continue;
          }

          const variantStyleKey = variantKeys[n]!;
          if (!attr.value) {
            // <X $prop>
            styleArgs.push(
              j.memberExpression(j.identifier("styles"), j.identifier(variantStyleKey)),
            );
            continue;
          }
          if (attr.value.type === "JSXExpressionContainer") {
            // <X $prop={expr}>
            styleArgs.push(
              j.logicalExpression(
                "&&",
                attr.value.expression as any,
                j.memberExpression(j.identifier("styles"), j.identifier(variantStyleKey)),
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
    styledDecls,
    wrapperNames,
    patternProp,
  });

  const post = postProcessTransformedAst({
    root,
    j,
    descendantOverrides,
    ancestorSelectorParents,
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
  const spreads =
    Array.isArray(spreadsRaw) && spreadsRaw.every((s) => typeof s === "string")
      ? (spreadsRaw as string[])
      : [];

  const props: any[] = [];

  for (const s of spreads) {
    props.push(j.spreadElement(j.identifier(s)));
  }

  for (const [key, value] of Object.entries(obj)) {
    if (key === "__spreads") {
      continue;
    }
    const keyNode =
      /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) &&
      !key.startsWith(":") &&
      !key.startsWith("@") &&
      !key.startsWith("::")
        ? j.identifier(key)
        : j.literal(key);
    props.push(
      j.property(
        "init",
        keyNode as any,
        value && typeof value === "object" && !isAstNode(value)
          ? objectToAst(j, value as Record<string, unknown>)
          : literalToAst(j, value),
      ),
    );
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
