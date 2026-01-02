import type { API, FileInfo, Options } from "jscodeshift";
import type { Hook, DynamicHandler, Adapter } from "./hook.js";
import { builtinHandlers, runHandlers, normalizeHook, adapterToHook, isAdapter } from "./hook.js";
import { parseStyledTemplateLiteral } from "./styledCss.js";
import {
  cssDeclarationToStylexDeclarations,
  normalizeStylisAstToIR,
  type CssRuleIR,
} from "./ir.js";
import { getNodeLocStart } from "./utils.js";

/**
 * Warning emitted during transformation for unsupported features
 */
export interface TransformWarning {
  type: "unsupported-feature" | "dynamic-node";
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
  /**
   * Hook for customizing the transform.
   * Controls value resolution, imports, declarations, and custom handlers.
   */
  hook?: Hook;

  /**
   * @deprecated Use hook instead
   */
  adapter?: Adapter;

  /**
   * @deprecated Use hook.handlers instead
   */
  handlers?: DynamicHandler[];
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

  // Normalize hook from various input shapes (hook, legacy adapter, etc.)
  const rawHook: Hook | undefined =
    options.hook ??
    (options.adapter && isAdapter(options.adapter) ? adapterToHook(options.adapter) : undefined);
  const hook = normalizeHook(rawHook);

  // Combine user handlers with built-in handlers (user handlers run first)
  const userHandlers = options.handlers ?? hook.handlers;
  const allHandlers: DynamicHandler[] = [...userHandlers, ...builtinHandlers()];

  let hasChanges = false;

  // Find styled-components imports
  const styledImports = root.find(j.ImportDeclaration, {
    source: { value: "styled-components" },
  });

  if (styledImports.length === 0) {
    return { code: null, warnings: [] };
  }

  // Check for createGlobalStyle usage
  styledImports.forEach((importPath) => {
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
  const styledDefaultImport = styledImports
    .find(j.ImportDefaultSpecifier)
    .nodes()
    .map((n) => n.local?.name)
    .find(Boolean);

  // Handle `createGlobalStyle` minimally: remove the global style component and its usage.
  // (We still emit an unsupported-feature warning above.)
  const createGlobalStyleLocal = styledImports
    .find(j.ImportSpecifier)
    .nodes()
    .find((s) => s.imported.type === "Identifier" && s.imported.name === "createGlobalStyle")
    ?.local?.name;
  if (createGlobalStyleLocal) {
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
        // Remove the whole variable declaration statement.
        j(p).closest(j.VariableDeclaration).remove();
        hasChanges = true;
      });

    // Remove `<GlobalStyle />` usages.
    root.find(j.JSXElement).filter(isJsxElementNamed("GlobalStyle")).remove();
    root.find(j.JSXSelfClosingElement).filter(isJsxSelfClosingNamed("GlobalStyle")).remove();

    // Remove the import specifier (or whole import if now empty).
    styledImports.forEach((imp) => {
      const specs = imp.node.specifiers ?? [];
      imp.node.specifiers = specs.filter((s) => {
        if (s.type !== "ImportSpecifier") return true;
        if (s.imported.type !== "Identifier") return true;
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
        if (!init || init.type !== "CallExpression") return;
        const arg0 = init.arguments[0];
        if (!arg0 || arg0.type !== "Identifier") return;
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
        if (s.type !== "ImportSpecifier") return true;
        if (s.imported.type !== "Identifier") return true;
        if (themeProviderLocal && s.imported.name === "ThemeProvider") return false;
        if (withThemeLocal && s.imported.name === "withTheme") return false;
        return true;
      });
      if ((imp.node.specifiers?.length ?? 0) === 0) {
        j(imp).remove();
      }
    });
    hasChanges = true;
  }

  type StyledDecl = {
    localName: string;
    base: { kind: "intrinsic"; tagName: string } | { kind: "component"; ident: string };
    styleKey: string;
    extendsStyleKey?: string;
    rules: CssRuleIR[];
    templateExpressions: unknown[];
    preResolvedStyle?: Record<string, unknown>;
  };

