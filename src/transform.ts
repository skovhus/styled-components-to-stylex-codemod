import type {
  API,
  FileInfo,
  Options,
  Collection,
  JSCodeshift,
} from "jscodeshift";
import type {
  VariableDeclaration,
  CallExpression,
  TaggedTemplateExpression,
  TemplateLiteral,
  Identifier,
  Expression,
  JSXAttribute,
  ObjectProperty,
  MemberExpression,
  ObjectExpression,
} from "jscodeshift";
import type {
  Adapter,
  DynamicNodeContext,
  DynamicNodeDecision,
} from "./adapter.js";
import {
  defaultAdapter,
  executeDynamicNodeHandlers,
  getFallbackDecision,
  defaultHandlers,
  VAR_REF_PREFIX,
  TEMPLATE_LITERAL_PREFIX,
} from "./adapter.js";
import {
  parseStyledCSS,
  extractDeclarations,
  extractInterpolationIndices,
  type InterpolationLocation,
} from "./css-parser.js";
import {
  cssRuleToStyleX,
  stripImportant,
  toPropertyLevelConditionals,
  normalizePropertyName,
  convertValue,
  type StyleXObject,
  type ConversionContext,
} from "./css-to-stylex.js";
import {
  classifyInterpolation,
  createClassificationContext,
  type ClassifiedInterpolation,
} from "./interpolation.js";

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
  /** Adapter for transforming theme values (defaults to cssVariablesAdapter) */
  adapter?: Adapter;
}

/**
 * Parsed attrs configuration
 */
interface AttrsConfig {
  staticAttrs: Record<string, unknown>;
  dynamicAttrs: Array<{
    prop: string;
    expr: string;
    conditionProp?: string;
    truthyValue?: string | number;
  }>;
}

/**
 * Transient prop information for wrapper generation
 */
interface TransientPropInfo {
  name: string;
  type: string;
  optional: boolean;
  truthyStyleName?: string;
  falsyStyleName?: string;
}

/**
 * Collected style information for a component
 */
interface StyleInfo {
  componentName: string;
  baseElement: string;
  styles: StyleXObject;
  extraStyles: Map<string, StyleXObject>;
  variantStyles: Map<string, StyleXObject>;
  dynamicFns: Map<
    string,
    { paramName: string; paramType: string | undefined; styles: StyleXObject }
  >;
  isExtending: boolean;
  extendsFrom: string | undefined;
  attrsConfig: AttrsConfig | undefined;
  jsxRewriteRules: Array<
    | { type: "direct-children"; styleNames: string[] }
    | { type: "direct-children-except-first"; styleNames: string[] }
    | {
        type: "descendant-styled-component";
        /** Styled-component identifier (e.g., Icon) to match in JSX */
        targetComponentName: string;
        /** Extra style entry to apply (e.g., iconInButton) */
        styleName: string;
      }
  >;
  /** Transient props that need wrapper generation */
  transientProps: TransientPropInfo[];
  /** Whether this component needs a wrapper function */
  needsWrapper: boolean;
  /** Whether this component must include stylex.defaultMarker() so stylex.when.ancestor() works */
  needsDefaultMarker: boolean;
}

/**
 * Transform styled-components to StyleX
 */
export default function transform(
  file: FileInfo,
  api: API,
  options: TransformOptions
): string | null {
  const result = transformWithWarnings(file, api, options);

  // Log warnings to console
  for (const warning of result.warnings) {
    const location = warning.line
      ? ` (${file.path}:${warning.line}:${warning.column ?? 0})`
      : ` (${file.path})`;
    console.warn(
      `[styled-components-to-stylex] Warning${location}: ${warning.message}`
    );
  }

  return result.code;
}

/**
 * Transform with detailed warnings returned (for testing)
 */
