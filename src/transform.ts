import type { API, FileInfo, Options, Collection, JSCodeshift } from "jscodeshift";
import type {
  VariableDeclaration,
  CallExpression,
  TaggedTemplateExpression,
  TemplateLiteral,
  Identifier,
  Expression,
  ObjectProperty,
} from "jscodeshift";
import type { Adapter, DynamicNodeContext, DynamicNodeDecision } from "./adapter.js";
import { defaultAdapter, executeDynamicNodeHandlers, getFallbackDecision } from "./adapter.js";
import { defaultHandlers } from "./handlers.js";
import { parseStyledCSS, extractDeclarations, type InterpolationLocation } from "./css-parser.js";
import {
  cssRuleToStyleX,
  stripImportant,
  toPropertyLevelConditionals,
  type StyleXObject,
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
 * Collected style information for a component
 */
interface StyleInfo {
  componentName: string;
  baseElement: string;
  styles: StyleXObject;
  variantStyles: Map<string, StyleXObject>;
  dynamicFns: Map<
    string,
    { paramName: string; paramType: string | undefined; styles: StyleXObject }
  >;
  isExtending: boolean;
  extendsFrom: string | undefined;
  attrsConfig: Record<string, unknown> | undefined;
}

/**
 * Transform styled-components to StyleX
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

  // Use provided adapter, ensuring handlers are always present
  const providedAdapter = options.adapter ?? defaultAdapter;
  const adapter: Adapter = {
    ...providedAdapter,
    // Always include default handlers if none provided
    handlers: providedAdapter.handlers?.length ? providedAdapter.handlers : defaultHandlers,
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
  const cssHelperIdentifiers = new Set<string>();

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
              specifier.local?.type === "Identifier" ? specifier.local.name : imported.name;
            cssHelperIdentifiers.add(localName);
          } else if (imported.name === "createGlobalStyle") {
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
    // Cast to any to work around jscodeshift type issues
    return j(node as unknown as string).toSource();
  };
  const classificationCtx = createClassificationContext(
    keyframesIdentifiers,
    styledComponentIdentifiers,
    cssHelperIdentifiers,
    getSource,
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
      path.node.id.type === "Identifier" ? path.node.id.name : "UnnamedComponent";

    const styleInfo = processStyledComponent(
      j,
      init as TaggedTemplateExpression | CallExpression,
      componentName,
      file.path,
      classificationCtx,
      adapter,
      warnings,
      additionalImports,
    );

    if (styleInfo) {
      styleInfos.push(styleInfo);
      styledComponentIdentifiers.add(componentName);
    }
  });

  // Process keyframes declarations
  const keyframesStyles: Map<string, StyleXObject> = new Map();
  root
    .find(j.VariableDeclarator, {
      init: { type: "TaggedTemplateExpression" },
    })
    .forEach((path) => {
      const init = path.node.init as TaggedTemplateExpression;
      if (init.tag.type === "Identifier" && init.tag.name === "keyframes") {
        const name = path.node.id.type === "Identifier" ? path.node.id.name : "animation";
        const keyframeStyles = processKeyframes(j, init, classificationCtx);
        if (keyframeStyles) {
          keyframesStyles.set(name, keyframeStyles);
        }
      }
    });

  // Generate output if we have styles to transform
  if (styleInfos.length > 0 || keyframesStyles.size > 0) {
    hasChanges = true;

    // Generate stylex.create() and stylex.keyframes() calls
    const stylexCode = generateStyleXCode(j, styleInfos, keyframesStyles, adapter);

    // Remove styled-components import and add stylex import
    styledImports.remove();

    // Add stylex import at the top
    const stylexImport = j.importDeclaration(
      [j.importNamespaceSpecifier(j.identifier("stylex"))],
      j.literal("@stylexjs/stylex"),
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
        root.find(j.ImportDeclaration).at(-1).insertAfter(importDecl.nodes()[0]!);
      }
    }

    // Add adapter imports from getImports()
    for (const importStatement of adapter.getImports()) {
      const parsed = j(importStatement);
      const importDecl = parsed.find(j.ImportDeclaration).at(0);
      if (importDecl.length > 0) {
        root.find(j.ImportDeclaration).at(-1).insertAfter(importDecl.nodes()[0]!);
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
          // Remove css helpers that are used in styled components
          if (cssHelperIdentifiers.has(d.id.name)) {
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

    // Insert styles declaration after imports
    const lastImport = root.find(j.ImportDeclaration).at(-1);
    if (lastImport.length > 0) {
      lastImport.insertAfter(stylexCode);
    } else {
      root.get().node.program.body.unshift(stylexCode);
    }

    // Transform JSX usage
    transformJSXUsage(j, root, styleInfos, styledComponentIdentifiers);
  }

  return {
    code: hasChanges ? root.toSource() : null,
    warnings,
  };
}

/**
 * Check if an expression is a styled component declaration
 */
function isStyledComponentDeclaration(expr: Expression | null | undefined): boolean {
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
    // styled.div.attrs(...)`...`
    if (tag.type === "CallExpression") {
      const callee = tag.callee;
      if (callee.type === "MemberExpression" && callee.property.type === "Identifier") {
        if (callee.property.name === "attrs" || callee.property.name === "withConfig") {
          return isStyledComponentDeclaration(callee.object as Expression);
        }
      }
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
  additionalImports: Set<string>,
): StyleInfo | null {
  let templateLiteral: TemplateLiteral | null = null;
  let baseElement = "div";
  let isExtending = false;
  let extendsFrom: string | undefined;
  let attrsConfig: Record<string, unknown> | undefined;

  // Extract template literal and base element
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
        // styled.div.attrs(...) or styled(Component).attrs(...)
        const memberExpr = tag.callee;
        if (
          memberExpr.property.type === "Identifier" &&
          (memberExpr.property.name === "attrs" || memberExpr.property.name === "withConfig")
        ) {
          // Extract attrs config if present
          if (memberExpr.property.name === "attrs" && tag.arguments[0]) {
            attrsConfig = {}; // TODO: Parse attrs config
          }

          // Get the base from the object
          const obj = memberExpr.object;
          if (obj.type === "MemberExpression" && obj.property.type === "Identifier") {
            baseElement = obj.property.name;
          } else if (obj.type === "CallExpression") {
            const innerCallee = obj.callee;
            if (innerCallee.type === "Identifier" && innerCallee.name === "styled") {
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
  }

  if (!templateLiteral) {
    return null;
  }

  // Parse the CSS
  const parsed = parseStyledCSS(
    templateLiteral.quasis,
    templateLiteral.expressions as Expression[],
  );
  const rules = extractDeclarations(parsed.root);

  if (rules.length === 0) {
    return null;
  }

  // Convert to StyleX and process interpolations
  const mainRule = rules[0]!;
  let styles = toPropertyLevelConditionals(cssRuleToStyleX(mainRule));

  // Process dynamic values
  const variantStyles = new Map<string, StyleXObject>();
  const dynamicFns = new Map<
    string,
    { paramName: string; paramType: string | undefined; styles: StyleXObject }
  >();

  // Process each interpolation
  for (const [_index, location] of parsed.interpolations) {
    const classified = classifyInterpolation(location, classificationCtx);
    const context = buildDynamicNodeContext(classified, location, componentName, filePath);

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
      warnings,
    );
  }

  // Clean up dynamic placeholders from styles
  styles = cleanupDynamicPlaceholders(styles);

  return {
    componentName,
    baseElement,
    styles,
    variantStyles,
    dynamicFns,
    isExtending,
    extendsFrom,
    attrsConfig,
  };
}

/**
 * Process keyframes declaration
 */
function processKeyframes(
  _j: JSCodeshift,
  expr: TaggedTemplateExpression,
  _classificationCtx: ReturnType<typeof createClassificationContext>,
): StyleXObject | null {
  const templateLiteral = expr.quasi;
  const parsed = parseStyledCSS(
    templateLiteral.quasis,
    templateLiteral.expressions as Expression[],
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
        frameStyles[decl.property] = stripImportant(decl.value);
      }
      keyframeStyles[selector] = frameStyles;
    }

    // Process nested rules (the actual keyframe definitions)
    for (const nested of rule.nestedRules) {
      let nestedSelector = nested.selector.trim();
      if (nestedSelector.startsWith("&")) nestedSelector = nestedSelector.slice(1).trim();

      const frameStyles: StyleXObject = {};
      for (const decl of nested.declarations) {
        frameStyles[decl.property] = stripImportant(decl.value);
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
  filePath: string,
): DynamicNodeContext {
  return {
    type: classified.type,
    index: location.index,
    cssProperty: location.context.property,
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
  warnings: TransformWarning[],
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
        styles[context.cssProperty] = decision.value;
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
        const variantName = `${toCamelCase(context.componentName)}${variant.name}`;
        const existing = variantStyles.get(variantName) ?? {};
        variantStyles.set(variantName, { ...existing, ...variant.styles });
      }
      break;
    }

    case "dynamic-fn": {
      // Create a dynamic style function
      const fnName = `${toCamelCase(context.componentName)}${capitalize(decision.paramName)}`;
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
    } else if (typeof value === "string" && value.includes("__INTERPOLATION_")) {
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
 */
function generateStyleXCode(
  j: JSCodeshift,
  styleInfos: StyleInfo[],
  keyframesStyles: Map<string, StyleXObject>,
  _adapter: Adapter,
): VariableDeclaration {
  const properties: Array<{ key: Identifier; value: Expression }> = [];

  // Keyframes are generated as separate stylex.keyframes() calls below
  void keyframesStyles;

  // Add component styles
  for (const info of styleInfos) {
    const styleName = toCamelCase(info.componentName);
    properties.push({
      key: j.identifier(styleName),
      value: styleObjectToAST(j, info.styles),
    });

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
          j.tsTypeReference(j.identifier(fnConfig.paramType)),
        );
      }
      const fnBody = styleObjectToAST(j, fnConfig.styles);
      // Use parenthesized expression for object return (cast to any for jscodeshift type compat)
      const parenthesizedBody = j.parenthesizedExpression(
        fnBody as unknown as Parameters<typeof j.parenthesizedExpression>[0],
      );
      const arrowFn = j.arrowFunctionExpression(
        [param],
        parenthesizedBody as unknown as Parameters<typeof j.arrowFunctionExpression>[1],
      );
      properties.push({
        key: j.identifier(fnName),
        value: arrowFn,
      });
    }
  }

  // Build the object expression (cast to any for jscodeshift type compat)
  const objectProps = properties.map(({ key, value }) =>
    j.objectProperty(key, value as unknown as Parameters<typeof j.objectProperty>[1]),
  );

  // Create stylex.create() call
  const createCall = j.callExpression(
    j.memberExpression(j.identifier("stylex"), j.identifier("create")),
    [j.objectExpression(objectProps)],
  );

  // Generate keyframes declarations
  const declarations: VariableDeclaration["declarations"] = [];

  for (const [name, keyframeStyles] of keyframesStyles) {
    const styleObj = styleObjectToAST(j, keyframeStyles);
    const keyframesCall = j.callExpression(
      j.memberExpression(j.identifier("stylex"), j.identifier("keyframes")),
      [styleObj as unknown as Parameters<typeof j.callExpression>[1][number]],
    );
    declarations.push(j.variableDeclarator(j.identifier(name), keyframesCall));
  }

  // Add styles declaration
  declarations.push(j.variableDeclarator(j.identifier("styles"), createCall));

  return j.variableDeclaration("const", declarations);
}

/**
 * Convert a style object to AST expression
 */
function styleObjectToAST(j: JSCodeshift, styles: StyleXObject): Expression {
  const properties: ObjectProperty[] = [];

  for (const [key, value] of Object.entries(styles)) {
    const keyNode = isValidIdentifier(key) ? j.identifier(key) : j.literal(key);

    let valueNode: Expression;

    if (value === null) {
      // Handle null values explicitly (used for default: null in conditionals)
      valueNode = j.literal(null);
    } else if (typeof value === "string") {
      // Check if it's a variable reference or expression
      if (isVariableReference(value)) {
        valueNode = j.identifier(value);
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

    properties.push(
      j.objectProperty(keyNode, valueNode as unknown as Parameters<typeof j.objectProperty>[1]),
    );
  }

  return j.objectExpression(properties as unknown as Parameters<typeof j.objectExpression>[0]);
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

/**
 * Check if a value looks like a variable reference (not a CSS value)
 * Only certain patterns should be treated as JS identifiers
 */
function isVariableReference(value: string): boolean {
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
 * Transform JSX usage of styled components
 */
function transformJSXUsage(
  j: JSCodeshift,
  root: Collection,
  styleInfos: StyleInfo[],
  _styledComponentIdentifiers: Set<string>,
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
    }

    // Add this component's own style
    styleRefs.push(`styles.${toCamelCase(info.componentName)}`);

    // Replace the element name with the base element
    opening.name = j.jsxIdentifier(baseElement);
    if (path.node.closingElement) {
      path.node.closingElement.name = j.jsxIdentifier(baseElement);
    }

    // Check for variant props and add corresponding styles
    const propsToRemove: string[] = [];
    const attributes = opening.attributes ?? [];
    for (const attr of attributes) {
      if (attr.type !== "JSXAttribute" || attr.name.type !== "JSXIdentifier") continue;

      const propName = attr.name.name;

      // Check if this prop controls a variant
      for (const [variantName] of info.variantStyles) {
        const expectedProp = variantName.replace(toCamelCase(info.componentName), "");
        const propWithPrefix = `$${expectedProp.charAt(0).toLowerCase()}${expectedProp.slice(1)}`;

        if (propName === propWithPrefix || propName === expectedProp.toLowerCase()) {
          // Add variant style conditionally
          if (attr.value === null) {
            // Boolean prop (e.g., $primary)
            styleRefs.push(`styles.${variantName}`);
          } else if (attr.value && attr.value.type === "JSXExpressionContainer") {
            // Expression value - add conditional
            const expr = j(attr.value.expression as unknown as string).toSource();
            styleRefs.push(`${expr} && styles.${variantName}`);
          }
          propsToRemove.push(propName);
        }
      }
    }

    // Remove variant props
    opening.attributes = attributes.filter((attr) => {
      if (attr.type !== "JSXAttribute" || attr.name.type !== "JSXIdentifier") return true;
      return !propsToRemove.includes(attr.name.name);
    });

    // Create stylex.props(...) spread
    const stylexArgs: Expression[] = styleRefs.map((ref) => {
      if (ref.includes("&&")) {
        // Parse the conditional expression
        const [condition, style] = ref.split(" && ");
        return j.logicalExpression(
          "&&",
          j.identifier(condition!.trim()),
          j.identifier(style!.trim()),
        ) as unknown as Expression;
      }
      return j.identifier(ref) as unknown as Expression;
    });
    const stylexPropsCall = j.callExpression(
      j.memberExpression(j.identifier("stylex"), j.identifier("props")),
      stylexArgs as unknown as Parameters<typeof j.callExpression>[1],
    );

    const spreadAttr = j.jsxSpreadAttribute(stylexPropsCall);

    // Add the spread attribute
    opening.attributes.push(spreadAttr);
  });
}

/**
 * Detect patterns that need warnings
 */
function detectWarningPatterns(
  j: JSCodeshift,
  root: Collection,
  warnings: TransformWarning[],
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
export { defaultAdapter, createAdapter, executeDynamicNodeHandlers } from "./adapter.js";
export { defaultHandlers } from "./handlers.js";