  const styledDecls: StyledDecl[] = [];

  // Collect: const X = styled.h1`...`;
  root
    .find(j.VariableDeclarator, {
      init: { type: "TaggedTemplateExpression" },
    })
    .forEach((p) => {
      const id = p.node.id;
      const init = p.node.init;
      if (!init || init.type !== "TaggedTemplateExpression") return;
      if (id.type !== "Identifier") return;

      const tag = init.tag;
      // styled.h1
      if (
        tag.type === "MemberExpression" &&
        tag.object.type === "Identifier" &&
        tag.object.name === styledDefaultImport &&
        tag.property.type === "Identifier"
      ) {
        const localName = id.name;
        const tagName = tag.property.name;
        const template = init.quasi;
        const parsed = parseStyledTemplateLiteral(template);
        const rules = normalizeStylisAstToIR(parsed.stylisAst, parsed.slots);

        styledDecls.push({
          localName,
          base: { kind: "intrinsic", tagName },
          styleKey: toStyleKey(localName),
          rules,
          templateExpressions: parsed.slots.map((s) => s.expression),
        });
        return;
      }

      // styled.h1.attrs(... )`...` or styled.h1.withConfig(... )`...`
      if (
        tag.type === "CallExpression" &&
        tag.callee.type === "MemberExpression" &&
        tag.callee.property.type === "Identifier" &&
        (tag.callee.property.name === "attrs" || tag.callee.property.name === "withConfig") &&
        tag.callee.object.type === "MemberExpression" &&
        tag.callee.object.object.type === "Identifier" &&
        tag.callee.object.object.name === styledDefaultImport &&
        tag.callee.object.property.type === "Identifier"
      ) {
        const localName = id.name;
        const tagName = tag.callee.object.property.name;
        const template = init.quasi;
        const parsed = parseStyledTemplateLiteral(template);
        const rules = normalizeStylisAstToIR(parsed.stylisAst, parsed.slots);

        styledDecls.push({
          localName,
          base: { kind: "intrinsic", tagName },
          styleKey: toStyleKey(localName),
          rules,
          templateExpressions: parsed.slots.map((s) => s.expression),
        });
        return;
      }

      // styled(Component)
      if (
        tag.type === "CallExpression" &&
        tag.callee.type === "Identifier" &&
        tag.callee.name === styledDefaultImport &&
        tag.arguments.length === 1 &&
        tag.arguments[0]?.type === "Identifier"
      ) {
        const localName = id.name;
        const ident = tag.arguments[0].name;
        const styleKey = localName === `Styled${ident}` ? toStyleKey(ident) : toStyleKey(localName);
        const template = init.quasi;
        const parsed = parseStyledTemplateLiteral(template);
        const rules = normalizeStylisAstToIR(parsed.stylisAst, parsed.slots);

        styledDecls.push({
          localName,
          base: { kind: "component", ident },
          styleKey,
          rules,
          templateExpressions: parsed.slots.map((s) => s.expression),
        });
      }
    });