export function transformWithWarnings(
  file: FileInfo,
  api: API,
  options: TransformOptions
): TransformResult {
  const j = api.jscodeshift;
  const root = j(file.source);
  const warnings: TransformWarning[] = [];

  // Use provided adapter, ensuring handlers are always present
  const providedAdapter = options.adapter ?? defaultAdapter;
  const adapter: Adapter = {
    ...providedAdapter,
    // Always include default handlers if none provided
    handlers: providedAdapter.handlers?.length
      ? providedAdapter.handlers
      : defaultHandlers,
  };

  // Find styled-components imports
  const styledImports = root.find(j.ImportDeclaration, {
    source: { value: "styled-components" },
  });

  if (styledImports.length === 0) {
    return { code: null, warnings: [] };
  }

  // Collect known identifiers
  const keyframesIdentifiers = new Set<string>();
  const styledComponentIdentifiers = new Set<string>();
  const cssHelperIdentifiers = new Set<string>(); // The import name (e.g., 'css')
  const cssHelperVariables = new Set<string>(); // Variable names assigned from css`` (e.g., 'truncate')
  const createGlobalStyleIdentifiers = new Set<string>();
  const globalStyleDeclarations = new Set<string>(); // Variable names using createGlobalStyle

  // Track what's imported from styled-components
  styledImports.forEach((importPath) => {
    const specifiers = importPath.node.specifiers ?? [];
    for (const specifier of specifiers) {
      if (specifier.type === "ImportSpecifier") {
        const imported = specifier.imported;
        if (imported.type === "Identifier") {
          if (imported.name === "keyframes") {
            // Track keyframes declarations later
          } else if (imported.name === "css") {
            const localName =
              specifier.local?.type === "Identifier"
                ? specifier.local.name
                : imported.name;
            cssHelperIdentifiers.add(localName);
          } else if (imported.name === "createGlobalStyle") {
            const localName =
              specifier.local?.type === "Identifier"
                ? specifier.local.name
                : imported.name;
            createGlobalStyleIdentifiers.add(localName);
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
      }
    }
  });

  // Find keyframes declarations
  root
    .find(j.VariableDeclarator, {
      init: { type: "TaggedTemplateExpression" },
    })
    .forEach((path) => {
      const init = path.node.init as TaggedTemplateExpression;
      if (init.tag.type === "Identifier" && init.tag.name === "keyframes") {
        if (path.node.id.type === "Identifier") {
          keyframesIdentifiers.add(path.node.id.name);
        }
      }
      // Track createGlobalStyle declarations
      if (
        init.tag.type === "Identifier" &&
        createGlobalStyleIdentifiers.has(init.tag.name)
      ) {
        if (path.node.id.type === "Identifier") {
          globalStyleDeclarations.add(path.node.id.name);
        }
      }
      // Track css`` helper variable names (e.g., const truncate = css`...`)
      if (
        init.tag.type === "Identifier" &&
        cssHelperIdentifiers.has(init.tag.name)
      ) {
        if (path.node.id.type === "Identifier") {
          cssHelperVariables.add(path.node.id.name);
        }
      }
    });

  // Find styled component declarations
  root.find(j.VariableDeclarator).forEach((path) => {
    const init = path.node.init;
    if (isStyledComponentDeclaration(init)) {
      if (path.node.id.type === "Identifier") {
        styledComponentIdentifiers.add(path.node.id.name);
      }
    }
  });

  // Check for patterns that require warnings
  detectWarningPatterns(j, root, warnings);

  // Create classification context
  const getSource = (node: Expression): string => {
    // Extract source from location info if available
    const start = (node as unknown as { start?: number }).start;
    const end = (node as unknown as { end?: number }).end;

    // Use the original source substring if we have position info
    if (typeof start === "number" && typeof end === "number") {
      return file.source.slice(start, end);
    }

    // Fallback: try to reconstruct from node structure
    if (node.type === "Identifier") {
      return (node as unknown as { name: string }).name;
    }

    return "[complex expression]";
  };
  const classificationCtx = createClassificationContext(
    keyframesIdentifiers,
    styledComponentIdentifiers,
    cssHelperVariables, // Use variable names, not import names
    getSource
  );

  // Collect all style infos
  const styleInfos: StyleInfo[] = [];
  const additionalImports: Set<string> = new Set();
  let hasChanges = false;

  // Process styled component declarations
  root.find(j.VariableDeclarator).forEach((path) => {
    const init = path.node.init;
    if (!isStyledComponentDeclaration(init)) {
      return;
    }

    const componentName =
      path.node.id.type === "Identifier"
        ? path.node.id.name
        : "UnnamedComponent";

    const styleInfo = processStyledComponent(
      j,
      init as TaggedTemplateExpression | CallExpression,
      componentName,
      file.path,
      classificationCtx,
      adapter,
      warnings,
      additionalImports
    );

    if (styleInfo) {
      styleInfos.push(styleInfo);
      styledComponentIdentifiers.add(componentName);
    }
  });

  // Process keyframes declarations
  const keyframesStyles: Map<string, StyleXObject> = new Map();

  // Process CSS helpers (css`...`) and convert to StyleX objects
  // Store parsed helpers so they can be inlined when interpolated
  const cssHelperStyles: Map<string, StyleXObject> = new Map();

  root
    .find(j.VariableDeclarator, {
      init: { type: "TaggedTemplateExpression" },
    })
    .forEach((path) => {
      const init = path.node.init as TaggedTemplateExpression;
      if (init.tag.type === "Identifier" && init.tag.name === "keyframes") {
        const name =
          path.node.id.type === "Identifier" ? path.node.id.name : "animation";
        const keyframeStyles = processKeyframes(j, init, classificationCtx);
        if (keyframeStyles) {
          keyframesStyles.set(name, keyframeStyles);
        }
      }
      // Process css`` helpers
      if (
        init.tag.type === "Identifier" &&
        cssHelperIdentifiers.has(init.tag.name)
      ) {
        const name =
          path.node.id.type === "Identifier" ? path.node.id.name : "cssHelper";
        const parsed = parseStyledCSS(
          init.quasi.quasis,
          init.quasi.expressions as Expression[]
        );
        const rules = extractDeclarations(parsed.root);
        if (rules.length > 0) {
          const mainRule = rules[0]!;
          const helperStyles = cssRuleToStyleX(mainRule, { adapter });
          cssHelperStyles.set(name, toPropertyLevelConditionals(helperStyles));
        }
      }
    });

  // Generate output if we have styles to transform
  if (styleInfos.length > 0 || keyframesStyles.size > 0) {
    hasChanges = true;

    // Generate stylex.create() and stylex.keyframes() calls
    const stylexCode = generateStyleXCode(
      j,
      styleInfos,
      keyframesStyles,
      adapter,
      cssHelperStyles
    );

    // Remove styled-components import and add stylex import
    styledImports.remove();

    // Add stylex import at the top
    const stylexImport = j.importDeclaration(
      [j.importNamespaceSpecifier(j.identifier("stylex"))],
      j.literal("@stylexjs/stylex")
    );

    // Find the first import or the start of the file
    const firstImport = root.find(j.ImportDeclaration).at(0);
    if (firstImport.length > 0) {
      firstImport.insertBefore(stylexImport);
    } else {
      root.get().node.program.body.unshift(stylexImport);
    }

    // Add adapter imports
    for (const importStatement of additionalImports) {
      const parsed = j(importStatement);
      const importDecl = parsed.find(j.ImportDeclaration).at(0);
      if (importDecl.length > 0) {
        root
          .find(j.ImportDeclaration)
          .at(-1)
          .insertAfter(importDecl.nodes()[0]!);
      }
    }

    // Add adapter imports from getImports()
    for (const importStatement of adapter.getImports()) {
      const parsed = j(importStatement);
      const importDecl = parsed.find(j.ImportDeclaration).at(0);
      if (importDecl.length > 0) {
        root
          .find(j.ImportDeclaration)
          .at(-1)
          .insertAfter(importDecl.nodes()[0]!);
      }
    }

    // Remove styled component variable declarations
    root.find(j.VariableDeclaration).forEach((path) => {
      const declarators = path.node.declarations;
      const remainingDeclarators = declarators.filter((d) => {
        if (d.type === "VariableDeclarator" && d.id.type === "Identifier") {
          // Remove styled components
          if (styledComponentIdentifiers.has(d.id.name)) {
            return false;
          }
          // Remove keyframes
          if (keyframesIdentifiers.has(d.id.name)) {
            return false;
          }
          // Don't remove css helper variable declarations - they are regenerated above
          // But we do remove them here because they'll be replaced with the converted version
          if (cssHelperStyles.has(d.id.name)) {
            return false;
          }
          // Remove createGlobalStyle declarations
          if (globalStyleDeclarations.has(d.id.name)) {
            return false;
          }
        }
        return true;
      });

      if (remainingDeclarators.length === 0) {
        j(path).remove();
      } else if (remainingDeclarators.length < declarators.length) {
        path.node.declarations = remainingDeclarators;
      }
    });

    // Remove defaultProps assignments
    root.find(j.ExpressionStatement).forEach((path) => {
      const expr = path.node.expression;
      if (
        expr.type === "AssignmentExpression" &&
        expr.left.type === "MemberExpression" &&
        expr.left.property.type === "Identifier" &&
        expr.left.property.name === "defaultProps"
      ) {
        j(path).remove();
      }
    });

    // Insert styles declarations after imports (stylexCode is an array)
    const lastImport = root.find(j.ImportDeclaration).at(-1);
    if (lastImport.length > 0) {
      // Insert in reverse order so they appear in correct order
      for (let i = stylexCode.length - 1; i >= 0; i--) {
        lastImport.insertAfter(stylexCode[i]!);
      }
    } else {
      // Insert at beginning in correct order
      for (let i = stylexCode.length - 1; i >= 0; i--) {
        root.get().node.program.body.unshift(stylexCode[i]!);
      }
    }

    // Generate wrapper components for those that need them
    const wrapperComponents = generateWrapperComponents(j, styleInfos);

    // Insert wrapper components after styles
    if (wrapperComponents.length > 0) {
      // Find the styles declaration
      root.find(j.VariableDeclaration).forEach((path) => {
        const decl = path.node.declarations[0];
        if (
          decl?.type === "VariableDeclarator" &&
          decl.id.type === "Identifier" &&
          decl.id.name === "styles"
        ) {
          // Insert wrappers after styles
          for (let i = wrapperComponents.length - 1; i >= 0; i--) {
            j(path).insertAfter(wrapperComponents[i]!);
          }
        }
      });
    }

    // Transform JSX usage
    transformJSXUsage(
      j,
      root,
      styleInfos,
      styledComponentIdentifiers,
      file.source
    );

    // Remove JSX elements using createGlobalStyle declarations (e.g., <GlobalStyles />)
    if (globalStyleDeclarations.size > 0) {
      root.find(j.JSXElement).forEach((path) => {
        const opening = path.node.openingElement;
        if (
          opening.name.type === "JSXIdentifier" &&
          globalStyleDeclarations.has(opening.name.name)
        ) {
          j(path).remove();
        }
      });
    }
  }

  let code: string | null = null;
  if (hasChanges) {
    code = root.toSource();
    // Remove spurious blank lines that jscodeshift/recast inserts between object properties
    code = code
      .replace(/\n\n+/g, "\n\n")
      .replace(/{\n\n/g, "{\n")
      .replace(/,\n\n(\s*["\w])/g, ",\n$1");
  }

  return {
    code,
    warnings,
  };
}

/**
 * Check if an expression is a styled component declaration
 */
function isStyledComponentDeclaration(
  expr: Expression | null | undefined
): boolean {
  if (!expr) return false;

  // styled.div`...` or styled(Component)`...`
  if (expr.type === "TaggedTemplateExpression") {
    const taggedExpr = expr as TaggedTemplateExpression;
    const tag = taggedExpr.tag;
    // styled.div
    if (
      tag.type === "MemberExpression" &&
      tag.object.type === "Identifier" &&
      tag.object.name === "styled"
    ) {
      return true;
    }
    // styled(Component)
    if (
      tag.type === "CallExpression" &&
      tag.callee.type === "Identifier" &&
      tag.callee.name === "styled"
    ) {
      return true;
    }
    // styled.div.attrs(...)`...` or styled.div.withConfig(...)`...`
    if (tag.type === "CallExpression") {
      const callee = tag.callee;
      if (
        callee.type === "MemberExpression" &&
        callee.property.type === "Identifier"
      ) {
        if (
          callee.property.name === "attrs" ||
          callee.property.name === "withConfig"
        ) {
          // Check if the object is styled.element or styled(Component)
          return isStyledBase(callee.object as Expression);
        }
      }
    }
  }

  // styled.div({...}) or styled.div((props) => ({...})) - object syntax
  if (expr.type === "CallExpression") {
    const callExpr = expr as CallExpression;
    const callee = callExpr.callee;

    // styled.div({...})
    if (
      callee.type === "MemberExpression" &&
      callee.object.type === "Identifier" &&
      callee.object.name === "styled" &&
      callee.property.type === "Identifier"
    ) {
      const arg = callExpr.arguments[0];
      // Check if argument is object literal or arrow function
      if (
        arg?.type === "ObjectExpression" ||
        arg?.type === "ArrowFunctionExpression" ||
        arg?.type === "FunctionExpression"
      ) {
        return true;
      }
    }

    // styled(Component)({...})
    if (callee.type === "CallExpression") {
      const innerCallee = callee.callee;
      if (innerCallee.type === "Identifier" && innerCallee.name === "styled") {
        const arg = callExpr.arguments[0];
        if (
          arg?.type === "ObjectExpression" ||
          arg?.type === "ArrowFunctionExpression" ||
          arg?.type === "FunctionExpression"
        ) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Check if an expression is a styled base (styled.div or styled(Component))
 */
function isStyledBase(expr: Expression | null | undefined): boolean {
  if (!expr) return false;

  // styled.div
  if (expr.type === "MemberExpression") {
    const memberExpr = expr as MemberExpression;
    if (
      memberExpr.object.type === "Identifier" &&
      memberExpr.object.name === "styled"
    ) {
      return true;
    }
  }

  // styled(Component)
  if (expr.type === "CallExpression") {
    const callExpr = expr as CallExpression;
    if (
      callExpr.callee.type === "Identifier" &&
      callExpr.callee.name === "styled"
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Process a styled component declaration
 */
function processStyledComponent(
  j: JSCodeshift,
  expr: TaggedTemplateExpression | CallExpression,
  componentName: string,
  filePath: string,
  classificationCtx: ReturnType<typeof createClassificationContext>,
  adapter: Adapter,
  warnings: TransformWarning[],
  additionalImports: Set<string>
): StyleInfo | null {
  let templateLiteral: TemplateLiteral | null = null;
  let styleObject: Expression | null = null;
  let baseElement = "div";
  let isExtending = false;
  let extendsFrom: string | undefined;
  let attrsConfig: AttrsConfig | undefined;
  let hasDynamicStyleFn = false;
  let dynamicStyleParam: string | undefined;

  // Extract template literal/style object and base element
  if (expr.type === "TaggedTemplateExpression") {
    templateLiteral = expr.quasi;

    const tag = expr.tag;
    if (tag.type === "MemberExpression" && tag.property.type === "Identifier") {
      baseElement = tag.property.name;
    } else if (tag.type === "CallExpression") {
      // styled(Component) or styled.div.attrs(...)
      if (tag.callee.type === "Identifier" && tag.callee.name === "styled") {
        // styled(Component)
        const arg = tag.arguments[0];
        if (arg?.type === "Identifier") {
          isExtending = true;
          extendsFrom = arg.name;
          baseElement = "div"; // Will be determined by the extended component
        }
      } else if (tag.callee.type === "MemberExpression") {
        // styled.div.attrs(...) or styled(Component).attrs(...) or .withConfig(...)
        const memberExpr = tag.callee;
        if (
          memberExpr.property.type === "Identifier" &&
          (memberExpr.property.name === "attrs" ||
            memberExpr.property.name === "withConfig")
        ) {
          // Extract attrs config if present
          if (memberExpr.property.name === "attrs" && tag.arguments[0]) {
            attrsConfig = parseAttrsConfig(j, tag.arguments[0] as Expression);
          }
          // withConfig is handled by just ignoring it and processing styles normally

          // Get the base from the object
          const obj = memberExpr.object;
          if (
            obj.type === "MemberExpression" &&
            obj.property.type === "Identifier"
          ) {
            baseElement = obj.property.name;
          } else if (obj.type === "CallExpression") {
            const innerCallee = obj.callee;
            if (
              innerCallee.type === "Identifier" &&
              innerCallee.name === "styled"
            ) {
              const arg = obj.arguments[0];
              if (arg?.type === "Identifier") {
                isExtending = true;
                extendsFrom = arg.name;
              }
            }
          }
        }
      }
    }
  } else if (expr.type === "CallExpression") {
    // Object syntax: styled.div({...}) or styled.div((props) => ({...}))
    const callExpr = expr;
    const callee = callExpr.callee;

    if (callee.type === "MemberExpression") {
      // styled.div({...})
      if (
        callee.object.type === "Identifier" &&
        callee.object.name === "styled" &&
        callee.property.type === "Identifier"
      ) {
        baseElement = callee.property.name;
        const arg = callExpr.arguments[0];
        if (arg?.type === "ObjectExpression") {
          styleObject = arg;
        } else if (
          arg?.type === "ArrowFunctionExpression" ||
          arg?.type === "FunctionExpression"
        ) {
          hasDynamicStyleFn = true;
          // Extract param name
          const param = arg.params[0];
          if (param?.type === "Identifier") {
            dynamicStyleParam = param.name;
          }
          // Get the body (should be an object expression or block with return)
          if (arg.body.type === "ObjectExpression") {
            styleObject = arg.body;
          } else if (arg.body.type === "BlockStatement") {
            // Look for return statement
            for (const stmt of arg.body.body) {
              if (
                stmt.type === "ReturnStatement" &&
                stmt.argument?.type === "ObjectExpression"
              ) {
                styleObject = stmt.argument;
                break;
              }
            }
          }
        }
      }
    } else if (callee.type === "CallExpression") {
      // styled(Component)({...})
      const innerCallee = callee.callee;
      if (innerCallee.type === "Identifier" && innerCallee.name === "styled") {
        const componentArg = callee.arguments[0];
        if (componentArg?.type === "Identifier") {
          isExtending = true;
          extendsFrom = componentArg.name;
        }
        const arg = callExpr.arguments[0];
        if (arg?.type === "ObjectExpression") {
          styleObject = arg;
        }
      }
    }
  }

  // Process based on what we found
  let styles: StyleXObject = {};
  const extraStyles = new Map<string, StyleXObject>();
  const jsxRewriteRules: StyleInfo["jsxRewriteRules"] = [];
  const variantStyles = new Map<string, StyleXObject>();
  const dynamicFns = new Map<
    string,
    { paramName: string; paramType: string | undefined; styles: StyleXObject }
  >();
  let needsDefaultMarker = false;

  if (templateLiteral) {
    // Template literal syntax - parse CSS
    const parsed = parseStyledCSS(
      templateLiteral.quasis,
      templateLiteral.expressions as Expression[]
    );
    const rules = extractDeclarations(parsed.root);

    if (rules.length === 0) {
      return null;
    }

    // Create conversion context with adapter for CSS variable resolution
    const conversionCtx: ConversionContext = {
      adapter,
      collectedImports: additionalImports,
    };

    // Convert to StyleX and process interpolations
    const mainRule = rules[0]!;
    // First get the raw StyleX object (before property-level conditional conversion)
    const rawStyles = cssRuleToStyleX(mainRule, conversionCtx);

    // Extract child selectors BEFORE toPropertyLevelConditionals flattens them
    extractDirectChildSelectorStyles(rawStyles, extraStyles, jsxRewriteRules);

    // Extract descendant styled-component selectors (e.g. `${Icon}` and `&:hover ${Icon}`)
    // into extra style entries + JSX rewrite rules.
    needsDefaultMarker = extractStyledComponentDescendantSelectorStyles(
      rawStyles,
      extraStyles,
      jsxRewriteRules,
      parsed.interpolations,
      componentName
    );

    // Now convert remaining styles to property-level conditionals
    styles = toPropertyLevelConditionals(rawStyles);

    // Process each interpolation
    for (const [_index, location] of parsed.interpolations) {
      const classified = classifyInterpolation(location, classificationCtx);
      const context = buildDynamicNodeContext(
        classified,
        location,
        componentName,
        filePath
      );

      const decision =
        executeDynamicNodeHandlers(context, adapter) ??
        getFallbackDecision(context, adapter.fallbackBehavior);

      // Apply the decision
      applyDecision(
        j,
        decision,
        context,
        styles,
        variantStyles,
        dynamicFns,
        additionalImports,
        warnings
      );
    }
  } else if (styleObject && styleObject.type === "ObjectExpression") {
    // Object syntax - convert object properties to styles
    styles = convertObjectExpressionToStyles(
      j,
      styleObject as ObjectExpression,
      hasDynamicStyleFn,
      dynamicStyleParam
    );
  } else {
    return null;
  }

  // Clean up dynamic placeholders from styles
  styles = cleanupDynamicPlaceholders(styles);

  // Extract transient props from variant styles (for info purposes)
  // Variant names follow pattern: componentNamePropName (e.g., compDraggable for $draggable)
  const transientProps: TransientPropInfo[] = [];
  const baseStyleName = toCamelCase(componentName);

  for (const [variantName] of variantStyles) {
    // Extract prop name from variant name (e.g., compDraggable -> Draggable -> $draggable)
    if (variantName.startsWith(baseStyleName)) {
      const propPart = variantName.slice(baseStyleName.length);
      if (propPart) {
        // Convert PascalCase to $camelCase (e.g., "Draggable" -> "$draggable")
        const propName =
          "$" + propPart.charAt(0).toLowerCase() + propPart.slice(1);
        transientProps.push({
          name: propName,
          type: "boolean",
          optional: true,
          truthyStyleName: `styles.${variantName}`,
        });
      }
    }
  }

  // Wrapper generation is disabled for now - styles are applied at JSX usage sites
  // TODO: Enable wrapper generation for transient props that need runtime filtering
  const needsWrapper = false;

  return {
    componentName,
    baseElement,
    styles,
    extraStyles,
    variantStyles,
    dynamicFns,
    isExtending,
    extendsFrom,
    attrsConfig,
    jsxRewriteRules,
    transientProps,
    needsWrapper,
    needsDefaultMarker,
  };
}

/**
 * Extract direct-child selector styles (e.g. `> *`) into separate StyleX styles
 * and record JSX rewrite rules to apply them to direct JSX children.
 *
 * This is intentionally conservative and is currently aimed at matching fixtures like `nesting`.
 *
 * NOTE: Stylis (the CSS parser) hoists nested selectors like `> * { &:not(:first-child) {...} }`
 * to become siblings: `>*` and `&:not(:first-child)`. We handle both cases.
 */
function extractDirectChildSelectorStyles(
  styles: StyleXObject,
  extraStyles: Map<string, StyleXObject>,
  jsxRewriteRules: StyleInfo["jsxRewriteRules"]
): void {
  const childSelectorKeys = [">*", "> *"];
  const foundKey = childSelectorKeys.find(
    (k) => typeof styles[k] === "object" && styles[k] !== null
  );
  if (!foundKey) return;

  const childBlock = styles[foundKey] as StyleXObject;
  delete styles[foundKey];

  // First check for :not(:first-child) nested INSIDE the child block
  let notFirstKeyInChild = [":not(:first-child)", "&:not(:first-child)"].find(
    (k) => typeof childBlock[k] === "object" && childBlock[k] !== null
  );

  // Also check for :not(:first-child) as a SIBLING to the child selector
  // (this happens because stylis hoists nested selectors)
  const notFirstKeySibling = [":not(:first-child)", "&:not(:first-child)"].find(
    (k) => typeof styles[k] === "object" && styles[k] !== null
  );

  let childBase: StyleXObject = {};
  let childNotFirst: StyleXObject | null = null;

  for (const [k, v] of Object.entries(childBlock)) {
    if (notFirstKeyInChild && k === notFirstKeyInChild) continue;
    childBase[k] = v as StyleXObject[keyof StyleXObject];
  }

  // Get childNotFirst from whichever location has it
  if (notFirstKeyInChild) {
    childNotFirst = childBlock[notFirstKeyInChild] as StyleXObject;
  } else if (notFirstKeySibling) {
    // Found at sibling level - extract and remove from parent styles
    childNotFirst = styles[notFirstKeySibling] as StyleXObject;
    delete styles[notFirstKeySibling];
  }

  // Fixture naming convention
  extraStyles.set("child", childBase);
  jsxRewriteRules.push({ type: "direct-children", styleNames: ["child"] });

  if (childNotFirst && Object.keys(childNotFirst).length > 0) {
    extraStyles.set("childNotFirst", childNotFirst);
    jsxRewriteRules.push({
      type: "direct-children-except-first",
      styleNames: ["child", "childNotFirst"],
    });
  }
}

/**
 * Extract descendant styled-component selectors into separate extra style entries and JSX rewrite rules.
 *
 * Handles:
 * - `${Icon} { ... }` (descendant selector inside a component)
 * - `&:hover ${Icon} { ... }` (ancestor pseudo affecting descendant styled-component)
 *
 * Output strategy:
 * - Create an extra style entry like `iconInButton`
 * - Apply it to `<Icon />` occurrences inside `<Button>...</Button>` via JSX rewriting
 * - For ancestor pseudo rules, encode property-level conditionals using a computed key:
 *   `[stylex.when.ancestor(':hover')]`
 */
function extractStyledComponentDescendantSelectorStyles(
  styles: StyleXObject,
  extraStyles: Map<string, StyleXObject>,
  jsxRewriteRules: StyleInfo["jsxRewriteRules"],
  interpolations: Map<number, import("./css-parser.js").InterpolationLocation>,
  parentComponentName: string
): boolean {
  let needsMarker = false;

  // Collect first to avoid mutating during iteration
  const entries = Object.entries(styles);

  for (const [selectorKey, value] of entries) {
    if (typeof value !== "object" || value === null) continue;
    if (!selectorKey.includes("__INTERPOLATION_")) continue;

    // Only support selectors that refer to a single interpolated component
    const indices = extractInterpolationIndices(selectorKey);
    if (indices.length !== 1) continue;
    const idx = indices[0]!;

    const loc = interpolations.get(idx);
    if (!loc) continue;
    const expr = loc.expression;
    if (expr.type !== "Identifier") continue;
    const targetComponentName = (expr as Identifier).name;

    const placeholder = `__INTERPOLATION_${idx}__`;

    // Normalize selector shapes that stylis emits for this pattern.
    // We support:
    // - "__INTERPOLATION_0__"
    // - "& __INTERPOLATION_0__" (may occur depending on stylis output)
    // - ":hover __INTERPOLATION_0__" (comes from "&:hover __INTERPOLATION_0__")
    const trimmed = selectorKey.trim();
    const withoutAmp = trimmed.startsWith("&")
      ? trimmed.slice(1).trim()
      : trimmed;

    let ancestorPseudo: string | null = null;
    let isDescendantComponentSelector = false;

    if (withoutAmp === placeholder) {
      isDescendantComponentSelector = true;
    } else {
      // Try to parse ":hover __INTERPOLATION_0__"
      const parts = withoutAmp.split(/\s+/).filter(Boolean);
      if (
        parts.length === 2 &&
        parts[1] === placeholder &&
        parts[0]!.startsWith(":")
      ) {
        ancestorPseudo = parts[0]!;
        isDescendantComponentSelector = true;
      }
    }

    if (!isDescendantComponentSelector) continue;

    // Create a stable extra style name: iconInButton
    const styleName =
      toCamelCase(targetComponentName) +
      "In" +
      parentComponentName.charAt(0).toUpperCase() +
      parentComponentName.slice(1);

    const existing = extraStyles.get(styleName) ?? {};
    const nestedStyles = value as StyleXObject;

    if (ancestorPseudo) {
      // Encode as property-level conditional on the TARGET element, based on ANCESTOR state.
      // e.g., opacity: { default: 0.8, [stylex.when.ancestor(':hover')]: 1 }
      needsMarker = true;
      for (const [prop, propValue] of Object.entries(nestedStyles)) {
        const existingValue = existing[prop];
        const computedKey = `[stylex.when.ancestor('${ancestorPseudo}')]`;
        if (
          existingValue &&
          typeof existingValue === "object" &&
          existingValue !== null
        ) {
          // Already a conditional object - add/overwrite the computed key
          (existingValue as StyleXObject)[computedKey] =
            propValue as StyleXObject[keyof StyleXObject];
          existing[prop] = existingValue;
        } else {
          const base = existingValue === undefined ? null : existingValue;
          existing[prop] = {
            default: base as StyleXObject[keyof StyleXObject],
            [computedKey]: propValue as StyleXObject[keyof StyleXObject],
          };
        }
      }
    } else {
      // Base descendant styles apply unconditionally when the target is used within this component.
      Object.assign(existing, nestedStyles);
    }

    extraStyles.set(styleName, existing);

    // Record JSX rewrite rule to apply this extra style to all matching descendants.
    // De-dupe later by target+styleName.
    jsxRewriteRules.push({
      type: "descendant-styled-component",
      targetComponentName,
      styleName,
    });

    // Remove the original selector block from this component styles - it can't be represented directly in StyleX.
    delete styles[selectorKey];
  }

  return needsMarker;
}

/**
 * Parse .attrs() configuration
 */
function parseAttrsConfig(_j: JSCodeshift, arg: Expression): AttrsConfig {
  const config: AttrsConfig = { staticAttrs: {}, dynamicAttrs: [] };

  if (arg.type === "ObjectExpression") {
    // Static attrs: .attrs({ type: 'text' })
    const objExpr = arg as ObjectExpression;
    for (const prop of objExpr.properties) {
      if (prop.type === "ObjectProperty" && prop.key.type === "Identifier") {
        const key = prop.key.name;
        if (prop.value.type === "StringLiteral") {
          config.staticAttrs[key] = prop.value.value;
        } else if (prop.value.type === "NumericLiteral") {
          config.staticAttrs[key] = prop.value.value;
        } else if (prop.value.type === "BooleanLiteral") {
          config.staticAttrs[key] = prop.value.value;
        }
      }
    }
  } else if (
    arg.type === "ArrowFunctionExpression" ||
    arg.type === "FunctionExpression"
  ) {
    // Dynamic attrs: .attrs((props) => ({ type: 'text', size: props.$small ? 5 : undefined }))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let body: any = (arg as any).body;
    if (body.type === "BlockStatement") {
      // Find return statement
      for (const stmt of body.body) {
        if (stmt.type === "ReturnStatement" && stmt.argument) {
          body = stmt.argument;
          break;
        }
      }
    }

    if (body.type === "ObjectExpression") {
      const objBody = body as ObjectExpression;
      for (const prop of objBody.properties) {
        if (prop.type === "ObjectProperty" && prop.key.type === "Identifier") {
          const key = prop.key.name;
          if (prop.value.type === "StringLiteral") {
            config.staticAttrs[key] = prop.value.value;
          } else if (prop.value.type === "NumericLiteral") {
            config.staticAttrs[key] = prop.value.value;
          } else if (prop.value.type === "BooleanLiteral") {
            config.staticAttrs[key] = prop.value.value;
          } else if (prop.value.type === "ConditionalExpression") {
            // Dynamic conditional: props.$small ? 5 : undefined
            const cond =
              prop.value as import("jscodeshift").ConditionalExpression;
            // Extract the condition's prop reference (e.g., props.$small -> $small)
            let propRef = "";
            if (cond.test.type === "MemberExpression") {
              const member =
                cond.test as import("jscodeshift").MemberExpression;
              if (member.property.type === "Identifier") {
                propRef = member.property.name;
              }
            }
            // Get the truthy value
            let truthyVal: string | number | undefined;
            if (cond.consequent.type === "NumericLiteral") {
              truthyVal = (
                cond.consequent as import("jscodeshift").NumericLiteral
              ).value;
            } else if (cond.consequent.type === "StringLiteral") {
              truthyVal = (
                cond.consequent as import("jscodeshift").StringLiteral
              ).value;
            }
            if (propRef && truthyVal !== undefined) {
              config.dynamicAttrs.push({
                prop: key,
                expr: `${propRef} ? ${truthyVal} : undefined`,
                conditionProp: propRef,
                truthyValue: truthyVal,
              });
            }
          }
        }
      }
    }
  }

  return config;
}

/**
 * Property rename map for object syntax (same as CSS-to-StyleX)
 */
const OBJECT_PROPERTY_RENAMES: Record<string, string> = {
  background: "backgroundColor",
};

/**
 * Convert an ObjectExpression to StyleX styles
 */
function convertObjectExpressionToStyles(
  _j: JSCodeshift,
  objExpr: ObjectExpression,
  _hasDynamicFn: boolean,
  _paramName: string | undefined
): StyleXObject {
  const styles: StyleXObject = {};

  for (const prop of objExpr.properties) {
    if (prop.type === "ObjectProperty") {
      let key: string;
      if (prop.key.type === "Identifier") {
        key = prop.key.name;
      } else if (prop.key.type === "StringLiteral") {
        key = prop.key.value;
      } else {
        continue;
      }

      // Apply property renames (e.g., background -> backgroundColor)
      const normalizedKey = OBJECT_PROPERTY_RENAMES[key] ?? key;

      // Convert value
      if (prop.value.type === "StringLiteral") {
        styles[normalizedKey] = prop.value.value;
      } else if (prop.value.type === "NumericLiteral") {
        styles[normalizedKey] = prop.value.value;
      } else if (
        prop.value.type === "TemplateLiteral" &&
        prop.value.expressions.length === 0
      ) {
        // Simple template literal without expressions
        styles[normalizedKey] = prop.value.quasis[0]?.value.cooked ?? "";
      } else {
        // Dynamic value - skip for now (will be handled as inline style)
        // For dynamic object syntax, we can't easily convert to StyleX
        continue;
      }
    }
  }

  return styles;
}

/**
 * Process keyframes declaration
 */
function processKeyframes(
  _j: JSCodeshift,
  expr: TaggedTemplateExpression,
  _classificationCtx: ReturnType<typeof createClassificationContext>
): StyleXObject | null {
  const templateLiteral = expr.quasi;
  const parsed = parseStyledCSS(
    templateLiteral.quasis,
    templateLiteral.expressions as Expression[]
  );

  const rules = extractDeclarations(parsed.root);

  const keyframeStyles: StyleXObject = {};

  for (const rule of rules) {
    // Handle keyframe selectors like "from", "to", "0%", "100%"
    let selector = rule.selector.replace("&", "").trim();
    if (selector.startsWith("{")) selector = selector.slice(1);
    if (selector.endsWith("}")) selector = selector.slice(0, -1);
    selector = selector.trim();

    if (selector) {
      const frameStyles: StyleXObject = {};
      for (const decl of rule.declarations) {
        // Use convertValue to properly convert numeric values
        frameStyles[decl.property] = convertValue(
          stripImportant(decl.value),
          decl.property
        );
      }
      keyframeStyles[selector] = frameStyles;
    }

    // Process nested rules (the actual keyframe definitions)
    for (const nested of rule.nestedRules) {
      let nestedSelector = nested.selector.trim();
      if (nestedSelector.startsWith("&"))
        nestedSelector = nestedSelector.slice(1).trim();

      const frameStyles: StyleXObject = {};
      for (const decl of nested.declarations) {
        // Use convertValue to properly convert numeric values
        frameStyles[decl.property] = convertValue(
          stripImportant(decl.value),
          decl.property
        );
      }

      if (Object.keys(frameStyles).length > 0) {
        keyframeStyles[nestedSelector] = frameStyles;
      }
    }
  }

  return Object.keys(keyframeStyles).length > 0 ? keyframeStyles : null;
}

/**
 * Build DynamicNodeContext from classified interpolation
 */
function buildDynamicNodeContext(
  classified: ClassifiedInterpolation,
  location: InterpolationLocation,
  componentName: string,
  filePath: string
): DynamicNodeContext {
  return {
    type: classified.type,
    index: location.index,
    cssProperty: location.context.property
      ? normalizePropertyName(location.context.property)
      : null,
    cssValue: location.context.value,
    selector: location.context.selector,
    isInSelector: location.context.isInSelector,
    isInPropertyName: location.context.isInPropertyName,
    isFullValue: location.context.isFullValue,
    filePath,
    componentName,
    sourceCode: classified.sourceCode,
    propPath: classified.propPath,
    isThemeAccess: classified.isThemeAccess,
    conditionalBranches: classified.conditionalBranches,
    logicalInfo: classified.logicalInfo,
    helperName: classified.helperName,
    keyframesName: classified.keyframesName,
    expression: location.expression,
  };
}

/**
 * Apply a handler decision to the styles
 */
function applyDecision(
  _j: JSCodeshift,
  decision: DynamicNodeDecision,
  context: DynamicNodeContext,
  styles: StyleXObject,
  variantStyles: Map<string, StyleXObject>,
  dynamicFns: Map<
    string,
    { paramName: string; paramType: string | undefined; styles: StyleXObject }
  >,
  additionalImports: Set<string>,
  warnings: TransformWarning[]
): void {
  // Add any imports from the decision
  if ("imports" in decision && decision.imports) {
    for (const imp of decision.imports) {
      additionalImports.add(imp);
    }
  }

  switch (decision.action) {
    case "convert": {
      // Replace the placeholder in styles with the converted value
      if (context.cssProperty) {
        // Special handling for animation shorthand with keyframes:
        // After expansion, the keyframes name should go to animationName, not animation
        if (
          context.cssProperty === "animation" &&
          context.type === "keyframes"
        ) {
          // For multiple animations, accumulate keyframes names
          const existingName = styles["animationName"];
          if (
            existingName &&
            typeof existingName === "string" &&
            existingName.startsWith(VAR_REF_PREFIX)
          ) {
            // Append to existing (using template literal format for multiple)
            styles["animationName"] =
              TEMPLATE_LITERAL_PREFIX +
              "${" +
              stripVarRefPrefix(existingName) +
              "}, ${" +
              stripVarRefPrefix(String(decision.value)) +
              "}";
          } else {
            // First keyframes name
            styles["animationName"] = decision.value;
          }
          // Don't set the animation property
        } else {
          styles[context.cssProperty] = decision.value;
        }
      } else if (
        context.type === "helper" &&
        typeof decision.value === "string"
      ) {
        // CSS helper spread (e.g., ${truncate}) - add as spread element
        styles[SPREAD_PREFIX + decision.value] = null;
      }
      break;
    }

    case "rewrite": {
      // Use the rewritten code as the value
      if (context.cssProperty) {
        styles[context.cssProperty] = decision.code;
      }
      break;
    }

    case "bail": {
      // Add warning; treat as dynamic-node (not a stable unsupported feature).
      warnings.push({
        type: "dynamic-node",
        feature: context.type,
        message: decision.reason,
      });
      break;
    }

    case "variant": {
      // Set base value in main styles
      if (context.cssProperty && decision.baseValue !== "") {
        styles[context.cssProperty] = decision.baseValue;
      }

      // Add variant styles
      for (const variant of decision.variants) {
        const variantName = `${toCamelCase(context.componentName)}${
          variant.name
        }`;
        const existing = variantStyles.get(variantName) ?? {};
        variantStyles.set(variantName, { ...existing, ...variant.styles });
      }
      break;
    }

    case "dynamic-fn": {
      // Create a dynamic style function
      const fnName = `${toCamelCase(context.componentName)}${capitalize(
        decision.paramName
      )}`;
      const fnStyles: StyleXObject = {};
      if (context.cssProperty) {
        fnStyles[context.cssProperty] = decision.valueExpression;
      }
      dynamicFns.set(fnName, {
        paramName: decision.paramName,
        paramType: decision.paramType,
        styles: fnStyles,
      });
      break;
    }
  }
}

/**
 * Clean up dynamic placeholders from styles
 */
function cleanupDynamicPlaceholders(styles: StyleXObject): StyleXObject {
  const cleaned: StyleXObject = {};

  for (const [key, value] of Object.entries(styles)) {
    if (typeof value === "object" && value !== null) {
      if ("type" in value && value.type === "dynamic") {
        // Skip dynamic placeholders that weren't resolved
        continue;
      }
      cleaned[key] = cleanupDynamicPlaceholders(value as StyleXObject);
    } else if (
      typeof value === "string" &&
      value.includes("__INTERPOLATION_")
    ) {
      // Skip unresolved interpolations
      continue;
    } else {
      cleaned[key] = value;
    }
  }

  return cleaned;
}

/**
 * Generate StyleX code from collected style infos
 * Returns an array of statements: keyframes declarations first, then styles declaration
 */
function generateStyleXCode(
  j: JSCodeshift,
  styleInfos: StyleInfo[],
  keyframesStyles: Map<string, StyleXObject>,
  _adapter: Adapter,
  cssHelperStyles?: Map<string, StyleXObject>
): VariableDeclaration[] {
  const statements: VariableDeclaration[] = [];

  // Generate keyframes declarations first (each as a separate const)
  for (const [name, keyframeStyles] of keyframesStyles) {
    const styleObj = styleObjectToAST(j, keyframeStyles);
    const keyframesCall = j.callExpression(
      j.memberExpression(j.identifier("stylex"), j.identifier("keyframes")),
      [styleObj as unknown as Parameters<typeof j.callExpression>[1][number]]
    );
    statements.push(
      j.variableDeclaration("const", [
        j.variableDeclarator(j.identifier(name), keyframesCall),
      ])
    );
  }

  // Generate CSS helper objects (as const objects, not stylex.create)
  // These can be spread into stylex.create styles
  if (cssHelperStyles) {
    for (const [name, helperStyles] of cssHelperStyles) {
      const styleObj = styleObjectToAST(j, helperStyles);
      // Add `as const` type assertion for better type inference
      const asConst = j.tsAsExpression(
        styleObj as unknown as Parameters<typeof j.tsAsExpression>[0],
        j.tsTypeReference(j.identifier("const"))
      );
      statements.push(
        j.variableDeclaration("const", [
          j.variableDeclarator(
            j.identifier(name),
            asConst as unknown as Parameters<typeof j.variableDeclarator>[1]
          ),
        ])
      );
    }
  }

  // Build style properties
  const properties: Array<{ key: Identifier; value: Expression }> = [];

  // Add component styles
  for (const info of styleInfos) {
    const styleName = toCamelCase(info.componentName);
    properties.push({
      key: j.identifier(styleName),
      value: styleObjectToAST(j, info.styles),
    });

    // Add extra styles created by selector lowering (e.g. child rules)
    for (const [extraName, extraStylesObj] of info.extraStyles) {
      properties.push({
        key: j.identifier(extraName),
        value: styleObjectToAST(j, extraStylesObj),
      });
    }

    // Add variant styles
    for (const [variantName, variantStyles] of info.variantStyles) {
      properties.push({
        key: j.identifier(variantName),
        value: styleObjectToAST(j, variantStyles),
      });
    }

    // Add dynamic functions
    for (const [fnName, fnConfig] of info.dynamicFns) {
      const param = j.identifier(fnConfig.paramName);
      if (fnConfig.paramType) {
        param.typeAnnotation = j.tsTypeAnnotation(
          j.tsTypeReference(j.identifier(fnConfig.paramType))
        );
      }
      const fnBody = styleObjectToAST(j, fnConfig.styles);
      // Use parenthesized expression for object return (cast to any for jscodeshift type compat)
      const parenthesizedBody = j.parenthesizedExpression(
        fnBody as unknown as Parameters<typeof j.parenthesizedExpression>[0]
      );
      const arrowFn = j.arrowFunctionExpression(
        [param],
        parenthesizedBody as unknown as Parameters<
          typeof j.arrowFunctionExpression
        >[1]
      );
      properties.push({
        key: j.identifier(fnName),
        value: arrowFn,
      });
    }
  }

  // Build the object expression (cast to any for jscodeshift type compat)
  const objectProps = properties.map(({ key, value }) =>
    j.objectProperty(
      key,
      value as unknown as Parameters<typeof j.objectProperty>[1]
    )
  );

  // Create stylex.create() call
  const createCall = j.callExpression(
    j.memberExpression(j.identifier("stylex"), j.identifier("create")),
    [j.objectExpression(objectProps)]
  );

  // Add styles declaration
  statements.push(
    j.variableDeclaration("const", [
      j.variableDeclarator(j.identifier("styles"), createCall),
    ])
  );

  return statements;
}

/**
 * Marker prefix for spread elements
 */
const SPREAD_PREFIX = "__SPREAD__";

/**
 * Convert a style object to AST expression
 * Supports spread elements via SPREAD_PREFIX marker
 * Spread elements are placed at the beginning of the object
 */
function styleObjectToAST(j: JSCodeshift, styles: StyleXObject): Expression {
  const spreadProperties: Array<ReturnType<typeof j.spreadElement>> = [];
  const regularProperties: Array<ObjectProperty> = [];

  for (const [key, value] of Object.entries(styles)) {
    // Check for spread elements (marked with __SPREAD__ prefix)
    if (key.startsWith(SPREAD_PREFIX)) {
      const spreadSource = key.slice(SPREAD_PREFIX.length);
      spreadProperties.push(j.spreadElement(j.identifier(spreadSource)));
      continue;
    }

    // Support computed keys encoded as strings like:
    //   "[stylex.when.ancestor(':hover')]"
    const computedExpr = parseBracketComputedKeyToExpression(j, key);
    const keyNode = computedExpr
      ? computedExpr
      : isValidIdentifier(key)
      ? j.identifier(key)
      : j.literal(key);

    let valueNode: Expression;

    if (value === null) {
      // Handle null values explicitly (used for default: null in conditionals)
      valueNode = j.literal(null);
    } else if (typeof value === "string") {
      // Check if it's a template literal
      if (isTemplateLiteral(value)) {
        const templateValue = stripTemplateLiteralPrefix(value);
        valueNode = parseTemplateLiteral(j, templateValue);
      } else if (isVariableReference(value)) {
        // Strip the variable reference marker prefix if present
        const cleanValue = stripVarRefPrefix(value);
        // Handle member expressions (e.g., theme.colors.primary)
        if (cleanValue.includes(".")) {
          valueNode = parseMemberExpression(j, cleanValue);
        } else {
          valueNode = j.identifier(cleanValue);
        }
      } else {
        valueNode = j.literal(value);
      }
    } else if (typeof value === "number") {
      valueNode = j.literal(value);
    } else if (typeof value === "object" && value !== null) {
      valueNode = styleObjectToAST(j, value as StyleXObject);
    } else {
      continue;
    }

    const prop = j.objectProperty(
      keyNode as unknown as Parameters<typeof j.objectProperty>[0],
      valueNode as unknown as Parameters<typeof j.objectProperty>[1]
    );
    if (computedExpr) {
      (prop as unknown as { computed?: boolean }).computed = true;
    }
    regularProperties.push(prop);
  }

  // Spread properties come first, then regular properties
  const allProperties = [...spreadProperties, ...regularProperties];
  return j.objectExpression(
    allProperties as unknown as Parameters<typeof j.objectExpression>[0]
  );
}

function parseBracketComputedKeyToExpression(
  j: JSCodeshift,
  key: string
): Expression | null {
  const trimmed = key.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return null;
  const inner = trimmed.slice(1, -1).trim();

  const match = inner.match(
    /^stylex\.when\.(ancestor|descendant|anySibling|siblingBefore|siblingAfter)\(\s*(['"])([^'"]+)\2\s*(?:,\s*(.+)\s*)?\)$/
  );
  if (!match) return null;

  const method = match[1]!;
  const pseudo = match[3]!;
  const markerArg = match[4]?.trim();

  const callee = j.memberExpression(
    j.memberExpression(j.identifier("stylex"), j.identifier("when")),
    j.identifier(method)
  );

  const args: Expression[] = [j.literal(pseudo) as unknown as Expression];

  if (markerArg) {
    if (markerArg === "stylex.defaultMarker()") {
      args.push(
        j.callExpression(
          j.memberExpression(
            j.identifier("stylex"),
            j.identifier("defaultMarker")
          ),
          []
        ) as unknown as Expression
      );
    } else if (/^[a-zA-Z_$][a-zA-Z0-9_$.]*$/.test(markerArg)) {
      args.push(parseMemberExpression(j, markerArg));
    } else {
      return null;
    }
  }

  return j.callExpression(
    callee,
    args as unknown as Parameters<typeof j.callExpression>[1]
  ) as unknown as Expression;
}

/**
 * Check if a string is a valid JS identifier
 */
function isValidIdentifier(str: string): boolean {
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(str);
}

/**
 * CSS keywords that should NOT be treated as variable references.
 * This is a subset of valid CSS keywords - expand as needed.
 */
const CSS_KEYWORDS = new Set([
  // Colors (common named colors)
  "papayawhip",
  "tomato",
  "rebeccapurple",
  "white",
  "black",
  "red",
  "green",
  "blue",
  "yellow",
  "orange",
  "purple",
  "pink",
  "brown",
  "gray",
  "grey",
  "transparent",
  "mediumseagreen",
  "coral",
  "crimson",
  "darkblue",
  "lightblue",
  "lightgray",
  "aliceblue",
  "antiquewhite",
  "aqua",
  "aquamarine",
  "azure",
  "beige",
  "bisque",
  "blanchedalmond",
  "blueviolet",
  "burlywood",
  "cadetblue",
  "chartreuse",
  "chocolate",
  "cornflowerblue",
  "cornsilk",
  "cyan",
  "darkgoldenrod",
  "darkgreen",
  "darkkhaki",
  "darkmagenta",
  "darkolivegreen",
  "darkorange",
  "darkorchid",
  "darkred",
  "darksalmon",
  "darkseagreen",
  "darkslateblue",
  "darkslategray",
  "darkturquoise",
  "darkviolet",
  "deeppink",
  "deepskyblue",
  "dimgray",
  "dodgerblue",
  "firebrick",
  "floralwhite",
  "forestgreen",
  "fuchsia",
  "gainsboro",
  "ghostwhite",
  "gold",
  "goldenrod",
  "greenyellow",
  "honeydew",
  "hotpink",
  "indianred",
  "indigo",
  "ivory",
  "khaki",
  "lavender",
  "lavenderblush",
  "lawngreen",
  "lemonchiffon",
  "lightcoral",
  "lightcyan",
  "lightgoldenrodyellow",
  "lightgreen",
  "lightpink",
  "lightsalmon",
  "lightseagreen",
  "lightskyblue",
  "lightslategray",
  "lightsteelblue",
  "lightyellow",
  "lime",
  "limegreen",
  "linen",
  "magenta",
  "maroon",
  "mediumaquamarine",
  "mediumblue",
  "mediumorchid",
  "mediumpurple",
  "mediumslateblue",
  "mediumspringgreen",
  "mediumturquoise",
  "mediumvioletred",
  "midnightblue",
  "mintcream",
  "mistyrose",
  "moccasin",
  "navajowhite",
  "navy",
  "oldlace",
  "olive",
  "olivedrab",
  "orangered",
  "orchid",
  "palegoldenrod",
  "palegreen",
  "paleturquoise",
  "palevioletred",
  "peachpuff",
  "peru",
  "plum",
  "powderblue",
  "rosybrown",
  "royalblue",
  "saddlebrown",
  "salmon",
  "sandybrown",
  "seagreen",
  "seashell",
  "sienna",
  "silver",
  "skyblue",
  "slateblue",
  "slategray",
  "snow",
  "springgreen",
  "steelblue",
  "tan",
  "teal",
  "thistle",
  "turquoise",
  "violet",
  "wheat",
  "whitesmoke",
  "yellowgreen",
  // Inherit/reset values
  "inherit",
  "initial",
  "unset",
  "revert",
  // Text align
  "center",
  "left",
  "right",
  "justify",
  "start",
  "end",
  // Display
  "block",
  "inline",
  "flex",
  "grid",
  "none",
  "contents",
  // Position
  "absolute",
  "relative",
  "fixed",
  "sticky",
  "static",
  // Other common values
  "auto",
  "normal",
  "hidden",
  "visible",
  "scroll",
  "wrap",
  "nowrap",
  "bold",
  "bolder",
  "lighter",
  "italic",
  "underline",
  "pointer",
  "default",
  "solid",
  "dashed",
  "dotted",
  "double",
  "groove",
  "ridge",
  "inset",
  "outset",
  "thin",
  "medium",
  "thick",
  "cover",
  "contain",
  "fill",
  "stretch",
  "baseline",
  "space",
  "between",
  "around",
  "evenly",
  "row",
  "column",
  "infinite",
  "linear",
  "ease",
  "forwards",
  "backwards",
  "both",
  "running",
  "paused",
  "alternate",
  "reverse",
  "from",
  "to",
  // Overflow
  "clip",
  "ellipsis",
  // Cursor
  "crosshair",
  "help",
  "move",
  "progress",
  "text",
  "wait",
  "grab",
  "grabbing",
  // Font/text
  "uppercase",
  "lowercase",
  "capitalize",
  "small",
  "large",
  "smaller",
  "larger",
  "monospace",
  "serif",
  "cursive",
  "fantasy",
  "system",
]);

// VAR_REF_PREFIX and TEMPLATE_LITERAL_PREFIX are imported from adapter.js

/**
 * Check if a value looks like a variable reference (not a CSS value)
 * Only certain patterns should be treated as JS identifiers
 */
function isVariableReference(value: string): boolean {
  // Explicit variable reference marker (from handlers)
  if (value.startsWith(VAR_REF_PREFIX)) return true;

  // Must be a valid identifier
  if (!/^[a-zA-Z_$][a-zA-Z0-9_$.]*$/.test(value)) return false;

  // CSS keywords should not be treated as variable references
  if (CSS_KEYWORDS.has(value.toLowerCase())) return false;

  // If it contains dots, it's likely a member expression (e.g., theme.colors.primary)
  if (value.includes(".")) return true;

  // Otherwise, assume it's a CSS value
  return false;
}

/**
 * Check if a value is a template literal expression
 */
function isTemplateLiteral(value: string): boolean {
  return value.startsWith(TEMPLATE_LITERAL_PREFIX);
}

/**
 * Strip the variable reference marker prefix if present
 */
function stripVarRefPrefix(value: string): string {
  return value.startsWith(VAR_REF_PREFIX)
    ? value.slice(VAR_REF_PREFIX.length)
    : value;
}

/**
 * Strip the template literal prefix if present
 */
function stripTemplateLiteralPrefix(value: string): string {
  return value.startsWith(TEMPLATE_LITERAL_PREFIX)
    ? value.slice(TEMPLATE_LITERAL_PREFIX.length)
    : value;
}

/**
 * Parse a template literal string into AST
 * Handles: `${spacing}px`, `${value}`
 */
function parseTemplateLiteral(j: JSCodeshift, template: string): Expression {
  // Find all ${...} expressions in the template
  const regex = /\$\{([^}]+)\}/g;
  const quasis: Array<{ raw: string; cooked: string }> = [];
  const expressions: Expression[] = [];

  let lastIndex = 0;
  let match;

  while ((match = regex.exec(template)) !== null) {
    // Add the quasi (text before this expression)
    const quasiText = template.slice(lastIndex, match.index);
    quasis.push({ raw: quasiText, cooked: quasiText });

    // Parse the expression
    const exprStr = match[1]!.trim();
    if (exprStr.includes(".")) {
      expressions.push(parseMemberExpression(j, exprStr));
    } else if (
      exprStr.includes("/") ||
      exprStr.includes("*") ||
      exprStr.includes("+") ||
      exprStr.includes("-")
    ) {
      // Binary expression like spacing / 2
      expressions.push(parseBinaryExpression(j, exprStr));
    } else {
      expressions.push(j.identifier(exprStr));
    }

    lastIndex = regex.lastIndex;
  }

  // Add the final quasi (text after the last expression)
  const finalQuasi = template.slice(lastIndex);
  quasis.push({ raw: finalQuasi, cooked: finalQuasi });

  // Build template literal
  const templateQuasis = quasis.map((q, i) =>
    j.templateElement({ raw: q.raw, cooked: q.cooked }, i === quasis.length - 1)
  );

  return j.templateLiteral(
    templateQuasis as unknown as Parameters<typeof j.templateLiteral>[0],
    expressions as unknown as Parameters<typeof j.templateLiteral>[1]
  );
}

/**
 * Parse a member expression string into AST
 * Handles: theme.colors.primary
 */
function parseMemberExpression(j: JSCodeshift, exprStr: string): Expression {
  const parts = exprStr.split(".");
  // jscodeshift typing expects ExpressionKind; keep internal as unknown and cast at the end.
  let expr = j.identifier(parts[0]!) as unknown as Parameters<
    typeof j.memberExpression
  >[0];

  for (let i = 1; i < parts.length; i++) {
    expr = j.memberExpression(
      expr,
      j.identifier(parts[i]!) as unknown as Parameters<
        typeof j.memberExpression
      >[1]
    ) as unknown as Parameters<typeof j.memberExpression>[0];
  }

  return expr as unknown as Expression;
}

/**
 * Parse a simple binary expression
 * Handles: spacing / 2, value + 1
 */
function parseBinaryExpression(j: JSCodeshift, exprStr: string): Expression {
  // Simple parsing for common patterns
  const divMatch = exprStr.match(/^(\w+)\s*\/\s*(\d+)$/);
  if (divMatch) {
    return j.binaryExpression(
      "/",
      j.identifier(divMatch[1]!),
      j.literal(parseInt(divMatch[2]!, 10))
    );
  }

  const mulMatch = exprStr.match(/^(\w+)\s*\*\s*(\d+)$/);
  if (mulMatch) {
    return j.binaryExpression(
      "*",
      j.identifier(mulMatch[1]!),
      j.literal(parseInt(mulMatch[2]!, 10))
    );
  }

  // Fallback: just use the string as an identifier
  return j.identifier(exprStr.replace(/\s+/g, ""));
}

/**
 * Transform JSX usage of styled components
 */
function transformJSXUsage(
  j: JSCodeshift,
  root: Collection,
  styleInfos: StyleInfo[],
  _styledComponentIdentifiers: Set<string>,
  source: string
): void {
  // Map component names to their info
  const componentMap = new Map<string, StyleInfo>();
  for (const info of styleInfos) {
    componentMap.set(info.componentName, info);
  }

  // Find JSX elements using styled components
  root.find(j.JSXElement).forEach((path) => {
    const opening = path.node.openingElement;
    if (opening.name.type !== "JSXIdentifier") return;

    const componentName = opening.name.name;
    const info = componentMap.get(componentName);

    if (!info) return;

    // Handle style inheritance chain - resolve the base element and collect parent styles
    const styleRefs: string[] = [];
    let baseElement = info.baseElement;

    // If this component extends another styled component, we need to include its styles
    if (info.extendsFrom) {
      // Walk up the inheritance chain to find the base element and collect parent styles
      let current: StyleInfo | undefined = componentMap.get(info.extendsFrom);
      const inheritedStyles: string[] = [];

      if (current) {
        // Extending another styled-component - walk the chain
        while (current) {
          inheritedStyles.unshift(toCamelCase(current.componentName));
          if (!current.extendsFrom) {
            baseElement = current.baseElement;
            break;
          }
          current = componentMap.get(current.extendsFrom);
        }
        // Add all inherited styles first
        for (const styleName of inheritedStyles) {
          styleRefs.push(`styles.${styleName}`);
        }
      } else {
        // Extending a non-styled component (e.g., styled(Link)) - use that component as base
        baseElement = info.extendsFrom;
      }
    }

    // Add this component's own style
    styleRefs.push(`styles.${toCamelCase(info.componentName)}`);

    // If any descendant styles rely on stylex.when.ancestor(), the observed ancestor must be marked.
    if (info.needsDefaultMarker) {
      styleRefs.push(`stylex.defaultMarker()`);
    }

    // Check for variant props, `as` prop, and dynamic function props
    const propsToRemove: string[] = [];

    // Ensure attributes array exists for iteration
    const existingAttrs = opening.attributes ?? [];

    // Check for `as` or `forwardedAs` prop to override base element
    for (const attr of existingAttrs) {
      if (attr.type !== "JSXAttribute" || attr.name.type !== "JSXIdentifier")
        continue;
      if (attr.name.name === "as" || attr.name.name === "forwardedAs") {
        // Extract the element name from the as/forwardedAs prop value
        if (attr.value?.type === "StringLiteral") {
          baseElement = attr.value.value;
        }
        propsToRemove.push(attr.name.name);
        break;
      }
    }

    // Replace the element name with the base element (unless wrapper is generated)
    if (!info.needsWrapper) {
      opening.name = j.jsxIdentifier(baseElement);
      if (path.node.closingElement) {
        path.node.closingElement.name = j.jsxIdentifier(baseElement);
      }
    }
    // If component needs wrapper, keep original name - wrapper will handle it
    const dynamicStyleCalls: string[] = [];
    // Ensure attributes array exists
    if (!opening.attributes) {
      opening.attributes = [];
    }
    const attributes = opening.attributes;

    for (const attr of attributes) {
      if (attr.type !== "JSXAttribute" || attr.name.type !== "JSXIdentifier")
        continue;

      const propName = attr.name.name;

      // Check if this prop controls a variant
      for (const [variantName] of info.variantStyles) {
        const expectedProp = variantName.replace(
          toCamelCase(info.componentName),
          ""
        );
        const propWithPrefix = `$${expectedProp
          .charAt(0)
          .toLowerCase()}${expectedProp.slice(1)}`;
        // Also check for "is" prefixed versions (e.g., $isActive matches Active)
        const propWithIsPrefix = `$is${expectedProp}`;

        if (
          propName === propWithPrefix ||
          propName === expectedProp.toLowerCase() ||
          propName === propWithIsPrefix
        ) {
          // Add variant style conditionally
          if (attr.value === null) {
            // Boolean prop (e.g., $primary)
            styleRefs.push(`styles.${variantName}`);
          } else if (
            attr.value &&
            attr.value.type === "JSXExpressionContainer"
          ) {
            // Expression value - add conditional
            const exprNode = attr.value.expression;
            const start = (exprNode as unknown as { start?: number }).start;
            const end = (exprNode as unknown as { end?: number }).end;
            const expr =
              typeof start === "number" && typeof end === "number"
                ? source.slice(start, end)
                : "[expression]";
            styleRefs.push(`${expr} && styles.${variantName}`);
          }
          propsToRemove.push(propName);
        }
      }

      // Check if this prop is used in a dynamic function
      for (const [fnName, fnConfig] of info.dynamicFns) {
        const cleanPropName = propName.startsWith("$")
          ? propName.slice(1)
          : propName;
        if (cleanPropName.toLowerCase() === fnConfig.paramName.toLowerCase()) {
          // Add dynamic style function call
          if (attr.value?.type === "JSXExpressionContainer") {
            const exprNode = attr.value.expression;
            const start = (exprNode as unknown as { start?: number }).start;
            const end = (exprNode as unknown as { end?: number }).end;
            const expr =
              typeof start === "number" && typeof end === "number"
                ? source.slice(start, end)
                : "[expression]";
            dynamicStyleCalls.push(`styles.${fnName}(${expr})`);
          } else if (attr.value?.type === "StringLiteral") {
            dynamicStyleCalls.push(`styles.${fnName}("${attr.value.value}")`);
          }
          propsToRemove.push(propName);
        }
      }
    }

    // Apply attrs from attrsConfig - collect attrs first, then add in correct order
    if (info.attrsConfig) {
      const attrsToAdd: JSXAttribute[] = [];

      // Collect static attrs first
      for (const [key, value] of Object.entries(info.attrsConfig.staticAttrs)) {
        if (typeof value === "string") {
          attrsToAdd.push(
            j.jsxAttribute(j.jsxIdentifier(key), j.literal(value))
          );
        } else if (typeof value === "number") {
          attrsToAdd.push(
            j.jsxAttribute(
              j.jsxIdentifier(key),
              j.jsxExpressionContainer(j.literal(value))
            )
          );
        } else if (typeof value === "boolean" && value) {
          attrsToAdd.push(j.jsxAttribute(j.jsxIdentifier(key), null));
        }
      }

      // Collect dynamic attrs - check existing JSX props and apply computed values
      for (const dynamicAttr of info.attrsConfig.dynamicAttrs) {
        // Use the new conditionProp and truthyValue fields if available
        if (
          dynamicAttr.conditionProp &&
          dynamicAttr.truthyValue !== undefined
        ) {
          // Find if the condition prop is present in JSX
          const conditionAttr = attributes.find(
            (attr) =>
              attr.type === "JSXAttribute" &&
              attr.name.type === "JSXIdentifier" &&
              attr.name.name === dynamicAttr.conditionProp
          );

          if (conditionAttr && conditionAttr.type === "JSXAttribute") {
            // Boolean prop is present (value is null for <Input $small />)
            if (conditionAttr.value === null) {
              // Apply the truthy value
              if (typeof dynamicAttr.truthyValue === "number") {
                attrsToAdd.push(
                  j.jsxAttribute(
                    j.jsxIdentifier(dynamicAttr.prop),
                    j.jsxExpressionContainer(j.literal(dynamicAttr.truthyValue))
                  )
                );
              } else if (typeof dynamicAttr.truthyValue === "string") {
                attrsToAdd.push(
                  j.jsxAttribute(
                    j.jsxIdentifier(dynamicAttr.prop),
                    j.literal(dynamicAttr.truthyValue)
                  )
                );
              }
              propsToRemove.push(dynamicAttr.conditionProp);
            }
          }
          // If condition prop is not present, the value is undefined (falsy case) - do nothing
          continue;
        }

        // Fallback for legacy format without conditionProp
        for (const attr of attributes) {
          if (
            attr.type !== "JSXAttribute" ||
            attr.name.type !== "JSXIdentifier"
          )
            continue;
          const propName = attr.name.name;

          if (dynamicAttr.expr.includes(propName)) {
            if (attr.value === null) {
              // Boolean prop - extract numeric value from ternary expression
              if (
                dynamicAttr.expr.includes("?") &&
                dynamicAttr.expr.includes(":")
              ) {
                const match = dynamicAttr.expr.match(/\?\s*(\d+)\s*:/);
                if (match) {
                  attrsToAdd.push(
                    j.jsxAttribute(
                      j.jsxIdentifier(dynamicAttr.prop),
                      j.jsxExpressionContainer(
                        j.literal(parseInt(match[1]!, 10))
                      )
                    )
                  );
                  propsToRemove.push(propName);
                }
              }
            }
          }
        }
      }

      // Add collected attrs at the beginning in correct order
      opening.attributes.unshift(...attrsToAdd);
    }

    // Skip style application if wrapper is generated - wrapper handles it
    if (!info.needsWrapper) {
      // Remove variant/dynamic props
      opening.attributes = opening.attributes.filter((attr) => {
        if (attr.type !== "JSXAttribute" || attr.name.type !== "JSXIdentifier")
          return true;
        return !propsToRemove.includes(attr.name.name);
      });

      // Create stylex.props(...) spread
      const allStyleRefs = [...styleRefs, ...dynamicStyleCalls];
      const stylexArgs: Expression[] = allStyleRefs.map((ref) => {
        if (ref.includes("&&")) {
          // Parse the conditional expression
          const [condition, style] = ref.split(" && ");
          return j.logicalExpression(
            "&&",
            j.identifier(condition!.trim()),
            j.identifier(style!.trim())
          ) as unknown as Expression;
        }
        // Check if it's a function call like styles.fnName("arg")
        const fnCallMatch = ref.match(/^(styles\.\w+)\("([^"]+)"\)$/);
        if (fnCallMatch) {
          const [, fnPath, arg] = fnCallMatch;
          const [obj, prop] = fnPath!.split(".");
          return j.callExpression(
            j.memberExpression(j.identifier(obj!), j.identifier(prop!)),
            [j.literal(arg!)]
          ) as unknown as Expression;
        }
        return j.identifier(ref) as unknown as Expression;
      });
      const stylexPropsCall = j.callExpression(
        j.memberExpression(j.identifier("stylex"), j.identifier("props")),
        stylexArgs as unknown as Parameters<typeof j.callExpression>[1]
      );

      const spreadAttr = j.jsxSpreadAttribute(stylexPropsCall);

      // Add (or merge into) the stylex.props(...) spread attribute.
      // If a previous rewrite already added a stylex.props spread (e.g., descendant selector lowering),
      // merge so we don't end up with multiple spreads where order could break overrides.
      const existingSpread = opening.attributes.find(
        (a: (typeof opening.attributes)[number]) =>
          a.type === "JSXSpreadAttribute" &&
          a.argument.type === "CallExpression" &&
          a.argument.callee.type === "MemberExpression" &&
          a.argument.callee.object.type === "Identifier" &&
          a.argument.callee.object.name === "stylex" &&
          a.argument.callee.property.type === "Identifier" &&
          a.argument.callee.property.name === "props"
      );

      if (existingSpread && existingSpread.type === "JSXSpreadAttribute") {
        const call = existingSpread.argument;
        if (call.type === "CallExpression") {
          // Prepend so later-added styles (already in the spread) keep override priority.
          call.arguments.unshift(
            ...(stylexArgs as unknown as Parameters<typeof j.callExpression>[1])
          );
        }
      } else {
        opening.attributes.push(spreadAttr);
      }
    }

    // Apply selector-lowered rules to JSX children (initial support: direct children)
    if (info.jsxRewriteRules.length > 0) {
      const children = path.node.children ?? [];
      const directChildElements = children.filter(
        (c): c is import("jscodeshift").JSXElement => c.type === "JSXElement"
      );

      // Apply `child` to all direct children, and `childNotFirst` to all except first
      for (let i = 0; i < directChildElements.length; i++) {
        const childEl = directChildElements[i]!;
        const childOpening = childEl.openingElement;
        if (!childOpening.attributes) childOpening.attributes = [];

        // Determine styles to apply for this child index
        const styleNames: string[] = [];
        for (const rule of info.jsxRewriteRules) {
          if (rule.type === "direct-children") {
            styleNames.push(...rule.styleNames);
          } else if (rule.type === "direct-children-except-first" && i > 0) {
            styleNames.push(...rule.styleNames);
          }
        }

        // De-dupe while preserving order
        const uniqueStyleNames = [...new Set(styleNames)];
        if (uniqueStyleNames.length === 0) continue;

        // Try to merge into existing stylex.props(...) spread if present
        const existingSpread = childOpening.attributes.find(
          (a: (typeof childOpening.attributes)[number]) =>
            a.type === "JSXSpreadAttribute" &&
            a.argument.type === "CallExpression" &&
            a.argument.callee.type === "MemberExpression" &&
            a.argument.callee.object.type === "Identifier" &&
            a.argument.callee.object.name === "stylex" &&
            a.argument.callee.property.type === "Identifier" &&
            a.argument.callee.property.name === "props"
        );

        const extraArgs = uniqueStyleNames.map((n) =>
          j.memberExpression(j.identifier("styles"), j.identifier(n))
        ) as unknown as Expression[];

        if (existingSpread && existingSpread.type === "JSXSpreadAttribute") {
          const call = existingSpread.argument;
          if (call.type === "CallExpression") {
            call.arguments.push(
              ...(extraArgs as unknown as Parameters<
                typeof j.callExpression
              >[1])
            );
          }
        } else {
          const propsCall = j.callExpression(
            j.memberExpression(j.identifier("stylex"), j.identifier("props")),
            extraArgs as unknown as Parameters<typeof j.callExpression>[1]
          );
          childOpening.attributes.push(j.jsxSpreadAttribute(propsCall));
        }
      }
    }

    // Apply descendant styled-component rewrite rules (e.g., `${Icon}` blocks inside `${Button}`).
    const descendantRules = info.jsxRewriteRules.filter(
      (r) => r.type === "descendant-styled-component"
    ) as Array<
      Extract<
        StyleInfo["jsxRewriteRules"][number],
        { type: "descendant-styled-component" }
      >
    >;

    if (descendantRules.length > 0) {
      const seen = new Set<string>();
      for (const rule of descendantRules) {
        const key = `${rule.targetComponentName}::${rule.styleName}`;
        if (seen.has(key)) continue;
        seen.add(key);
        applyStyleToDescendantComponents(
          j,
          path.node,
          rule.targetComponentName,
          rule.styleName
        );
      }
    }
  });
}

function applyStyleToDescendantComponents(
  j: JSCodeshift,
  rootEl: import("jscodeshift").JSXElement,
  targetComponentName: string,
  styleName: string
): void {
  const targetStyleKey = toCamelCase(targetComponentName);

  function hasBaseStyleApplied(
    opening: import("jscodeshift").JSXOpeningElement
  ): boolean {
    const attrs = opening.attributes ?? [];
    for (const a of attrs) {
      if (a.type !== "JSXSpreadAttribute") continue;
      const arg = a.argument;
      if (arg.type !== "CallExpression") continue;
      const callee = arg.callee;
      if (
        callee.type === "MemberExpression" &&
        callee.object.type === "Identifier" &&
        callee.object.name === "stylex" &&
        callee.property.type === "Identifier" &&
        callee.property.name === "props"
      ) {
        for (const callArg of arg.arguments) {
          if (callArg.type !== "MemberExpression") continue;
          if (
            callArg.object.type === "Identifier" &&
            callArg.object.name === "styles" &&
            callArg.property.type === "Identifier" &&
            callArg.property.name === targetStyleKey
          ) {
            return true;
          }
        }
      }
    }
    return false;
  }

  function ensureStyleApplied(
    opening: import("jscodeshift").JSXOpeningElement
  ): void {
    if (!opening.attributes) opening.attributes = [];

    const existingSpread = opening.attributes.find(
      (a) =>
        a.type === "JSXSpreadAttribute" &&
        a.argument.type === "CallExpression" &&
        a.argument.callee.type === "MemberExpression" &&
        a.argument.callee.object.type === "Identifier" &&
        a.argument.callee.object.name === "stylex" &&
        a.argument.callee.property.type === "Identifier" &&
        a.argument.callee.property.name === "props"
    );

    const extraArg = j.memberExpression(
      j.identifier("styles"),
      j.identifier(styleName)
    );

    if (existingSpread && existingSpread.type === "JSXSpreadAttribute") {
      const call = existingSpread.argument;
      if (call.type === "CallExpression") {
        const alreadyHas = call.arguments.some((arg) => {
          if (arg.type !== "MemberExpression") return false;
          return (
            arg.object.type === "Identifier" &&
            arg.object.name === "styles" &&
            arg.property.type === "Identifier" &&
            arg.property.name === styleName
          );
        });
        if (!alreadyHas) {
          call.arguments.push(
            extraArg as unknown as Parameters<
              typeof j.callExpression
            >[1][number]
          );
        }
      }
      return;
    }

    const propsCall = j.callExpression(
      j.memberExpression(j.identifier("stylex"), j.identifier("props")),
      [extraArg as unknown as Parameters<typeof j.callExpression>[1][number]]
    );
    opening.attributes.push(j.jsxSpreadAttribute(propsCall));
  }

  function visit(node: import("jscodeshift").JSXElement): void {
    for (const child of node.children ?? []) {
      if (child.type !== "JSXElement") continue;
      const opening = child.openingElement;

      if (opening.name.type === "JSXIdentifier") {
        // Match before conversion (<Icon />) OR after conversion (element with styles.icon already applied).
        if (
          opening.name.name === targetComponentName ||
          hasBaseStyleApplied(opening)
        ) {
          ensureStyleApplied(opening);
        }
      }

      visit(child);
    }
  }

  visit(rootEl);
}

/**
 * Detect patterns that need warnings
 */
function detectWarningPatterns(
  j: JSCodeshift,
  root: Collection,
  warnings: TransformWarning[]
): void {
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
}

/**
 * Generate wrapper components for styled components that need them
 */
function generateWrapperComponents(
  j: JSCodeshift,
  styleInfos: StyleInfo[]
): VariableDeclaration[] {
  const wrappers: VariableDeclaration[] = [];

  for (const info of styleInfos) {
    if (!info.needsWrapper) continue;

    const {
      componentName,
      baseElement,
      transientProps,
      isExtending,
      extendsFrom,
    } = info;
    const styleName = toCamelCase(componentName);

    // Build props destructure
    const propsDestructure: string[] = [];
    for (const prop of transientProps) {
      propsDestructure.push(prop.name);
    }
    propsDestructure.push("children");
    propsDestructure.push("...props");

    // Build props type
    const propsTypeParts: string[] = [];
    for (const prop of transientProps) {
      propsTypeParts.push(
        `${prop.name}${prop.optional ? "?" : ""}: ${prop.type}`
      );
    }
    propsTypeParts.push("children?: React.ReactNode");

    // Build style expression
    const styleArgs: string[] = [];

    // If extending, add base styles
    if (isExtending && extendsFrom) {
      styleArgs.push(`styles.${toCamelCase(extendsFrom)}`);
    }
    styleArgs.push(`styles.${styleName}`);

    // Add conditional styles for transient props
    for (const prop of transientProps) {
      if (prop.truthyStyleName) {
        styleArgs.push(`${prop.name} && ${prop.truthyStyleName}`);
      }
    }

    const styleExpr = `{...stylex.props(${styleArgs.join(", ")})}`;

    // Determine element to render
    const isComponent =
      baseElement.charAt(0) === baseElement.charAt(0).toUpperCase();
    const element = isComponent ? baseElement : baseElement;

    // Generate the component
    const componentCode = `const ${componentName} = ({ ${propsDestructure.join(
      ", "
    )} }: { ${propsTypeParts.join("; ")} }) => (
  <${element} ${styleExpr} {...props}>
    {children}
  </${element}>
);`;

    try {
      const parsed = j(componentCode);
      const decl = parsed.find(j.VariableDeclaration).at(0);
      if (decl.length > 0) {
        wrappers.push(decl.get().node as VariableDeclaration);
      }
    } catch {
      // Skip if parsing fails - complex components may need manual handling
    }
  }

  return wrappers;
}

// Utility functions

function toCamelCase(str: string): string {
  return str.charAt(0).toLowerCase() + str.slice(1);
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Re-export adapter types for convenience
export type {
  Adapter,
  AdapterContext,
  DynamicNodeContext,
  DynamicNodeDecision,
  DynamicNodeHandler,
  FallbackBehavior,
  VariantStyle,
} from "./adapter.js";
export {
  defaultAdapter,
  createAdapter,
  executeDynamicNodeHandlers,
  defaultHandlers,
} from "./adapter.js";
