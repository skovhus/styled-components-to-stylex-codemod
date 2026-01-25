import type { API, ASTPath, FileInfo, ImportDeclaration, JSXAttribute, Options } from "jscodeshift";
import path from "node:path";
import { isAstNode } from "./internal/jscodeshift-utils.js";
import type { ImportSource, ImportSpec } from "./adapter.js";
import { assertNoNullNodesInArrays } from "./internal/ast-safety.js";
import { collectStyledDecls } from "./internal/collect-styled-decls.js";
import { extractStyledCallArgs } from "./internal/extract-styled-call-args.js";
import { formatOutput } from "./internal/format-output.js";
import { convertStyledKeyframes } from "./internal/keyframes.js";
import { lowerRules } from "./internal/lower-rules.js";
import { emitStylesAndImports } from "./internal/emit-styles.js";
import { emitWrappers } from "./internal/emit-wrappers.js";
import { postProcessTransformedAst } from "./internal/rewrite-jsx.js";
import {
  collectCreateGlobalStyleWarnings,
  collectThemeProviderSkipWarnings,
  shouldSkipForCreateGlobalStyle,
  shouldSkipForThemeProvider,
} from "./internal/policy.js";
import { Logger, type WarningLog } from "./internal/logger.js";
import type { StyledDecl, TransformOptions, TransformResult } from "./internal/transform-types.js";
import { assertValidAdapter } from "./internal/public-api-validation.js";
import { buildImportMap } from "./internal/transform-import-map.js";
import { parseExpr as parseExprImpl } from "./internal/transform-parse-expr.js";
import { createResolveAdapterSafe } from "./internal/transform-resolve-value.js";
import { rewriteCssVarsInStyleObject as rewriteCssVarsInStyleObjectImpl } from "./internal/transform-css-vars.js";
import {
  extractAndRemoveCssHelpers,
  isIdentifierReference,
  isStyledTag as isStyledTagImpl,
  removeInlinedCssHelperFunctions,
  type UnsupportedCssUsage,
} from "./internal/transform/css-helpers.js";
import {
  getStaticPropertiesFromImport as getStaticPropertiesFromImportImpl,
  patternProp as patternPropImpl,
} from "./internal/transform-utils.js";

export type { TransformOptions, TransformResult } from "./internal/transform-types.js";

/**
 * Transform styled-components to StyleX
 *
 * This is a sample transform that serves as a starting point.
 * You'll need to implement the actual transformation logic based on your needs.
 */