  // Collect: const X = styled.div({ ... }) / styled.div((props) => ({ ... }))
  root
    .find(j.VariableDeclarator, {
      init: { type: "CallExpression" },
    })
    .forEach((p) => {
      if (!styledDefaultImport) return;
      const id = p.node.id;
      const init = p.node.init;
      if (id.type !== "Identifier") return;
      if (!init || init.type !== "CallExpression") return;
      if (init.callee.type !== "MemberExpression") return;
      if (init.callee.object.type !== "Identifier") return;
      if (init.callee.object.name !== styledDefaultImport) return;
      if (init.callee.property.type !== "Identifier") return;

      const tagName = init.callee.property.name;
      const arg0 = init.arguments[0];
      if (!arg0) return;
      if (arg0.type !== "ObjectExpression" && arg0.type !== "ArrowFunctionExpression") return;

      const styleObj: Record<string, unknown> = {};
      const fillFromObject = (obj: any) => {
        for (const prop of obj.properties ?? []) {
          if (!prop || prop.type !== "ObjectProperty") continue;
          const key =
            prop.key.type === "Identifier"
              ? prop.key.name
              : prop.key.type === "StringLiteral"
                ? prop.key.value
                : null;
          if (!key) continue;
          const styleKey = key === "background" ? "backgroundColor" : key;
          const v: any = prop.value;
          if (v.type === "StringLiteral") styleObj[styleKey] = v.value;
          else if (v.type === "NumericLiteral") styleObj[styleKey] = v.value;
          else if (v.type === "BooleanLiteral") styleObj[styleKey] = v.value;
          else if (v.type === "NullLiteral") styleObj[styleKey] = null;
          else if (v.type === "LogicalExpression" && v.operator === "||") {
            // Prefer the fallback literal (matches common `props.x || "default"` patterns).
            const r: any = v.right;
            if (r.type === "StringLiteral") styleObj[styleKey] = r.value;
            else if (r.type === "NumericLiteral") styleObj[styleKey] = r.value;
            else styleObj[styleKey] = "";
          } else {
            styleObj[styleKey] = "";
          }
        }
      };

      if (arg0.type === "ObjectExpression") {
        fillFromObject(arg0 as any);
      } else if (arg0.type === "ArrowFunctionExpression") {
        const body: any = arg0.body;
        if (body?.type === "ObjectExpression") fillFromObject(body);
        else if (body?.type === "BlockStatement") {
          const ret = body.body.find((s: any) => s.type === "ReturnStatement") as any;
          if (ret?.argument?.type === "ObjectExpression") fillFromObject(ret.argument);
        }
      }

      styledDecls.push({
        localName: id.name,
        base: { kind: "intrinsic", tagName },
        styleKey: toStyleKey(id.name),
        rules: [],
        templateExpressions: [],
        preResolvedStyle: styleObj,
      });
    });

  // If we didn't find any styled declarations but performed other edits (e.g. createGlobalStyle / ThemeProvider),
  // we'll still emit output without injecting StyleX styles.
  if (styledDecls.length === 0) {
    return {
      code: hasChanges
        ? formatOutput(
            root.toSource({
              quote: "double",
              trailingComma: true,
              reuseWhitespace: false,
            }),
          )
        : null,
      warnings,
    };
  }

  // Resolve dynamic nodes via plugins (currently only used to decide bail vs convert).
  const resolvedStyleObjects = new Map<string, Record<string, unknown>>();
  for (const decl of styledDecls) {
    if (decl.preResolvedStyle) {
      resolvedStyleObjects.set(decl.styleKey, decl.preResolvedStyle);
      continue;
    }
    const styleObj: Record<string, unknown> = {};
    const perPropPseudo: Record<string, Record<string, unknown>> = {};
    const perPropMedia: Record<string, Record<string, unknown>> = {};
    const nestedSelectors: Record<string, Record<string, unknown>> = {};

    const baseRule = decl.rules.find((r) => r.selector === "&" && r.atRuleStack.length === 0);
    if (baseRule) {
      for (const d of baseRule.declarations) {
        for (const out of cssDeclarationToStylexDeclarations(d)) {
          styleObj[out.prop] = cssValueToJs(out.value);
        }
      }
    }

    for (const rule of decl.rules) {
      if (rule.selector === "&" && rule.atRuleStack.length === 0) continue;

      // Media query at-rules: represent as prop maps `prop: { default, "@media ...": value }`
      const media = rule.atRuleStack.find((a) => a.startsWith("@media"));

      // Simple pseudo rules: &:hover, &:focus
      const pseudo = parseSimplePseudo(rule.selector);

      // Pseudo element rules: &::before, &::placeholder
      const pseudoElement = parsePseudoElement(rule.selector);

      for (const d of rule.declarations) {
        // Dynamic declarations are not yet emitted; bail on those blocks for now.
        if (d.value.kind === "interpolated") {
          const slotPart = d.value.parts.find((p) => p.kind === "slot");
          const slotId = slotPart && slotPart.kind === "slot" ? slotPart.slotId : 0;
          const loc = getNodeLocStart(decl.templateExpressions[slotId] as any);

          const res = runHandlers(
            allHandlers,
            {
              slotId,
              expr: decl.templateExpressions[slotId],
              css: {
                kind: "declaration",
                selector: rule.selector,
                atRuleStack: rule.atRuleStack,
                property: d.property,
                valueRaw: d.valueRaw,
              },
              component:
                decl.base.kind === "intrinsic"
                  ? {
                      localName: decl.localName,
                      base: "intrinsic",
                      tagOrIdent: decl.base.tagName,
                    }
                  : {
                      localName: decl.localName,
                      base: "component",
                      tagOrIdent: decl.base.ident,
                    },
              usage: { jsxUsages: 0, hasPropsSpread: false },
              ...(loc ? { loc } : {}),
            },
            {
              api,
              filePath: file.path,
              resolveValue: hook.resolveValue,
              warn: (w) => {
                const loc = w.loc;
                warnings.push({
                  type: "dynamic-node",
                  feature: w.feature,
                  message: w.message,
                  ...(loc?.line != null ? { line: loc.line } : {}),
                  ...(loc?.column != null ? { column: loc.column } : {}),
                });
              },
            },
          );

          if (res.kind === "resolved" && res.result.type === "resolvedValue") {
            // Treat as direct JS expression
            for (const out of cssDeclarationToStylexDeclarations(d)) {
              styleObj[out.prop] = j.template.expression`${j.identifier(res.result.value)}` as any;
            }
            continue;
          }

          warnings.push({
            type: "dynamic-node",
            feature: "dynamic-interpolation",
            message: `Unresolved interpolation for ${decl.localName}; dropping this declaration (manual follow-up required).`,
          });
          continue;
        }

        for (const out of cssDeclarationToStylexDeclarations(d)) {
          let value = cssValueToJs(out.value);
          // CSS `content` values must remain quoted. Fixtures expect `"..."` inside the string.
          if (out.prop === "content" && typeof value === "string") {
            const m = value.match(/^['"]([\s\S]*)['"]$/);
            if (m) {
              value = `"${m[1]}"`;
            } else if (!value.startsWith('"') && !value.endsWith('"')) {
              value = `"${value}"`;
            }
          }

          if (media) {
            perPropMedia[out.prop] ??= {};
            const existing = perPropMedia[out.prop]!;
            if (!("default" in existing)) {
              existing.default = styleObj[out.prop] ?? null;
            }
            existing[media] = value;
            continue;
          }

          if (pseudo) {
            perPropPseudo[out.prop] ??= {};
            const existing = perPropPseudo[out.prop]!;
            if (!("default" in existing)) {
              existing.default = styleObj[out.prop] ?? null;
            }
            existing[pseudo] = value;
            continue;
          }

          if (pseudoElement) {
            nestedSelectors[pseudoElement] ??= {};
            nestedSelectors[pseudoElement]![out.prop] = value;
            continue;
          }

          // Fallback: store as-is (later we’ll add more selector handling)
          styleObj[out.prop] = value;
        }
      }
    }

    for (const [prop, map] of Object.entries(perPropPseudo)) {
      styleObj[prop] = map;
    }
    for (const [prop, map] of Object.entries(perPropMedia)) {
      styleObj[prop] = map;
    }
    for (const [sel, obj] of Object.entries(nestedSelectors)) {
      styleObj[sel] = obj;
    }

    resolvedStyleObjects.set(decl.styleKey, styleObj);
  }

  // Remove styled-components import(s)
  styledImports.remove();

  // Insert stylex import at top (after existing imports, before code)
  const hasStylexImport =
    root.find(j.ImportDeclaration, { source: { value: "@stylexjs/stylex" } }).size() > 0;
  if (!hasStylexImport) {
    const firstImport = root.find(j.ImportDeclaration).at(0);
    const stylexImport = j.importDeclaration(
      [j.importNamespaceSpecifier(j.identifier("stylex"))],
      j.literal("@stylexjs/stylex"),
    );
    if (firstImport.size() > 0) {
      firstImport.insertBefore(stylexImport);
    } else {
      root.get().node.program.body.unshift(stylexImport);
    }
  }

  // Insert `const styles = stylex.create(...)` near top (after imports)
  const stylesDecl = j.variableDeclaration("const", [
    j.variableDeclarator(
      j.identifier("styles"),
      j.callExpression(j.memberExpression(j.identifier("stylex"), j.identifier("create")), [
        j.objectExpression(
          [...resolvedStyleObjects.entries()].map(([k, v]) =>
            j.property("init", j.identifier(k), objectToAst(j, v)),
          ),
        ),
      ]),
    ),
  ]);
  const lastImport = root.find(j.ImportDeclaration).at(-1);
  if (lastImport.size() > 0) {
    lastImport.insertAfter(stylesDecl);
  } else {
    root.get().node.program.body.unshift(stylesDecl);
  }

  // Remove styled declarations and rewrite JSX usages
  // Build a quick lookup for extension: if styled(BaseStyled) where BaseStyled is in decl map.
  const declByLocal = new Map(styledDecls.map((d) => [d.localName, d]));
  for (const decl of styledDecls) {
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
          if (attr.type !== "JSXAttribute") continue;
          if (attr.name.type !== "JSXIdentifier") continue;
          const attrName = attr.name.name;
          if (attrName !== "as" && attrName !== "forwardedAs") continue;
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
        if (closing) closing.name = j.jsxIdentifier(finalTag);

        const keptAttrs = (opening.attributes ?? []).filter((attr) => {
          if (attr.type !== "JSXAttribute") return true;
          if (attr.name.type !== "JSXIdentifier") return true;
          return attr.name.name !== "as" && attr.name.name !== "forwardedAs";
        });

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
        ]);
        const leading: typeof keptAttrs = [];
        const rest: typeof keptAttrs = [];
        for (const attr of keptAttrs) {
          if (attr.type === "JSXAttribute" && attr.name.type === "JSXIdentifier") {
            if (leadingNames.has(attr.name.name)) {
              leading.push(attr);
              continue;
            }
          }
          rest.push(attr);
        }

        // Insert {...stylex.props(styles.key)} after structural attrs like href/type/size (matches fixtures).
        const styleArgs = [
          ...(decl.extendsStyleKey
            ? [j.memberExpression(j.identifier("styles"), j.identifier(decl.extendsStyleKey))]
            : []),
          j.memberExpression(j.identifier("styles"), j.identifier(decl.styleKey)),
        ];
        opening.attributes = [
          ...leading,
          j.jsxSpreadAttribute(
            j.callExpression(j.memberExpression(j.identifier("stylex"), j.identifier("props")), [
              ...styleArgs,
            ]),
          ),
          ...rest,
        ];
      });
  }

  // Clean up empty variable declarations (e.g. `const X;`)
  root.find(j.VariableDeclaration).forEach((p) => {
    if (p.node.declarations.length === 0) {
      j(p).remove();
    }
  });

  hasChanges = true;
  // If the file references `React` (types or values) but doesn't import it, add `import React from "react";`
  const hasReactImport =
    root
      .find(j.ImportDeclaration, { source: { value: "react" } })
      .find(j.ImportDefaultSpecifier)
      .size() > 0;
  const usesReactIdent = root.find(j.Identifier, { name: "React" }).size() > 0;
  if (usesReactIdent && !hasReactImport) {
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
  }

  return {
    code: hasChanges
      ? formatOutput(
          root.toSource({
            quote: "double",
            trailingComma: true,
            reuseWhitespace: false,
          }),
        )
      : null,
    warnings,
  };
}