export default function transform(file: FileInfo, api: API, options: Options): string | null {
  const result = transformWithWarnings(file, api, options as TransformOptions);
  Logger.logWarnings(result.warnings, file.path);
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
  const warnings: WarningLog[] = [];

  // `forwardedAs` is styled-components-specific; in StyleX output we standardize on `as`.
  root
    .find(j.JSXAttribute, { name: { type: "JSXIdentifier", name: "forwardedAs" } })
    .forEach((p: ASTPath<JSXAttribute>) => {
      if (p.node.name.type === "JSXIdentifier") {
        p.node.name.name = "as";
      }
    });

  // Preserve existing `import React ... from "react"` (default or namespace import) even if it becomes "unused"
  // after the transform. JSX runtime differences and local conventions can make this import intentionally present.
  // NOTE: Check `.value` directly rather than relying on `.type === "StringLiteral"` since ESTree-style parsers
  // emit `Literal` nodes for import sources. Both node types have a `.value` property with the module specifier.
  const preserveReactImport =
    root
      .find(j.ImportDeclaration)
      .filter((p: ASTPath<ImportDeclaration>) => (p.node?.source as any)?.value === "react")
      .filter((p: ASTPath<ImportDeclaration>) =>
        (p.node.specifiers ?? []).some(
          (s) =>
            (s.type === "ImportDefaultSpecifier" || s.type === "ImportNamespaceSpecifier") &&
            s.local?.type === "Identifier" &&
            s.local.name === "React",
        ),
      )
      .size() > 0;

  const patternProp = (keyName: string, valueId?: any) => patternPropImpl(j, keyName, valueId);
  const getStaticPropertiesFromImport = (source: ImportSource, componentName: string): string[] =>
    getStaticPropertiesFromImportImpl({ j, source, componentName });

  const adapter = options.adapter;
  assertValidAdapter(
    adapter,
    "transform(options) - missing `adapter` (if you run the jscodeshift transform directly, pass options.adapter)",
  );
  const resolverImports = new Map<string, ImportSpec>();

  let hasChanges = false;
  const {
    resolveValueSafe,
    resolveCallSafe,
    bailRef: resolveValueBailRef,
  } = createResolveAdapterSafe({
    adapter,
    warnings,
  });

  // Find styled-components imports
  const styledImports = root.find(j.ImportDeclaration, {
    source: { value: "styled-components" },
  });

  if (styledImports.length === 0) {
    return { code: null, warnings: [] };
  }

  // Policy: ThemeProvider usage is project-specific. If the file uses ThemeProvider, skip entirely.
  if (shouldSkipForThemeProvider({ root, j, styledImports })) {
    return {
      code: null,
      warnings: collectThemeProviderSkipWarnings({ root, j, styledImports }),
    };
  }

  // Policy: createGlobalStyle is unsupported in StyleX; emit a warning when imported.
  warnings.push(...collectCreateGlobalStyleWarnings(styledImports));

  if (shouldSkipForCreateGlobalStyle({ styledImports, j })) {
    return { code: null, warnings };
  }

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

  const parseExpr = (exprSource: string): any => parseExprImpl(api, exprSource);

  const rewriteCssVarsInStyleObject = (
    obj: Record<string, unknown>,
    definedVars: Map<string, string>,
    varsToDrop: Set<string>,
  ): void =>
    rewriteCssVarsInStyleObjectImpl({
      obj,
      filePath: file.path,
      definedVars,
      varsToDrop,
      isAstNode,
      resolveValue: resolveValueSafe,
      addImport: (imp) => resolverImports.set(JSON.stringify(imp), imp),
      parseExpr,
      j,
    });
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

  const importMap = buildImportMap({ root, j, filePath: file.path });

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

  const cssHelpers = extractAndRemoveCssHelpers({
    root,
    j,
    styledImports,
    cssLocal,
    toStyleKey,
  });

  if (cssHelpers.unsupportedCssUsages.length > 0) {
    return { code: null, warnings: buildUnsupportedCssWarnings(cssHelpers.unsupportedCssUsages) };
  }

  const cssHelperNames = cssHelpers.cssHelperNames;
  const cssHelperDecls = cssHelpers.cssHelperDecls;
  const cssHelperFunctions = cssHelpers.cssHelperFunctions;
  const cssHelperHasUniversalSelectors = cssHelpers.cssHelperHasUniversalSelectors;
  const cssHelperUniversalSelectorLoc = cssHelpers.cssHelperUniversalSelectorLoc;
  if (cssHelpers.changed) {
    hasChanges = true;
  }

  // Identify local names that refer to the styled-components default import (e.g. `styled`)
  // for template ancestry checks.
  const styledLocalNames = new Set<string>();
  styledImports.forEach((imp) => {
    const specs = imp.node.specifiers ?? [];
    for (const spec of specs) {
      if (spec.type === "ImportDefaultSpecifier" && spec.local?.type === "Identifier") {
        styledLocalNames.add(spec.local.name);
      }
    }
  });
  const isStyledTag = (tag: any): boolean => isStyledTagImpl(styledLocalNames, tag);

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
    warnings.push({
      severity: "warning",
      type: "Component selectors like `${OtherComponent}:hover &` are not directly representable in StyleX. Manual refactor is required",
      loc: componentSelectorLoc,
    });

    // Policy: component selectors like `${OtherComponent}:hover &` require a semantic refactor.
    // Bail out to avoid producing incorrect output.
    return { code: null, warnings };
  }

  if (hasSpecificityHack) {
    warnings.push({
      severity: "warning",
      type: "Styled-components specificity hacks like `&&` / `&&&` are not representable in StyleX",
      loc: specificityHackLoc,
    });
    return { code: null, warnings };
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

  // Pre-process: extract CallExpression arguments from styled() calls into separate variables.
  // This transforms patterns like styled(motion.create(Component)) into:
  //   const MotionComponent = motion.create(Component);
  //   styled(MotionComponent)
  // which can then be handled by the normal styled(Identifier) collection path.
  if (extractStyledCallArgs({ root, j, styledDefaultImport })) {
    hasChanges = true;
  }

  const collected = collectStyledDecls({
    root,
    j,
    styledDefaultImport,
    cssLocal,
    toStyleKey,
    toSuffixFromProp,
  });
  const styledDecls = collected.styledDecls;
  let hasUniversalSelectors = collected.hasUniversalSelectors;
  let universalSelectorLoc = collected.universalSelectorLoc;

  if (cssHelperDecls.length > 0) {
    styledDecls.push(...cssHelperDecls);
    styledDecls.sort((a, b) => {
      const aIdx = a.declIndex ?? Number.POSITIVE_INFINITY;
      const bIdx = b.declIndex ?? Number.POSITIVE_INFINITY;
      if (aIdx !== bIdx) {
        return aIdx - bIdx;
      }
      return 0;
    });
  }

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

  if (cssHelperHasUniversalSelectors) {
    hasUniversalSelectors = true;
    if (!universalSelectorLoc) {
      universalSelectorLoc = cssHelperUniversalSelectorLoc;
    }
  }

  // Universal selectors (`*`) are currently unsupported (too many edge cases to map to StyleX safely).
  // Skip transforming the entire file to avoid producing incorrect output.
  if (hasUniversalSelectors) {
    warnings.push({
      severity: "warning",
      type: "Universal selectors (`*`) are currently unsupported",
      loc: universalSelectorLoc,
    });
    return { code: null, warnings };
  }

  // Resolve dynamic nodes via plugins (currently only used to decide bail vs convert).
  const lowered = lowerRules({
    api,
    j,
    root,
    filePath: file.path,
    resolveValue: resolveValueSafe,
    resolveCall: resolveCallSafe,
    importMap,
    warnings,
    resolverImports,
    styledDecls,
    keyframesNames,
    cssHelperNames,
    cssHelperFunctions,
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
  if (lowered.bail || resolveValueBailRef.value) {
    return { code: null, warnings };
  }

  // Now that we know the file is transformable, remove any css helper functions that were inlined.
  if (
    removeInlinedCssHelperFunctions({
      root,
      j,
      cssLocal,
      names: lowered.usedCssHelperFunctions,
    })
  ) {
    hasChanges = true;
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

  for (const decl of styledDecls) {
    decl.isExported = exportedComponents.has(decl.localName);
  }

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
    if (decl.isCssHelper) {
      continue;
    }
    // Intrinsic components with prop-conditional attrs (e.g. `size: props.$small ? 5 : undefined`)
    // tend to produce very noisy inline substitutions when there are multiple callsite variations.
    // Prefer emitting a wrapper function component in these cases.
    if (decl.base.kind === "intrinsic" && (decl.attrsInfo?.conditionalAttrs?.length ?? 0) > 0) {
      decl.needsWrapperComponent = true;
    }
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
    // Exported components must keep a wrapper to preserve the module's public API.
    if (exportedComponents.has(decl.localName)) {
      decl.needsWrapperComponent = true;
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

  // Helper to determine if a styled(ImportedComponent) wrapper is simple enough to inline.
  // Returns true if there's no complex logic that requires a wrapper function.
  const canInlineImportedComponentWrapper = (decl: StyledDecl): boolean => {
    if (decl.variantStyleKeys && Object.keys(decl.variantStyleKeys).length > 0) {
      return false;
    }
    if (decl.variantDimensions && decl.variantDimensions.length > 0) {
      return false;
    }
    if (decl.styleFnFromProps && decl.styleFnFromProps.length > 0) {
      return false;
    }
    if (decl.inlineStyleProps && decl.inlineStyleProps.length > 0) {
      return false;
    }
    if (decl.extraStylexPropsArgs && decl.extraStylexPropsArgs.length > 0) {
      return false;
    }
    if (decl.extraStyleKeys && decl.extraStyleKeys.length > 0) {
      return false;
    }
    if (decl.enumVariant) {
      return false;
    }
    if (decl.siblingWrapper) {
      return false;
    }
    if (decl.attrWrapper) {
      return false;
    }
    if (decl.shouldForwardProp) {
      return false;
    }

    if (decl.attrsInfo) {
      if (decl.attrsInfo.conditionalAttrs?.length) {
        return false;
      }
      if (decl.attrsInfo.defaultAttrs?.length) {
        return false;
      }
      if (decl.attrsInfo.invertedBoolAttrs?.length) {
        return false;
      }
    }

    return true;
  };

  // Pre-pass: set needsWrapperComponent for base components used in JSX and extended.
  // This must happen BEFORE emitStylesAndImports so comment placement is correct.
  // NOTE: We only set needsWrapperComponent here, NOT flatten decl.base to intrinsic.
  // Base flattening happens later after extendsStyleKey is set.
  for (const decl of styledDecls) {
    if (decl.isCssHelper) {
      continue;
    }
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

  // Styled components wrapping IMPORTED (non-styled) components that are used in JSX.
  // These CAN be inlined if simple enough OR only used once.
  // Complex wrappers (with variants, dynamic styles, attrs logic, etc.) still need wrappers.
  for (const decl of styledDecls) {
    if (decl.isCssHelper) {
      continue;
    }
    if (decl.base.kind === "component") {
      const baseDecl = declByLocal.get(decl.base.ident);
      // Check if the base is an IMPORTED component (not a styled or local component)
      const isImportedComponent = importMap.has(decl.base.ident);
      if (!baseDecl && isImportedComponent) {
        const isUsedInJsxElement = isUsedInJsx(decl.localName);
        if (isUsedInJsxElement) {
          // Skip if already marked as needing wrapper (e.g., exported components)
          if (decl.needsWrapperComponent) {
            continue;
          }

          // If this component is extended by another styled component, it must remain
          // as a component (not inlined) so the extending component can delegate to it.
          if (extendedBy.has(decl.localName)) {
            decl.needsWrapperComponent = true;
            continue;
          }

          const isSimple = canInlineImportedComponentWrapper(decl);

          if (isSimple) {
            // Mark as candidate for inlining - styleKey update is deferred until after
            // all needsWrapperComponent checks are done (as/forwardedAs usage, etc.)
            (decl as any).canInlineComponentWrapper = true;
          } else {
            decl.needsWrapperComponent = true;
          }
          // Note: other conditions (used as value, className/style in JSX, as prop) are checked later
          // and may still set needsWrapperComponent = true
        }
      }
    }
  }

  // Helper to check if a styled component receives className in JSX usages.
  // If className is passed, it needs to be a wrapper to merge with stylex className.
  // Check if a styled component receives className or style props in JSX callsites.
  // These components need wrapper functions to merge external className/style with stylex output.
  const receivesClassNameOrStyleInJsx = (name: string): { className: boolean; style: boolean } => {
    let foundClassName = false;
    let foundStyle = false;
    const collectFromOpening = (opening: any) => {
      if (foundClassName && foundStyle) {
        return;
      }
      for (const a of (opening?.attributes ?? []) as any[]) {
        if (!a) {
          continue;
        }
        if (a.type === "JSXAttribute" && a.name?.type === "JSXIdentifier") {
          if (a.name.name === "className") {
            foundClassName = true;
          }
          if (a.name.name === "style") {
            foundStyle = true;
          }
        }
      }
    };
    root
      .find(j.JSXElement, {
        openingElement: { name: { type: "JSXIdentifier", name } },
      } as any)
      .forEach((p: any) => collectFromOpening(p.node.openingElement));
    root
      .find(j.JSXSelfClosingElement, { name: { type: "JSXIdentifier", name } } as any)
      .forEach((p: any) => collectFromOpening(p.node));
    return { className: foundClassName, style: foundStyle };
  };

  // Styled components that receive className/style props in JSX need wrappers to merge them.
  // Without a wrapper, passing `className` would replace the stylex className instead of merging.
  // Also track which components receive className/style in JSX for merger import determination.
  for (const decl of styledDecls) {
    const { className, style } = receivesClassNameOrStyleInJsx(decl.localName);
    if (className || style) {
      (decl as any).receivesClassNameOrStyleInJsx = true;
      if (!decl.needsWrapperComponent) {
        decl.needsWrapperComponent = true;
      }
    }
  }

  // Determine supportsExternalStyles and supportsAsProp for each decl
  // (before emitStylesAndImports for merger import and wrapper generation)
  for (const decl of styledDecls) {
    // 1. If extended by another styled component in this file -> enable external styles
    if (extendedBy.has(decl.localName)) {
      decl.supportsExternalStyles = true;
      decl.supportsAsProp = false;
      continue;
    }

    // 2. If NOT exported -> disable both
    const exportInfo = exportedComponents.get(decl.localName);
    if (!exportInfo) {
      decl.supportsExternalStyles = false;
      decl.supportsAsProp = false;
      continue;
    }

    // 3. If exported, ask adapter for external interface configuration
    const extResult = adapter.externalInterface({
      filePath: file.path,
      componentName: decl.localName,
      exportName: exportInfo.exportName,
      isDefaultExport: exportInfo.isDefault,
    });
    decl.supportsExternalStyles = extResult?.styles === true;
    decl.supportsAsProp = extResult?.as === true;
  }

  // Early detection of components used as values (before emitStylesAndImports for merger import)
  // Components passed as props (e.g., <Component elementType={StyledDiv} />) need className/style merging
  for (const decl of styledDecls) {
    const usedAsValue =
      root
        .find(j.Identifier, { name: decl.localName })
        .filter((p) => {
          // Skip the styled component declaration itself
          if (p.parentPath?.node?.type === "VariableDeclarator") {
            return false;
          }
          // Skip JSX element names (these are handled by inline substitution)
          if (
            p.parentPath?.node?.type === "JSXOpeningElement" ||
            p.parentPath?.node?.type === "JSXClosingElement"
          ) {
            return false;
          }
          // Skip JSX member expressions like <Styled.Component />
          if (
            p.parentPath?.node?.type === "JSXMemberExpression" &&
            (p.parentPath.node as any).object === p.node
          ) {
            return false;
          }
          // Skip styled(Component) extensions
          if (p.parentPath?.node?.type === "CallExpression") {
            const callExpr = p.parentPath.node as any;
            const callee = callExpr.callee;
            if (callee?.type === "Identifier" && callee.name === styledDefaultImport) {
              return false;
            }
            if (
              callee?.type === "MemberExpression" &&
              callee.object?.type === "CallExpression" &&
              callee.object.callee?.type === "Identifier" &&
              callee.object.callee.name === styledDefaultImport
            ) {
              return false;
            }
          }
          // Skip TaggedTemplateExpression tags
          if (p.parentPath?.node?.type === "TaggedTemplateExpression") {
            return false;
          }
          // Skip styled(Component) call in TaggedTemplateExpression
          if (
            p.parentPath?.node?.type === "CallExpression" &&
            p.parentPath.parentPath?.node?.type === "TaggedTemplateExpression"
          ) {
            return false;
          }
          // Skip template literal interpolations (e.g., ${Link}:hover &)
          if (p.parentPath?.node?.type === "TemplateLiteral") {
            return false;
          }
          return true;
        })
        .size() > 0;

    if (usedAsValue) {
      decl.usedAsValue = true;
      decl.needsWrapperComponent = true;
    }
  }

  // Helper to check if a type member is `as?: React.ElementType`.
  const isAsElementTypeMemberEarly = (member: any): boolean => {
    if (
      member.type !== "TSPropertySignature" ||
      member.key?.type !== "Identifier" ||
      member.key.name !== "as"
    ) {
      return false;
    }
    const memberType = member.typeAnnotation?.typeAnnotation;
    if (memberType?.type === "TSTypeReference") {
      const memberTypeName = memberType.typeName;
      if (
        memberTypeName?.type === "TSQualifiedName" &&
        memberTypeName.left?.name === "React" &&
        memberTypeName.right?.name === "ElementType"
      ) {
        return true;
      }
      if (memberTypeName?.type === "Identifier" && memberTypeName.name === "ElementType") {
        return true;
      }
    }
    return false;
  };

  // Helper to check if a type contains `as?: React.ElementType` property (early version).
  const typeContainsAsElementTypeEarly = (typeNode: any): boolean => {
    if (!typeNode) {
      return false;
    }
    if (typeNode.type === "TSIntersectionType") {
      return (typeNode.types ?? []).some(typeContainsAsElementTypeEarly);
    }
    if (typeNode.type === "TSParenthesizedType") {
      return typeContainsAsElementTypeEarly(typeNode.typeAnnotation);
    }
    if (typeNode.type === "TSTypeReference") {
      const typeParams = typeNode.typeParameters?.params ?? [];
      for (const tp of typeParams) {
        if (typeContainsAsElementTypeEarly(tp)) {
          return true;
        }
      }
      if (typeNode.typeName?.type === "Identifier") {
        const typeName = typeNode.typeName.name;
        const typeAlias = root
          .find(j.TSTypeAliasDeclaration)
          .filter((p) => (p.node as any).id?.name === typeName);
        if (typeAlias.size() > 0) {
          return typeContainsAsElementTypeEarly(typeAlias.get().node.typeAnnotation);
        }
        const iface = root
          .find(j.TSInterfaceDeclaration)
          .filter((p) => (p.node as any).id?.name === typeName);
        if (iface.size() > 0) {
          const body = iface.get().node.body?.body ?? [];
          for (const member of body) {
            if (isAsElementTypeMemberEarly(member)) {
              return true;
            }
          }
        }
      }
      return false;
    }
    if (typeNode.type === "TSTypeLiteral") {
      for (const member of typeNode.members ?? []) {
        if (isAsElementTypeMemberEarly(member)) {
          return true;
        }
      }
    }
    return false;
  };

  // Early detection of polymorphic intrinsic wrappers (before emitStylesAndImports for merger import)
  // These are intrinsic styled components (styled.tag) used with as={} in JSX OR whose props type
  // includes as?: React.ElementType. They pass style through directly instead of merging.
  for (const decl of styledDecls) {
    if (decl.base.kind === "intrinsic") {
      // Check for as/forwardedAs usage in JSX
      const el = root.find(j.JSXElement, {
        openingElement: { name: { type: "JSXIdentifier", name: decl.localName } },
      });
      const hasAs =
        el.find(j.JSXAttribute, { name: { type: "JSXIdentifier", name: "as" } }).size() > 0;
      const hasForwardedAs =
        el.find(j.JSXAttribute, { name: { type: "JSXIdentifier", name: "forwardedAs" } }).size() >
        0;
      // Also check if props type contains as?: React.ElementType
      const propsTypeHasAs = decl.propsType && typeContainsAsElementTypeEarly(decl.propsType);
      if (hasAs || hasForwardedAs || propsTypeHasAs) {
        (decl as any).isPolymorphicIntrinsicWrapper = true;
      }
    }
  }

  // If adapter imports collide with existing local bindings, alias the adapter imports
  // and rewrite references inside stylex.create objects to use the alias.
  const isUsedOutsideStyledTemplates = (localName: string): boolean =>
    root
      .find(j.Identifier, { name: localName } as any)
      .filter((p: any) => {
        if (j(p).closest(j.ImportDeclaration).size() > 0) {
          return false;
        }
        const tagged = j(p)
          .closest(j.TaggedTemplateExpression)
          .filter((tp: any) => isStyledTag(tp.node.tag));
        if (tagged.size() > 0) {
          return false;
        }
        return true;
      })
      .size() > 0;

  const existingImportLocals = new Set<string>();
  root.find(j.ImportDeclaration).forEach((p: any) => {
    const specs = (p.node.specifiers ?? []) as any[];
    for (const s of specs) {
      if (s?.importKind === "type") {
        continue;
      }
      const local =
        s?.local?.type === "Identifier"
          ? s.local.name
          : s?.type === "ImportDefaultSpecifier" && s.local?.type === "Identifier"
            ? s.local.name
            : s?.type === "ImportNamespaceSpecifier" && s.local?.type === "Identifier"
              ? s.local.name
              : null;
      if (local && isUsedOutsideStyledTemplates(local)) {
        existingImportLocals.add(local);
      }
    }
  });

  const resolverImportAliases = new Map<string, string>();
  const usedLocals = new Set(existingImportLocals);
  const makeUniqueLocal = (base: string): string => {
    let candidate = base;
    let i = 1;
    while (usedLocals.has(candidate)) {
      candidate = `${base}${i}`;
      i += 1;
    }
    usedLocals.add(candidate);
    return candidate;
  };

  for (const imp of resolverImports.values()) {
    for (const n of imp.names ?? []) {
      const desired = n.local ?? n.imported;
      if (!desired) {
        continue;
      }
      if (existingImportLocals.has(desired)) {
        const alias = makeUniqueLocal(`${desired}Vars`);
        resolverImportAliases.set(desired, alias);
        n.local = alias;
      } else {
        usedLocals.add(desired);
      }
    }
  }

  const { emptyStyleKeys } = emitStylesAndImports({
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
    styleMerger: adapter.styleMerger,
  });
  hasChanges = true;

  if (resolverImportAliases.size > 0) {
    const renameIdentifier = (node: any, parent: any): void => {
      if (!node || typeof node !== "object") {
        return;
      }
      if (Array.isArray(node)) {
        for (const child of node) {
          renameIdentifier(child, parent);
        }
        return;
      }

      if (node.type === "Identifier") {
        const alias = resolverImportAliases.get(node.name);
        if (alias) {
          const parentNode = parent ?? null;
          const isMemberProp =
            parentNode &&
            (parentNode.type === "MemberExpression" ||
              parentNode.type === "OptionalMemberExpression") &&
            parentNode.property === node &&
            parentNode.computed === false;
          const isObjectKey =
            parentNode &&
            parentNode.type === "Property" &&
            parentNode.key === node &&
            parentNode.shorthand !== true;
          const isImport =
            parentNode &&
            (parentNode.type === "ImportSpecifier" ||
              parentNode.type === "ImportDefaultSpecifier" ||
              parentNode.type === "ImportNamespaceSpecifier");
          if (!isMemberProp && !isObjectKey && !isImport) {
            node.name = alias;
          }
        }
      }

      for (const key of Object.keys(node)) {
        if (key === "loc" || key === "comments") {
          continue;
        }
        const child = (node as any)[key];
        if (child && typeof child === "object") {
          renameIdentifier(child, node);
        }
      }
    };

    root
      .find(j.CallExpression, {
        callee: {
          type: "MemberExpression",
          object: { type: "Identifier", name: "stylex" },
          property: { type: "Identifier", name: "create" },
        },
      } as any)
      .forEach((p: any) => {
        const args = p.node.arguments ?? [];
        if (args[0]) {
          renameIdentifier(args[0], null);
        }
      });
  }

  // Remove styled declarations and rewrite JSX usages

  const wrapperNames = new Set<string>();
  // Track wrappers that have expression `as` values (not just string literals)
  // These need generic polymorphic types to accept component-specific props
  const expressionAsWrapperNames = new Set<string>();

  // Helper to check if a type member is `as?: React.ElementType`.
  const isAsElementTypeMember = (member: any): boolean => {
    if (
      member.type !== "TSPropertySignature" ||
      member.key?.type !== "Identifier" ||
      member.key.name !== "as"
    ) {
      return false;
    }
    const memberType = member.typeAnnotation?.typeAnnotation;
    if (memberType?.type === "TSTypeReference") {
      const memberTypeName = memberType.typeName;
      // Check for React.ElementType
      if (
        memberTypeName?.type === "TSQualifiedName" &&
        memberTypeName.left?.name === "React" &&
        memberTypeName.right?.name === "ElementType"
      ) {
        return true;
      }
      // Check for ElementType (without React. prefix)
      if (memberTypeName?.type === "Identifier" && memberTypeName.name === "ElementType") {
        return true;
      }
    }
    return false;
  };

  // Helper to check if a type contains `as?: React.ElementType` property.
  // This handles both inline type literals and type references.
  const typeContainsAsElementType = (typeNode: any): boolean => {
    if (!typeNode) {
      return false;
    }
    // Handle intersection types: A & B & C
    if (typeNode.type === "TSIntersectionType") {
      return (typeNode.types ?? []).some((t: any) => typeContainsAsElementType(t));
    }
    // Handle parenthesized types: (A & B)
    if (typeNode.type === "TSParenthesizedType") {
      return typeContainsAsElementType(typeNode.typeAnnotation);
    }
    // Handle type references (e.g., TextProps, React.PropsWithChildren<{...}>)
    if (typeNode.type === "TSTypeReference") {
      // Check type parameters (e.g., React.PropsWithChildren<{ as?: ... }>)
      const typeParams = typeNode.typeParameters?.params ?? [];
      for (const tp of typeParams) {
        if (typeContainsAsElementType(tp)) {
          return true;
        }
      }
      // If it's a simple identifier, look it up
      if (typeNode.typeName?.type === "Identifier") {
        const typeName = typeNode.typeName.name;
        // Look up type alias
        const typeAlias = root
          .find(j.TSTypeAliasDeclaration)
          .filter((p) => (p.node as any).id?.name === typeName);
        if (typeAlias.size() > 0) {
          return typeContainsAsElementType(typeAlias.get().node.typeAnnotation);
        }
        // Look up interface
        const iface = root
          .find(j.TSInterfaceDeclaration)
          .filter((p) => (p.node as any).id?.name === typeName);
        if (iface.size() > 0) {
          const body = iface.get().node.body?.body ?? [];
          for (const member of body) {
            if (isAsElementTypeMember(member)) {
              return true;
            }
          }
        }
      }
      return false;
    }
    // Handle type literals: { as?: React.ElementType; ... }
    if (typeNode.type === "TSTypeLiteral") {
      for (const member of typeNode.members ?? []) {
        if (isAsElementTypeMember(member)) {
          return true;
        }
      }
    }
    return false;
  };

  // Detect styled components whose props type includes `as?: React.ElementType`.
  // These need polymorphic wrapper generation.
  // Note: Don't automatically add children - they may use .attrs({ as: "element" })
  // to specify a fixed element type instead of inheriting polymorphism.
  for (const decl of styledDecls) {
    if (decl.propsType && typeContainsAsElementType(decl.propsType)) {
      wrapperNames.add(decl.localName);
    }
  }

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
      // Mark intrinsic components with polymorphic `as` usage - these pass style through
      // directly instead of merging, so they don't need the merger import
      if (decl.base.kind === "intrinsic") {
        (decl as any).isPolymorphicIntrinsicWrapper = true;
      }
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

    // Component wrappers with `.attrs({ as: "element" })` that specify a different element
    // need wrappers to render the correct element type (not the base component's element).
    if (
      decl.base.kind === "component" &&
      decl.attrsInfo?.staticAttrs?.as &&
      typeof decl.attrsInfo.staticAttrs.as === "string"
    ) {
      decl.needsWrapperComponent = true;
    }
  }

  // Helper to check if a styled decl has wrapper semantics that would be lost by flattening.
  // These are behaviors that change the rendered output beyond just styles:
  // - .attrs({ as: "element" }) - changes the rendered element type
  // - shouldForwardProp - filters which props are forwarded to the DOM
  const hasWrapperSemantics = (d: StyledDecl): boolean => {
    // .attrs({ as: "element" }) with a string value changes the rendered element
    if (d.attrsInfo?.staticAttrs?.as && typeof d.attrsInfo.staticAttrs.as === "string") {
      return true;
    }
    // shouldForwardProp filters props, so it must be preserved
    if (d.shouldForwardProp) {
      return true;
    }
    return false;
  };

  // Now that all needsWrapperComponent flags are set, flatten base components where appropriate.
  // This must happen AFTER extendsStyleKey is set (line 986) and AFTER all wrapper flags are set.
  //
  // This also handles chains of styled components (e.g., A = styled(B), B = styled(C), C = styled(div))
  // by resolving the entire chain and collecting intermediate style keys.
  //
  // IMPORTANT: Skip flattening when any intermediate component in the chain has wrapper semantics
  // (e.g., due to .attrs({ as: "button" }) or shouldForwardProp). Otherwise we would drop those
  // wrapper semantics, changing the rendered element or prop forwarding behavior.
  for (const decl of styledDecls) {
    if (decl.base.kind === "component") {
      // Resolve the chain of styled components to find the ultimate base.
      // Collect intermediate style keys along the way.
      // Also track if any intermediate component has wrapper semantics.
      const intermediateStyleKeys: string[] = [];
      let anyIntermediateHasWrapperSemantics = false;
      let currentBase: StyledDecl["base"] = decl.base;
      let resolvedBaseDecl = declByLocal.get(decl.base.ident);
      const visited = new Set<string>([decl.localName]); // Prevent infinite loops

      while (resolvedBaseDecl && currentBase.kind === "component") {
        // Avoid circular references
        if (visited.has(currentBase.ident)) {
          break;
        }
        visited.add(currentBase.ident);

        // Check if this intermediate component has wrapper semantics
        if (hasWrapperSemantics(resolvedBaseDecl)) {
          anyIntermediateHasWrapperSemantics = true;
        }

        // Add the intermediate component's style key
        intermediateStyleKeys.push(resolvedBaseDecl.styleKey);

        // Move to the next level in the chain
        currentBase = resolvedBaseDecl.base;
        if (currentBase.kind === "component") {
          resolvedBaseDecl = declByLocal.get(currentBase.ident);
        } else {
          resolvedBaseDecl = undefined;
        }
      }

      // Now currentBase is either:
      // 1. An intrinsic element (kind === "intrinsic")
      // 2. A component that's not in declByLocal (external/imported component)

      // Skip flattening if any intermediate component has wrapper semantics that would be lost
      if (anyIntermediateHasWrapperSemantics) {
        continue;
      }

      if (currentBase.kind === "intrinsic") {
        // If the immediate base component is used in JSX AND this component needs a wrapper,
        // keep as component reference so the wrapper can delegate to the base wrapper.
        // Otherwise flatten to intrinsic tag for inline style merging.
        const immediateBaseIdent = decl.base.ident;
        const baseUsedInJsx = isUsedInJsx(immediateBaseIdent);
        const shouldDelegate = baseUsedInJsx && decl.needsWrapperComponent;
        // Don't flatten if this component has .attrs({ as: "element" }) that specifies
        // a different element - it needs to render that element directly.
        const hasAsAttr =
          decl.attrsInfo?.staticAttrs?.as && typeof decl.attrsInfo.staticAttrs.as === "string";
        if (!shouldDelegate && !hasAsAttr) {
          // Flatten to intrinsic tag for inline style merging
          decl.base = { kind: "intrinsic", tagName: currentBase.tagName };
          // Add intermediate style keys (excluding the one we already set via extendsStyleKey)
          if (intermediateStyleKeys.length > 1) {
            const extras = decl.extraStyleKeys ?? [];
            // Add all intermediate keys except the first one (which is already in extendsStyleKey)
            for (const key of intermediateStyleKeys.slice(1)) {
              if (!extras.includes(key)) {
                extras.push(key);
              }
            }
            decl.extraStyleKeys = extras;
          }
        }
      } else if (currentBase.kind === "component") {
        // The ultimate base is an external component (not in declByLocal).
        // Update the base to point directly to the external component.
        const immediateBaseIdent = decl.base.ident;
        const immediateBaseDecl = declByLocal.get(immediateBaseIdent);
        const baseUsedInJsx = isUsedInJsx(immediateBaseIdent);
        const shouldDelegate = baseUsedInJsx && decl.needsWrapperComponent && immediateBaseDecl;

        if (!shouldDelegate) {
          // Flatten to the ultimate external component
          decl.base = currentBase;
          // Add intermediate style keys (all of them, since we're skipping the intermediate components)
          if (intermediateStyleKeys.length > 0) {
            const extras = decl.extraStyleKeys ?? [];
            for (const key of intermediateStyleKeys) {
              if (!extras.includes(key)) {
                extras.push(key);
              }
            }
            decl.extraStyleKeys = extras;
          }
          // Clear extendsStyleKey since we're not extending a local styled component anymore
          // (the styles are now in extraStyleKeys)
          delete decl.extendsStyleKey;
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
    if (decl.isCssHelper && exportedComponents.has(decl.localName)) {
      continue;
    }
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

    // If we emitted a wrapper for this decl, keep JSX usage as `<Decl ... />`.
    // Inline substitution (`<Decl>` -> `<tag>`) is only valid when the styled declaration
    // is removed and there is no wrapper component boundary to preserve.
    if (decl.needsWrapperComponent) {
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
                const literalValue =
                  typeof cond.value === "string" ||
                  typeof cond.value === "number" ||
                  typeof cond.value === "boolean"
                    ? cond.value
                    : String(cond.value);
                keptAttrs.unshift(
                  j.jsxAttribute(
                    j.jsxIdentifier(cond.attrName),
                    j.jsxExpressionContainer(
                      typeof literalValue === "boolean"
                        ? j.booleanLiteral(literalValue)
                        : j.literal(literalValue),
                    ),
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

        // Preserve original prop order: regular JSX attributes come first (in their original order),
        // then stylex.props(), then `style` attribute (allowing inline overrides), then spread attributes.
        // This prevents props like tabIndex from being reordered unexpectedly.
        const leading: typeof keptAttrs = [];
        const rest: typeof keptAttrs = [];
        for (const attr of keptAttrs) {
          // Spread attributes go after stylex.props
          if (attr.type === "JSXSpreadAttribute") {
            rest.push(attr);
          } else if (
            attr.type === "JSXAttribute" &&
            attr.name.type === "JSXIdentifier" &&
            attr.name.name === "style"
          ) {
            // `style` attribute goes after stylex.props to allow inline overrides
            rest.push(attr);
          } else {
            // All other JSX attributes preserve their original order before stylex.props
            leading.push(attr);
          }
        }

        // Insert {...stylex.props(styles.key)} after structural attrs like href/type/size (matches fixtures).
        const extraStyleArgs = (decl.extraStyleKeys ?? []).map((key) =>
          j.memberExpression(j.identifier(stylesIdentifier), j.identifier(key)),
        );
        const styleArgs: any[] = [
          ...(decl.extendsStyleKey
            ? [
                j.memberExpression(
                  j.identifier(stylesIdentifier),
                  j.identifier(decl.extendsStyleKey),
                ),
              ]
            : []),
          ...extraStyleArgs,
          j.memberExpression(j.identifier(stylesIdentifier), j.identifier(decl.styleKey)),
        ];

        const variantKeys = decl.variantStyleKeys ?? {};
        const variantProps = new Set(Object.keys(variantKeys));
        const keptLeadingAfterVariants: typeof leading = [];
        const styleFnPairs = decl.styleFnFromProps ?? [];
        const styleFnProps = new Set(styleFnPairs.map((p) => p.jsxProp));
        // Process variant props from leading attrs (regular JSX attributes)
        for (const attr of leading) {
          if (attr.type !== "JSXAttribute" || attr.name.type !== "JSXIdentifier") {
            keptLeadingAfterVariants.push(attr);
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
            keptLeadingAfterVariants.push(attr);
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

        // Final order: regular attrs (filtered), then stylex.props(), then spread attrs
        opening.attributes = [
          ...keptLeadingAfterVariants,
          j.jsxSpreadAttribute(
            j.callExpression(j.memberExpression(j.identifier("stylex"), j.identifier("props")), [
              ...styleArgs,
            ]),
          ),
          ...rest,
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
    styleMerger: adapter.styleMerger,
  });

  // Ensure the style merger import is present whenever the merger function is referenced.
  // This covers cases where wrapper emission uses the merger even when earlier heuristics
  // didn't mark it as required.
  if (adapter.styleMerger?.functionName && adapter.styleMerger.importSource) {
    const mergerName = adapter.styleMerger.functionName;
    const hasMergerUsage =
      root
        .find(j.Identifier, { name: mergerName } as any)
        .filter((p: any) => isIdentifierReference(p))
        .size() > 0;
    const hasMergerImport =
      root
        .find(j.ImportSpecifier, {
          imported: { type: "Identifier", name: mergerName },
        } as any)
        .size() > 0;
    const hasLocalBinding =
      root.find(j.FunctionDeclaration, { id: { name: mergerName } } as any).size() > 0 ||
      root
        .find(j.VariableDeclarator, { id: { type: "Identifier", name: mergerName } } as any)
        .size() > 0;
    if (hasMergerUsage && !hasMergerImport && !hasLocalBinding) {
      const source = adapter.styleMerger.importSource;
      if (source.kind === "specifier") {
        const decl = j.importDeclaration(
          [j.importSpecifier(j.identifier(mergerName))],
          j.literal(source.value),
        );
        const stylexImport = root.find(j.ImportDeclaration, {
          source: { value: "@stylexjs/stylex" },
        } as any);
        if (stylexImport.size() > 0) {
          stylexImport.at(stylexImport.size() - 1).insertAfter(decl);
        } else {
          const firstImport = root.find(j.ImportDeclaration).at(0);
          if (firstImport.size() > 0) {
            firstImport.insertBefore(decl);
          } else {
            root.get().node.program.body.unshift(decl);
          }
        }
        hasChanges = true;
      }
    }
  }

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

  // Extract local names of identifiers added as new imports by the adapter.
  // These should shadow old imports with the same name (e.g., when adapter replaces
  // `transitionSpeed` from `./lib/helpers` with `transitionSpeed` from `./tokens.stylex`).
  const toModuleSpecifier = (from: ImportSource): string => {
    if (from.kind === "specifier") {
      return from.value;
    }
    const baseDir = path.dirname(String(file.path));
    let rel = path.relative(baseDir, from.value);
    rel = rel.split(path.sep).join("/");
    if (!rel.startsWith(".")) {
      rel = `./${rel}`;
    }
    return rel;
  };

  const newImportLocalNames = new Set<string>();
  const newImportSourcesByLocal = new Map<string, Set<string>>();
  for (const imp of resolverImports.values()) {
    const source = toModuleSpecifier(imp.from);
    for (const n of imp.names ?? []) {
      const local = n.local ?? n.imported;
      if (local) {
        newImportLocalNames.add(local);
        const sources = newImportSourcesByLocal.get(local) ?? new Set<string>();
        sources.add(source);
        newImportSourcesByLocal.set(local, sources);
      }
    }
  }

  // Create a map from component local names to style keys for ancestor selector matching
  const componentNameToStyleKey = new Map<string, string>();
  for (const decl of styledDecls) {
    componentNameToStyleKey.set(decl.localName, decl.styleKey);
  }

  const post = postProcessTransformedAst({
    root,
    j,
    descendantOverrides,
    ancestorSelectorParents,
    componentNameToStyleKey,
    emptyStyleKeys,
    preserveReactImport,
    newImportLocalNames,
    newImportSourcesByLocal,
  });
  if (post.changed) {
    hasChanges = true;
  }

  // Re-check `css` helper usage after styled-components declarations are removed.
  // This allows us to drop the import when all references were inside styled templates.
  if (cssLocal) {
    const isStillReferenced = (): boolean =>
      root
        .find(j.Identifier, { name: cssLocal } as any)
        .filter((p: any) => isIdentifierReference(p))
        .size() > 0;

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

function cssValueToJs(value: any, important = false, propName?: string): unknown {
  if (value.kind === "static") {
    const raw = String(value.value);
    // Preserve `!important` by emitting a string value that includes it.
    // (StyleX supports `!important` in values and this is necessary to override inline styles.)
    if (important) {
      if (propName === "borderStyle") {
        return raw;
      }
      return raw.includes("!important") ? raw : `${raw} !important`;
    }

    // Try to return number if purely numeric and no unit.
    if (/^-?\d+(\.\d+)?$/.test(raw)) {
      if (propName === "flex") {
        return raw;
      }
      return Number(raw);
    }
    return raw;
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

  // Handle simple compound expressions (used for compound variant buckets), e.g.:
  //   `disabled && color === "primary"` -> `DisabledColorPrimary`
  if (trimmed.includes("&&")) {
    const parts = trimmed
      .split("&&")
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length) {
      return parts.map((p) => toSuffixFromProp(p)).join("");
    }
  }

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

function buildUnsupportedCssWarnings(usages: UnsupportedCssUsage[]): WarningLog[] {
  return usages.map((usage) => ({
    severity: "warning" as const,
    type:
      usage.reason === "call-expression"
        ? ("`css` helper usage as a function call (css(...)) is not supported" as const)
        : ("`css` helper used outside of a styled component template cannot be statically transformed" as const),
    loc: usage.loc ?? undefined,
  }));
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