// Re-export hook types for convenience
export type {
  Hook,
  ValueContext,
  DynamicHandler,
  DynamicNode,
  HandlerContext,
  HandlerResult,
  // Backwards compatibility
  Adapter,
  AdapterContext,
  DynamicNodePlugin,
  PluginContext,
  PluginResult,
} from "./hook.js";
export { defaultHook, defaultResolveValue, defineHook, defaultAdapter } from "./hook.js";

function toStyleKey(name: string): string {
  return name.charAt(0).toLowerCase() + name.slice(1);
}

function objectToAst(j: API["jscodeshift"], obj: Record<string, unknown>): any {
  const props: any[] = Object.entries(obj).map(([key, value]) => {
    const keyNode =
      /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) &&
      !key.startsWith(":") &&
      !key.startsWith("@") &&
      !key.startsWith("::")
        ? j.identifier(key)
        : j.literal(key);
    return j.property(
      "init",
      keyNode as any,
      value && typeof value === "object" && !isAstNode(value)
        ? objectToAst(j, value as Record<string, unknown>)
        : literalToAst(j, value),
    );
  });
  return j.objectExpression(props);
}

function literalToAst(j: API["jscodeshift"], value: unknown): any {
  if (isAstNode(value)) return value;
  if (value === null) return j.literal(null);
  if (typeof value === "string") return j.literal(value);
  if (typeof value === "number") return j.literal(value);
  if (typeof value === "boolean") return j.literal(value);
  // fallback
  return j.literal(String(value));
}

function isAstNode(v: unknown): v is { type: string } {
  return !!v && typeof v === "object" && typeof (v as any).type === "string";
}

function cssValueToJs(value: any): unknown {
  if (value.kind === "static") {
    // Try to return number if purely numeric and no unit.
    if (/^-?\d+(\.\d+)?$/.test(value.value)) {
      return Number(value.value);
    }
    return value.value;
  }
  // interpolated values are handled earlier for now
  return "";
}

function parseSimplePseudo(selector: string): string | null {
  // "&:hover" -> ":hover"
  const m = selector.match(/^&(:[a-zA-Z-]+)$/);
  return m ? m[1]! : null;
}

function parsePseudoElement(selector: string): string | null {
  const m = selector.match(/^&(::[a-zA-Z-]+)$/);
  return m ? m[1]! : null;
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

function formatOutput(code: string): string {
  // Recast sometimes inserts blank lines between object properties when values are multiline.
  // Our fixtures are formatted without those blank lines; normalize conservatively.
  let out = code.replace(
    /(\n\s*\},)\n\n(\s+(?:[a-zA-Z_$][a-zA-Z0-9_$]*|["'].*?["']|::[a-zA-Z-]+|@[a-zA-Z-]+|:[a-zA-Z-]+)\s*:)/g,
    "$1\n$2",
  );
  // General: remove blank lines after commas (prettier-style objects don't use them).
  out = out.replace(/,\n\n(\s+(?:[a-zA-Z_$]|["']|::|@|:))/g, ",\n$1");
  // Normalize `content` strings: prefer `'\"...\"'` form (matches fixtures) over escaped double-quotes.
  // Case 1: content: "\"X\""  (double-quoted with escapes)
  out = out.replace(/content:\s+"\\"([\s\S]*?)\\""/g, "content: '\"$1\"'");
  // Case 2: content: \"'X'\"   (double-quoted string that includes single quotes)
  out = out.replace(/content:\s+"'\s*([\s\S]*?)\s*'"/g, "content: '\"$1\"'");
  // Normalize EOF: trim all trailing whitespace, then ensure a single trailing newline.
  return out.trimEnd() + "\n";
}
