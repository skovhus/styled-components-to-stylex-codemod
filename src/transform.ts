import type { API, FileInfo, Options, Collection, JSCodeshift } from "jscodeshift";
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
  ASTPath,
} from "jscodeshift";
import type { Adapter, DynamicNodeContext, DynamicNodeDecision } from "./adapter.js";
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
 * CSS variable injection for ancestor-hover-current pattern
 * Used when a child references ${Parent}:hover & to style itself
 */
interface CSSVarInjection {
  /** Target parent component name (e.g., "Link") */
  parentComponentName: string;
  /** CSS variable name (e.g., "--sc2sx-icon-fill") */
  varName: string;
  /** Default value for the variable */
  defaultValue: string | number;
  /** Pseudo-class variant value (e.g., { ":hover": "rebeccapurple" }) */
  pseudoValue: string | number;
  /** Pseudo-class (e.g., ":hover") */
  pseudo: string;
}

/**
 * Attribute selector info for wrapper generation
 */
interface AttributeSelectorInfo {
  /** Selector (e.g., "[disabled]", "[type=\"checkbox\"]") */
  selector: string;
  /** Style name for this selector (e.g., "inputDisabled") */
  styleName: string;
  /** Prop to check (e.g., "disabled", "type") */
  propName: string;
  /** Expected value for equality check (undefined for boolean attrs like disabled) */
  propValue: string | undefined;
  /** Operator for href/src selectors (e.g., "^=" for startsWith, "$=" for endsWith) */
  operator: "^=" | "$=" | "*=" | "=" | undefined;
}

/**
 * Sibling selector info for wrapper generation
 */
interface SiblingSelectorInfo {
  /** Original selector (e.g., "& + &") */
  selector: string;
  /** Style name (e.g., "adjacentSibling") */
  styleName: string;
  /** Prop name for JSX (e.g., "isAdjacentSibling") */
  propName: string;
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
  /** Variant conditions: maps variant name to prop name and comparison value */
  variantConditions: Map<string, { propName: string; comparisonValue?: string }>;
  dynamicFns: Map<
    string,
    {
      paramName: string;
      paramType: string | undefined;
      styles: StyleXObject;
      originalPropName?: string;
    }
  >;
  isExtending: boolean;
  extendsFrom: string | undefined;
  attrsConfig: AttrsConfig | undefined;
  jsxRewriteRules: Array<
    | { type: "direct-children"; styleNames: string[] }
    | { type: "direct-children-except-first"; styleNames: string[] }
    | { type: "direct-children-except-last"; styleNames: string[] }
    | { type: "direct-children-first"; styleNames: string[] }
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
  /** Attribute selectors for wrapper prop-based application */
  attributeSelectors: AttributeSelectorInfo[];
  /** Sibling selectors for wrapper prop-based application */
  siblingSelectors: SiblingSelectorInfo[];
  /** Whether component uses `as` prop for polymorphism */
  supportsAs: boolean;
  /** Whether component has shouldForwardProp config */
  hasShouldForwardProp: boolean;
  /** Props to filter (from shouldForwardProp) */
  filteredProps: string[];
  /** Whether to filter $-prefixed props */
  filterTransientProps: boolean;
  /** Whether styles use specificity hacks (&&, &&&) */
  hasSpecificityHacks: boolean;
  /** CSS variable injections needed for parent components (ancestor-hover pattern) */
  cssVarInjections: CSSVarInjection[];
  /** Whether dynamic functions are from object syntax (need special wrapper) */
  hasObjectSyntaxDynamicFns: boolean;
  /** Leading comments from the original styled component declaration (JSDoc, etc.) */
  leadingComments: Array<{ type: string; value: string }> | undefined;
  /** Bailed expressions that reference props - need inline styles */
  bailedExpressions: Array<{
    cssProperty: string;
    sourceCode: string;
    referencedProps: string[];
  }>;
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
              specifier.local?.type === "Identifier" ? specifier.local.name : imported.name;
            cssHelperIdentifiers.add(localName);
          } else if (imported.name === "createGlobalStyle") {
            const localName =
              specifier.local?.type === "Identifier" ? specifier.local.name : imported.name;
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
      if (init.tag.type === "Identifier" && createGlobalStyleIdentifiers.has(init.tag.name)) {
        if (path.node.id.type === "Identifier") {
          globalStyleDeclarations.add(path.node.id.name);
        }
      }
      // Track css`` helper variable names (e.g., const truncate = css`...`)
      if (init.tag.type === "Identifier" && cssHelperIdentifiers.has(init.tag.name)) {
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
    getSource,
  );

  // Collect all style infos
  const styleInfos: StyleInfo[] = [];
  const additionalImports: Set<string> = new Set();
  let hasChanges = false;

  // Pre-scan JSX to detect which components use `forwardedAs` props (these need wrappers)
  // When forwardedAs is used, the component AND related components need wrappers
  // Note: we also need to track the inheritance chain
  const componentsWithForwardedAsProp = new Set<string>();
  root.find(j.JSXElement).forEach((path) => {
    const opening = path.node.openingElement;
    if (opening.name.type !== "JSXIdentifier") return;

    const componentName = opening.name.name;
    if (!styledComponentIdentifiers.has(componentName)) return;

    for (const attr of opening.attributes ?? []) {
      if (attr.type !== "JSXAttribute" || attr.name.type !== "JSXIdentifier") continue;
      // Only `forwardedAs` triggers wrapper generation, not plain `as`
      if (attr.name.name === "forwardedAs") {
        componentsWithForwardedAsProp.add(componentName);
        break;
      }
    }
  });

  // When a component uses forwardedAs, also mark parent components in the inheritance chain
  // because they also need `as` support for the pattern to work
  // This is determined post-process after we know which components extend which

  // Process styled component declarations
  root.find(j.VariableDeclarator).forEach((path) => {
    const init = path.node.init;
    if (!isStyledComponentDeclaration(init)) {
      return;
    }

    const componentName =
      path.node.id.type === "Identifier" ? path.node.id.name : "UnnamedComponent";

    // Capture leading comments from the parent VariableDeclaration
    const varDeclPath = path.parentPath;
    const leadingComments =
      varDeclPath?.node?.comments?.filter((c: { leading?: boolean }) => c.leading !== false) ?? [];

    const styleInfo = processStyledComponent(
      j,
      init as TaggedTemplateExpression | CallExpression,
      componentName,
      file.path,
      classificationCtx,
      adapter,
      warnings,
      additionalImports,
      componentsWithForwardedAsProp.has(componentName),
      leadingComments.length > 0 ? leadingComments : undefined,
    );

    if (styleInfo) {
      styleInfos.push(styleInfo);
      styledComponentIdentifiers.add(componentName);
    }
  });

  // Inject CSS variables from child components into parent components
  // This handles the ${Parent}:hover & pattern where the child references a parent's pseudo-class
  for (const childInfo of styleInfos) {
    for (const injection of childInfo.cssVarInjections) {
      const parentInfo = styleInfos.find((s) => s.componentName === injection.parentComponentName);
      if (parentInfo) {
        // Add CSS custom property to parent's styles with pseudo-class variant
        parentInfo.styles[injection.varName] = {
          default: injection.defaultValue,
          [injection.pseudo]: injection.pseudoValue,
        };
      }
    }
  }

  // When a component uses forwardedAs, also mark parent components in the inheritance chain
  // because they also need `as` support (e.g., ButtonWrapper extends Button, both need wrappers)
  for (const info of styleInfos) {
    if (info.supportsAs && info.extendsFrom) {
      // Walk up the inheritance chain and mark all parent components
      let current = info.extendsFrom;
      while (current) {
        const parentInfo = styleInfos.find((s) => s.componentName === current);
        if (parentInfo) {
          parentInfo.supportsAs = true;
          parentInfo.needsWrapper = true;
          if (parentInfo.extendsFrom) {
            current = parentInfo.extendsFrom;
          } else {
            break;
          }
        } else {
          break;
        }
      }
    }
  }

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
        const name = path.node.id.type === "Identifier" ? path.node.id.name : "animation";
        const keyframeStyles = processKeyframes(j, init, classificationCtx);
        if (keyframeStyles) {
          keyframesStyles.set(name, keyframeStyles);
        }
      }
      // Process css`` helpers
      if (init.tag.type === "Identifier" && cssHelperIdentifiers.has(init.tag.name)) {
        const name = path.node.id.type === "Identifier" ? path.node.id.name : "cssHelper";
        const parsed = parseStyledCSS(init.quasi.quasis, init.quasi.expressions as Expression[]);
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
    const stylexCode = generateStyleXCode(j, styleInfos, keyframesStyles, adapter, cssHelperStyles);

    // Remove styled-components import and add stylex import
    styledImports.remove();

    // Remove @emotion/is-prop-valid import (used by shouldForwardProp but not needed in output)
    root
      .find(j.ImportDeclaration, {
        source: { value: "@emotion/is-prop-valid" },
      })
      .remove();

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

    // Find the first styled component VariableDeclaration BEFORE removing them
    // This preserves variable declarations that styles might reference (e.g., const dynamicColor = "#BF4F74")

    // Collect AST nodes that should be removed (save references before any modifications)
    const nodesToRemove: ASTPath<VariableDeclaration>[] = [];
    let firstStyledDecl: ASTPath<VariableDeclaration> | null = null;
    let lastStyledDecl: ASTPath<VariableDeclaration> | null = null;

    // Find base components that styled components extend (non-styled components)
    const baseComponentsToFind = new Set<string>();
    for (const info of styleInfos) {
      if (info.extendsFrom && !styledComponentIdentifiers.has(info.extendsFrom)) {
        baseComponentsToFind.add(info.extendsFrom);
      }
    }

    // Track declarations of base components (non-styled components that get extended)
    let insertBeforeBaseComponent: ASTPath | null = null;

    // Check for base components defined as function declarations first
    root.find(j.FunctionDeclaration).forEach((path) => {
      if (path.node.id?.type === "Identifier" && baseComponentsToFind.has(path.node.id.name)) {
        if (!insertBeforeBaseComponent) {
          insertBeforeBaseComponent = path;
        }
      }
    });

    root.find(j.VariableDeclaration).forEach((path) => {
      const declarators = path.node.declarations;

      // Check if this declaration contains a base component we're looking for
      const hasBaseComponent = declarators.some((d) => {
        if (d.type === "VariableDeclarator" && d.id.type === "Identifier") {
          return baseComponentsToFind.has(d.id.name);
        }
        return false;
      });

      if (hasBaseComponent && !insertBeforeBaseComponent) {
        insertBeforeBaseComponent = path;
      }

      const hasStyledComponent = declarators.some((d) => {
        if (d.type === "VariableDeclarator" && d.id.type === "Identifier") {
          if (styledComponentIdentifiers.has(d.id.name)) return true;
          if (keyframesIdentifiers.has(d.id.name)) return true;
          if (cssHelperStyles.has(d.id.name)) return true;
          if (globalStyleDeclarations.has(d.id.name)) return true;
        }
        return false;
      });

      if (hasStyledComponent) {
        if (!firstStyledDecl) {
          firstStyledDecl = path;
        }
        lastStyledDecl = path; // Track the last styled component
        nodesToRemove.push(path);
      }
    });

    // Determine the insertion point:
    // 1. If a styled component extends a non-styled component defined in the file, insert before that base component
    // 2. Otherwise, insert before the LAST styled component (to ensure all referenced variables are declared first)
    // 3. Fall back to after the last import
    const insertionPoint = insertBeforeBaseComponent ?? lastStyledDecl ?? firstStyledDecl;

    if (insertionPoint) {
      for (const code of stylexCode) {
        j(insertionPoint).insertBefore(code);
      }
    } else {
      // Fall back to inserting after last import
      const lastImport = root.find(j.ImportDeclaration).at(-1);
      if (lastImport.length > 0) {
        for (let i = stylexCode.length - 1; i >= 0; i--) {
          lastImport.insertAfter(stylexCode[i]!);
        }
      } else {
        // Insert at beginning in correct order
        for (let i = stylexCode.length - 1; i >= 0; i--) {
          root.get().node.program.body.unshift(stylexCode[i]!);
        }
      }
    }

    // Now remove the original styled component declarations (using saved references)
    for (const path of nodesToRemove) {
      const declarators = path.node.declarations;
      const remainingDeclarators = declarators.filter((d) => {
        if (d.type === "VariableDeclarator" && d.id.type === "Identifier") {
          if (styledComponentIdentifiers.has(d.id.name)) return false;
          if (keyframesIdentifiers.has(d.id.name)) return false;
          if (cssHelperStyles.has(d.id.name)) return false;
          if (globalStyleDeclarations.has(d.id.name)) return false;
        }
        return true;
      });

      if (remainingDeclarators.length === 0) {
        j(path).remove();
      } else if (remainingDeclarators.length < declarators.length) {
        path.node.declarations = remainingDeclarators;
      }
    }

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

    // Generate wrapper components for those that need them
    const wrapperComponents = generateWrapperComponents(j, styleInfos);

    // Insert wrapper components after styles
    if (wrapperComponents.length > 0) {
      // Check if any wrapper needs React types (TypeScript interfaces, React.ReactNode, etc.)
      // Wrappers that use sibling selectors or shouldForwardProp with simple `function Name(props)` don't need React
      const needsReactImport = styleInfos.some((info) => {
        if (!info.needsWrapper) return false;
        // Sibling-only wrappers don't need React (they use untyped props)
        if (
          info.siblingSelectors.length > 0 &&
          info.attributeSelectors.length === 0 &&
          !info.hasShouldForwardProp &&
          info.dynamicFns.size === 0 &&
          info.transientProps.length === 0
        ) {
          return false;
        }
        // shouldForwardProp-only wrappers don't need React (they use simple function pattern)
        if (
          info.hasShouldForwardProp &&
          info.siblingSelectors.length === 0 &&
          info.attributeSelectors.length === 0 &&
          !info.supportsAs
        ) {
          return false;
        }
        // Object-syntax dynamic function wrappers don't need React (simple function pattern)
        if (
          info.hasObjectSyntaxDynamicFns &&
          !info.supportsAs &&
          info.attributeSelectors.length === 0
        ) {
          return false;
        }
        // Other wrappers may need React for TypeScript types
        return true;
      });

      const hasReactImport = root.find(j.ImportDeclaration).some((p) => {
        const source = p.node.source.value;
        return source === "react";
      });

      if (needsReactImport && !hasReactImport) {
        const reactImport = j.importDeclaration(
          [j.importDefaultSpecifier(j.identifier("React"))],
          j.literal("react"),
        );
        const firstImport = root.find(j.ImportDeclaration).at(0);
        if (firstImport.length > 0) {
          firstImport.insertBefore(reactImport);
        } else {
          root.get().node.program.body.unshift(reactImport);
        }
      } else if (!needsReactImport && hasReactImport) {
        // Remove React import if it's no longer needed (e.g., after converting styled-components)
        root
          .find(j.ImportDeclaration, {
            source: { value: "react" },
          })
          .filter((p) => {
            // Only remove default import of React that's not used elsewhere
            const specifiers = p.node.specifiers ?? [];
            return (
              specifiers.length === 1 &&
              specifiers[0]?.type === "ImportDefaultSpecifier" &&
              specifiers[0].local?.name === "React"
            );
          })
          .remove();
      }

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
            const wrapper = wrapperComponents[i]!;
            j(path).insertAfter(wrapper as unknown as VariableDeclaration);
          }
        }
      });
    }

    // Transform JSX usage
    transformJSXUsage(j, root, styleInfos, styledComponentIdentifiers, file.source);

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
    // styled.div.attrs(...)`...` or styled.div.withConfig(...)`...`
    if (tag.type === "CallExpression") {
      const callee = tag.callee;
      if (callee.type === "MemberExpression" && callee.property.type === "Identifier") {
        if (callee.property.name === "attrs" || callee.property.name === "withConfig") {
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
    if (memberExpr.object.type === "Identifier" && memberExpr.object.name === "styled") {
      return true;
    }
  }

  // styled(Component)
  if (expr.type === "CallExpression") {
    const callExpr = expr as CallExpression;
    if (callExpr.callee.type === "Identifier" && callExpr.callee.name === "styled") {
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
  additionalImports: Set<string>,
  hasAsPropInJSX = false,
  leadingComments?: Array<{ type: string; value: string }>,
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
          (memberExpr.property.name === "attrs" || memberExpr.property.name === "withConfig")
        ) {
          // Extract attrs config if present
          if (memberExpr.property.name === "attrs" && tag.arguments[0]) {
            attrsConfig = parseAttrsConfig(j, tag.arguments[0] as Expression);
          }
          // withConfig is handled by just ignoring it and processing styles normally

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
        } else if (arg?.type === "ArrowFunctionExpression" || arg?.type === "FunctionExpression") {
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
              if (stmt.type === "ReturnStatement" && stmt.argument?.type === "ObjectExpression") {
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
  const variantConditions = new Map<string, { propName: string; comparisonValue?: string }>();
  const dynamicFns = new Map<
    string,
    {
      paramName: string;
      paramType: string | undefined;
      styles: StyleXObject;
      originalPropName?: string;
    }
  >();
  let needsDefaultMarker = false;
  let attributeSelectors: AttributeSelectorInfo[] = [];
  let siblingSelectors: SiblingSelectorInfo[] = [];
  let hasSpecificityHacks = false;
  let cssVarInjections: CSSVarInjection[] = [];
  let hasShouldForwardProp = false;
  let filteredProps: string[] = [];
  let filterTransientProps = false;
  let supportsAs = hasAsPropInJSX;
  const bailedExpressions: Array<{
    cssProperty: string;
    sourceCode: string;
    referencedProps: string[];
  }> = [];

  // Check for .withConfig({ shouldForwardProp: ... }) pattern
  if (expr.type === "TaggedTemplateExpression") {
    const tag = expr.tag;
    if (tag.type === "CallExpression" && tag.callee.type === "MemberExpression") {
      const memberExpr = tag.callee;
      if (memberExpr.property.type === "Identifier" && memberExpr.property.name === "withConfig") {
        const configArg = tag.arguments[0];
        if (configArg?.type === "ObjectExpression") {
          for (const prop of configArg.properties) {
            if (
              prop.type === "ObjectProperty" &&
              prop.key.type === "Identifier" &&
              prop.key.name === "shouldForwardProp"
            ) {
              hasShouldForwardProp = true;
              // Extract filtered props from the shouldForwardProp function
              const sfpResult = parseShouldForwardProp(prop.value as Expression);
              filteredProps = sfpResult.filteredProps;
              filterTransientProps = sfpResult.filterTransientProps;
            }
          }
        }
      }
    }
  }

  if (templateLiteral) {
    // Template literal syntax - parse CSS
    const parsed = parseStyledCSS(
      templateLiteral.quasis,
      templateLiteral.expressions as Expression[],
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

    // Extract universal selectors BEFORE toPropertyLevelConditionals flattens them
    extractUniversalSelectorStyles(rawStyles, extraStyles, jsxRewriteRules, componentName);

    // Extract descendant styled-component selectors (e.g. `${Icon}` and `&:hover ${Icon}`)
    // into extra style entries + JSX rewrite rules.
    needsDefaultMarker = extractStyledComponentDescendantSelectorStyles(
      rawStyles,
      extraStyles,
      jsxRewriteRules,
      parsed.interpolations,
      componentName,
    );

    // Extract attribute selectors (e.g., &[disabled], &[type="checkbox"])
    attributeSelectors = extractAttributeSelectorStyles(rawStyles, extraStyles, componentName);

    // Extract sibling selectors (e.g., & + &, &.something ~ &)
    siblingSelectors = extractSiblingSelectorStyles(rawStyles, extraStyles, componentName);

    // Extract and flatten specificity hacks (&&, &&&)
    hasSpecificityHacks = extractSpecificityHacks(rawStyles);

    // Extract ancestor-hover patterns (e.g., ${Link}:hover &) into CSS variable references
    cssVarInjections = extractAncestorHoverPatterns(
      rawStyles,
      parsed.interpolations,
      componentName,
    );

    // Now convert remaining styles to property-level conditionals
    styles = toPropertyLevelConditionals(rawStyles);

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
        variantConditions,
        dynamicFns,
        additionalImports,
        warnings,
        bailedExpressions,
      );
    }
  } else if (styleObject && styleObject.type === "ObjectExpression") {
    // Object syntax - convert object properties to styles
    const objectResult = convertObjectExpressionToStyles(
      j,
      styleObject as ObjectExpression,
      hasDynamicStyleFn,
      dynamicStyleParam,
      componentName,
    );
    styles = objectResult.styles;
    // Merge dynamic functions from object syntax
    for (const [fnName, fnConfig] of objectResult.dynamicFns) {
      dynamicFns.set(fnName, fnConfig);
    }
  } else {
    return null;
  }

  // Clean up dynamic placeholders from styles
  styles = cleanupDynamicPlaceholders(styles);

  // Extract transient props from variant styles (for info purposes)
  // Variant names follow pattern: componentNamePropName (e.g., compDraggable for $draggable)
  // Skip variants that have explicit condition info (from variantConditions) - those use their own prop
  const transientProps: TransientPropInfo[] = [];
  const baseStyleName = toCamelCase(componentName);

  for (const [variantName] of variantStyles) {
    // Skip if this variant has explicit condition info (handled by variantConditions)
    if (variantConditions.has(variantName)) {
      continue;
    }

    // Extract prop name from variant name (e.g., compDraggable -> Draggable -> $draggable)
    if (variantName.startsWith(baseStyleName)) {
      const propPart = variantName.slice(baseStyleName.length);
      if (propPart) {
        // Convert PascalCase to $camelCase (e.g., "Draggable" -> "$draggable")
        const propName = "$" + propPart.charAt(0).toLowerCase() + propPart.slice(1);
        transientProps.push({
          name: propName,
          type: "boolean",
          optional: true,
          truthyStyleName: `styles.${variantName}`,
        });
      }
    }
  }

  // Determine if wrapper is needed based on various patterns
  // Wrapper is needed when:
  // - Has attribute selectors that need runtime prop checking
  // - Has sibling selectors that need runtime prop-based application
  // - Has shouldForwardProp with extractable prop filtering logic
  // - Styles use specificity hacks (wrapper simplifies output)
  // - Uses `as` prop for polymorphism (detected from JSX usage later)
  // - Has dynamic functions from object syntax (props need to be stripped from DOM)
  // NOTE: dynamicFns from template literals can be called inline in JSX
  // NOTE: dynamicFns from object syntax need wrapper to filter transient props
  // NOTE: Simple shouldForwardProp like `prop !== "x"` doesn't require wrapper
  const needsWrapperForForwardProp =
    hasShouldForwardProp && (filteredProps.length > 0 || filterTransientProps);

  // Check if any dynamic function has an original prop name (from object syntax)
  const hasObjectSyntaxDynamicFns = Array.from(dynamicFns.values()).some(
    (fn) => fn.originalPropName !== undefined,
  );

  const needsWrapper =
    attributeSelectors.length > 0 ||
    siblingSelectors.length > 0 ||
    needsWrapperForForwardProp ||
    hasSpecificityHacks ||
    supportsAs ||
    hasObjectSyntaxDynamicFns ||
    bailedExpressions.length > 0;

  return {
    componentName,
    baseElement,
    styles,
    extraStyles,
    variantStyles,
    variantConditions,
    dynamicFns,
    isExtending,
    extendsFrom,
    attrsConfig,
    jsxRewriteRules,
    transientProps,
    needsWrapper,
    needsDefaultMarker,
    attributeSelectors,
    siblingSelectors,
    supportsAs,
    hasShouldForwardProp,
    filteredProps,
    filterTransientProps,
    hasSpecificityHacks,
    cssVarInjections,
    hasObjectSyntaxDynamicFns,
    leadingComments,
    bailedExpressions,
  };
}

/**
 * Extract attribute selectors from styles into separate style entries.
 * Returns info for wrapper generation.
 *
 * Handles patterns like:
 * - &[disabled] { ... }
 * - &[type="checkbox"] { ... }
 * - &[href^="https"] { ... }
 * - &[target="_blank"]::after { ... }
 */
function extractAttributeSelectorStyles(
  styles: StyleXObject,
  extraStyles: Map<string, StyleXObject>,
  componentName: string,
): AttributeSelectorInfo[] {
  const attributeSelectors: AttributeSelectorInfo[] = [];
  const baseName = toCamelCase(componentName);

  // Collect keys to process (avoid mutation during iteration)
  const entries = Object.entries(styles);

  for (const [selectorKey, value] of entries) {
    if (typeof value !== "object" || value === null) continue;

    // Match attribute selectors: [attr], [attr="value"], [attr^="value"], etc.
    // May be combined with pseudo-elements like [target="_blank"]::after
    const attrMatch = selectorKey.match(
      /^&?\[([a-zA-Z-]+)(?:(\^=|\$=|\*=|=)"([^"]+)")?\](::[\w-]+)?$/,
    );

    if (!attrMatch) continue;

    const [, attrName, operator, attrValue, pseudoElement] = attrMatch;
    if (!attrName) continue;

    // Generate style name based on attribute
    let styleSuffix: string;
    if (attrValue) {
      // e.g., inputCheckbox, linkHttps, linkPdf
      const cleanValue = attrValue
        .replace(/[^a-zA-Z0-9]/g, "")
        .replace(/^(.)/, (m) => m.toUpperCase());
      styleSuffix = capitalize(attrName) + cleanValue;
    } else {
      // Boolean attribute like [disabled], [readonly]
      styleSuffix = capitalize(attrName);
    }

    const styleName = baseName + styleSuffix;

    // Handle pseudo-element combined selectors (e.g., [target="_blank"]::after)
    let styleValue = value as StyleXObject;
    if (pseudoElement) {
      // Wrap the styles in the pseudo-element key
      styleValue = { [pseudoElement]: value };
    }

    extraStyles.set(styleName, styleValue as StyleXObject);

    attributeSelectors.push({
      selector: selectorKey,
      styleName,
      propName: attrName,
      propValue: attrValue,
      operator: operator as AttributeSelectorInfo["operator"],
    });

    // Remove from main styles
    delete styles[selectorKey];
  }

  return attributeSelectors;
}

/**
 * Extract sibling selectors from styles into separate style entries.
 * Returns info for wrapper generation.
 *
 * Handles patterns like:
 * - & + & (adjacent sibling)
 * - &.something ~ & (general sibling after .something)
 */
function extractSiblingSelectorStyles(
  styles: StyleXObject,
  extraStyles: Map<string, StyleXObject>,
  _componentName: string,
): SiblingSelectorInfo[] {
  const siblingSelectors: SiblingSelectorInfo[] = [];

  const entries = Object.entries(styles);

  for (const [selectorKey, value] of entries) {
    if (typeof value !== "object" || value === null) continue;

    // Match adjacent sibling selector: & + &
    if (selectorKey === "&+&" || selectorKey === "& + &") {
      extraStyles.set("adjacentSibling", value as StyleXObject);
      siblingSelectors.push({
        selector: selectorKey,
        styleName: "adjacentSibling",
        propName: "isAdjacentSibling",
      });
      delete styles[selectorKey];
      continue;
    }

    // Match general sibling selector with class: &.something ~ &
    const generalSibMatch = selectorKey.match(/^&\.(\w+)\s*~\s*&$/);
    if (generalSibMatch) {
      const className = generalSibMatch[1]!;
      const styleName = `siblingAfter${capitalize(className)}`;
      const propName = `isSiblingAfter${capitalize(className)}`;

      extraStyles.set(styleName, value as StyleXObject);
      siblingSelectors.push({
        selector: selectorKey,
        styleName,
        propName,
      });
      delete styles[selectorKey];
    }
  }

  return siblingSelectors;
}

/**
 * Extract specificity hack selectors (&& and &&&) and flatten them.
 * Returns true if specificity hacks were found.
 */
function extractSpecificityHacks(styles: StyleXObject): boolean {
  let hasHacks = false;
  const entries = Object.entries(styles);

  for (const [selectorKey, value] of entries) {
    if (typeof value !== "object" || value === null) continue;

    // Match && or &&& or more
    if (/^&{2,}$/.test(selectorKey)) {
      hasHacks = true;
      // Flatten: merge nested styles into parent
      Object.assign(styles, value);
      delete styles[selectorKey];
      continue;
    }

    // Match context-based: .wrapper && { ... }
    const contextMatch = selectorKey.match(/^\.[\w-]+\s+&{2,}$/);
    if (contextMatch) {
      hasHacks = true;
      // Flatten context-based selectors too
      Object.assign(styles, value);
      delete styles[selectorKey];
    }
  }

  return hasHacks;
}

/**
 * Extract universal selector styles (e.g. `> *`, `& *`, `& > *:first-child`) into separate StyleX styles
 * and record JSX rewrite rules to apply them to JSX children.
 *
 * Handles patterns:
 * - `> *` or `& > *` - direct children
 * - `& *` - all descendants (extracted to child styles, needs manual JSX application)
 * - `& > *:not(:first-child)` - direct children except first
 * - `& > *:not(:last-child)` - direct children except last
 * - `& > *:first-child` - first direct child
 * - `&:hover *` - hover affecting descendants (uses CSS custom properties)
 *
 * NOTE: Stylis (the CSS parser) may hoist nested selectors to siblings.
 */
function extractUniversalSelectorStyles(
  styles: StyleXObject,
  extraStyles: Map<string, StyleXObject>,
  jsxRewriteRules: StyleInfo["jsxRewriteRules"],
  componentName: string,
): void {
  // Handle & > * (direct children)
  const directChildKeys = [">*", "> *", "&>*", "& > *", "&> *", "& >*"];
  const directChildKey = directChildKeys.find(
    (k) => typeof styles[k] === "object" && styles[k] !== null,
  );

  // Handle & * (all descendants)
  const descendantKeys = ["& *", "&*"];
  const descendantKey = descendantKeys.find(
    (k) => typeof styles[k] === "object" && styles[k] !== null,
  );

  // Handle & > *:not(:first-child) - sibling selectors due to stylis hoisting
  const notFirstChildKeys = [
    "&>*:not(:first-child)",
    "& > *:not(:first-child)",
    ">*:not(:first-child)",
    "> *:not(:first-child)",
    ":not(:first-child)",
    "&:not(:first-child)",
  ];

  // Handle & > *:not(:last-child)
  const notLastChildKeys = [
    "&>*:not(:last-child)",
    "& > *:not(:last-child)",
    ">*:not(:last-child)",
    "> *:not(:last-child)",
    ":not(:last-child)",
    "&:not(:last-child)",
  ];

  // Handle & > *:first-child
  const firstChildKeys = [
    "&>*:first-child",
    "& > *:first-child",
    ">*:first-child",
    "> *:first-child",
    ":first-child",
    "&:first-child",
  ];

  // Handle &:hover * (hover affecting descendants)
  const hoverDescendantKeys = ["&:hover *", ":hover *", "&:hover*", ":hover*"];

  // Handle & * * (deeply nested)
  const deepDescendantKeys = ["& * *", "&* *", "& **"];

  // Naming prefix based on component name
  const baseName = componentName.charAt(0).toLowerCase() + componentName.slice(1);

  // Process direct children (> *)
  if (directChildKey) {
    const childBlock = styles[directChildKey] as StyleXObject;
    delete styles[directChildKey];

    // Separate base child styles from pseudo-selectors
    const childBase: StyleXObject = {};
    let childNotFirst: StyleXObject | null = null;
    let childNotLast: StyleXObject | null = null;
    let childFirst: StyleXObject | null = null;

    for (const [k, v] of Object.entries(childBlock)) {
      if (k === ":not(:first-child)" || k === "&:not(:first-child)") {
        childNotFirst = v as StyleXObject;
      } else if (k === ":not(:last-child)" || k === "&:not(:last-child)") {
        childNotLast = v as StyleXObject;
      } else if (k === ":first-child" || k === "&:first-child") {
        childFirst = v as StyleXObject;
      } else if (!k.startsWith(":") && !k.startsWith("&:")) {
        childBase[k] = v as StyleXObject[keyof StyleXObject];
      }
    }

    // Add child base styles
    if (Object.keys(childBase).length > 0) {
      const styleName = `${baseName}Child`;
      extraStyles.set(styleName, childBase);
      jsxRewriteRules.push({
        type: "direct-children",
        styleNames: [styleName],
      });
    }

    // Add :not(:first-child) styles
    if (childNotFirst && Object.keys(childNotFirst).length > 0) {
      const styleName = `${baseName}ChildNotFirst`;
      extraStyles.set(styleName, childNotFirst);
      jsxRewriteRules.push({
        type: "direct-children-except-first",
        styleNames: [styleName],
      });
    }

    // Add :not(:last-child) styles
    if (childNotLast && Object.keys(childNotLast).length > 0) {
      const styleName = `${baseName}ChildNotLast`;
      extraStyles.set(styleName, childNotLast);
      jsxRewriteRules.push({
        type: "direct-children-except-last" as const,
        styleNames: [styleName],
      });
    }

    // Add :first-child styles
    if (childFirst && Object.keys(childFirst).length > 0) {
      const styleName = `${baseName}ChildFirst`;
      extraStyles.set(styleName, childFirst);
      jsxRewriteRules.push({
        type: "direct-children-first" as const,
        styleNames: [styleName],
      });
    }
  }

  // Also check for pseudo-selectors as siblings (stylis hoisting)
  for (const k of notFirstChildKeys) {
    if (typeof styles[k] === "object" && styles[k] !== null) {
      const styleName = `${baseName}ChildNotFirst`;
      if (!extraStyles.has(styleName)) {
        extraStyles.set(styleName, styles[k] as StyleXObject);
        jsxRewriteRules.push({
          type: "direct-children-except-first" as const,
          styleNames: [styleName],
        });
      }
      delete styles[k];
    }
  }

  for (const k of notLastChildKeys) {
    if (typeof styles[k] === "object" && styles[k] !== null) {
      const styleName = `${baseName}ChildNotLast`;
      if (!extraStyles.has(styleName)) {
        extraStyles.set(styleName, styles[k] as StyleXObject);
        jsxRewriteRules.push({
          type: "direct-children-except-last" as const,
          styleNames: [styleName],
        });
      }
      delete styles[k];
    }
  }

  for (const k of firstChildKeys) {
    if (typeof styles[k] === "object" && styles[k] !== null) {
      const styleName = `${baseName}ChildFirst`;
      if (!extraStyles.has(styleName)) {
        extraStyles.set(styleName, styles[k] as StyleXObject);
        jsxRewriteRules.push({
          type: "direct-children-first" as const,
          styleNames: [styleName],
        });
      }
      delete styles[k];
    }
  }

  // Process & * (all descendants)
  if (descendantKey) {
    const descendantBlock = styles[descendantKey] as StyleXObject;
    delete styles[descendantKey];

    const styleName = `${baseName}Child`;
    // Merge with existing child styles if any
    const existing = extraStyles.get(styleName) || {};
    extraStyles.set(styleName, { ...existing, ...descendantBlock });

    // Only add rewrite rule if not already present
    const hasRule = jsxRewriteRules.some(
      (r) => "styleNames" in r && r.styleNames.includes(styleName),
    );
    if (!hasRule) {
      jsxRewriteRules.push({
        type: "direct-children",
        styleNames: [styleName],
      });
    }
  }

  // Process &:hover * (hover affecting descendants) - use CSS custom properties
  for (const hoverKey of hoverDescendantKeys) {
    if (typeof styles[hoverKey] === "object" && styles[hoverKey] !== null) {
      const hoverBlock = styles[hoverKey] as StyleXObject;
      delete styles[hoverKey];

      // Convert each property to a CSS custom property with hover variant
      for (const [prop, value] of Object.entries(hoverBlock)) {
        const varName = `--sc2sx-${baseName}-${prop}`;
        // Add CSS custom property to parent styles
        styles[varName] = {
          default: "inherit",
          ":hover": value as string | number,
        };
      }

      // Create child style that uses the CSS variable
      const childStyleName = `${baseName}Child`;
      const childStyles = extraStyles.get(childStyleName) || {};
      for (const prop of Object.keys(hoverBlock)) {
        const varName = `--sc2sx-${baseName}-${prop}`;
        (childStyles as Record<string, unknown>)[prop] = `var(${varName})`;
      }
      extraStyles.set(childStyleName, childStyles);

      // Only add rewrite rule if not already present
      const hasRule = jsxRewriteRules.some(
        (r) => "styleNames" in r && r.styleNames.includes(childStyleName),
      );
      if (!hasRule) {
        jsxRewriteRules.push({
          type: "direct-children",
          styleNames: [childStyleName],
        });
      }
    }
  }

  // Process & * * (deeply nested) - just extract, manual JSX application required
  for (const deepKey of deepDescendantKeys) {
    if (typeof styles[deepKey] === "object" && styles[deepKey] !== null) {
      const deepBlock = styles[deepKey] as StyleXObject;
      delete styles[deepKey];

      const styleName = `${baseName}Grandchild`;
      extraStyles.set(styleName, deepBlock);
      // Note: No JSX rewrite rule - requires manual application
    }
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
  parentComponentName: string,
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
    const withoutAmp = trimmed.startsWith("&") ? trimmed.slice(1).trim() : trimmed;

    let ancestorPseudo: string | null = null;
    let isDescendantComponentSelector = false;

    if (withoutAmp === placeholder) {
      isDescendantComponentSelector = true;
    } else {
      // Try to parse ":hover __INTERPOLATION_0__"
      const parts = withoutAmp.split(/\s+/).filter(Boolean);
      if (parts.length === 2 && parts[1] === placeholder && parts[0]!.startsWith(":")) {
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
        if (existingValue && typeof existingValue === "object" && existingValue !== null) {
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
 * Extract ancestor-hover-current selectors into CSS variable references.
 *
 * Handles patterns like:
 * - `${Link}:hover & { fill: rebeccapurple }` (ancestor pseudo affecting current element)
 *
 * Output strategy:
 * - Replace the property with a CSS variable reference: `fill: "var(--sc2sx-icon-fill, #BF4F74)"`
 * - Record a CSS variable injection for the parent component
 *
 * @returns Array of CSS variable injections needed for parent components
 */
function extractAncestorHoverPatterns(
  styles: StyleXObject,
  interpolations: Map<number, InterpolationLocation>,
  currentComponentName: string,
): CSSVarInjection[] {
  const injections: CSSVarInjection[] = [];

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
    const parentComponentName = (expr as Identifier).name;

    const placeholder = `__INTERPOLATION_${idx}__`;

    // Match pattern: "__INTERPOLATION_0__:hover &" or "__INTERPOLATION_0__:hover&"
    const trimmed = selectorKey.trim();
    const hoverPattern = new RegExp(
      `^${placeholder.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(:\\w+)\\s*&$`,
    );
    const match = trimmed.match(hoverPattern);

    if (!match) continue;

    const pseudo = match[1]!; // e.g., ":hover"
    const nestedStyles = value as StyleXObject;

    // For each property in the nested styles, create a CSS variable
    for (const [prop, propValue] of Object.entries(nestedStyles)) {
      if (typeof propValue === "object") continue; // Skip nested objects

      // Get the current base value from styles (if exists)
      const baseValue = styles[prop];
      if (baseValue === undefined || typeof baseValue === "object") continue;

      // Create CSS variable name: --sc2sx-{childComponent}-{property}
      const childName = currentComponentName.toLowerCase();
      const varName = `--sc2sx-${childName}-${prop}`;

      // Record the injection
      injections.push({
        parentComponentName,
        varName,
        defaultValue: baseValue as string | number,
        pseudoValue: propValue as string | number,
        pseudo,
      });

      // Replace the property with CSS variable reference
      styles[prop] = `var(${varName}, ${baseValue})`;
    }

    // Remove the original selector block
    delete styles[selectorKey];
  }

  return injections;
}

/**
 * Parse shouldForwardProp configuration
 */
function parseShouldForwardProp(expr: Expression): {
  filteredProps: string[];
  filterTransientProps: boolean;
} {
  const result = { filteredProps: [] as string[], filterTransientProps: false };

  // Handle arrow function: (prop) => !["color", "size"].includes(prop)
  if (expr.type === "ArrowFunctionExpression" || expr.type === "FunctionExpression") {
    const funcExpr = expr as
      | import("jscodeshift").ArrowFunctionExpression
      | import("jscodeshift").FunctionExpression;
    const body = funcExpr.body;

    // Check for !prop.startsWith("$") pattern
    if (body.type === "UnaryExpression" && body.operator === "!") {
      const arg = body.argument;
      if (
        arg.type === "CallExpression" &&
        arg.callee.type === "MemberExpression" &&
        arg.callee.property.type === "Identifier"
      ) {
        if (
          arg.callee.property.name === "startsWith" &&
          arg.arguments[0]?.type === "StringLiteral" &&
          (arg.arguments[0] as import("jscodeshift").StringLiteral).value === "$"
        ) {
          result.filterTransientProps = true;
          return result;
        }
      }
    }

    // Check for !["prop1", "prop2"].includes(prop) pattern
    if (body.type === "UnaryExpression" && body.operator === "!") {
      const arg = body.argument;
      if (
        arg.type === "CallExpression" &&
        arg.callee.type === "MemberExpression" &&
        arg.callee.object.type === "ArrayExpression" &&
        arg.callee.property.type === "Identifier" &&
        arg.callee.property.name === "includes"
      ) {
        for (const el of arg.callee.object.elements) {
          if (el?.type === "StringLiteral") {
            result.filteredProps.push(el.value);
          }
        }
      }
    }

    // Check for prop !== "propName" pattern (simple inequality check)
    if (body.type === "BinaryExpression" && body.operator === "!==") {
      // (prop) => prop !== "hasError"
      if (body.right.type === "StringLiteral") {
        result.filteredProps.push(body.right.value);
      }
    }

    // Check for isPropValid(prop) && prop !== "..." pattern (or similar)
    // Handle LogicalExpression with && operator
    if (body.type === "LogicalExpression" && body.operator === "&&") {
      const logicalBody = body as import("jscodeshift").LogicalExpression;
      // Recursively check both sides for prop filtering expressions
      const extractPropsFromExpr = (expr: Expression): void => {
        // Check for prop !== "propName"
        if (expr.type === "BinaryExpression") {
          const binExpr = expr as import("jscodeshift").BinaryExpression;
          if (binExpr.operator === "!==" && binExpr.right.type === "StringLiteral") {
            result.filteredProps.push((binExpr.right as import("jscodeshift").StringLiteral).value);
          }
        }
        // Check for !["prop1", "prop2"].includes(prop)
        if (expr.type === "UnaryExpression") {
          const unaryExpr = expr as import("jscodeshift").UnaryExpression;
          if (unaryExpr.operator === "!") {
            const arg = unaryExpr.argument;
            if (
              arg.type === "CallExpression" &&
              arg.callee.type === "MemberExpression" &&
              arg.callee.object.type === "ArrayExpression" &&
              arg.callee.property.type === "Identifier" &&
              arg.callee.property.name === "includes"
            ) {
              for (const el of arg.callee.object.elements) {
                if (el?.type === "StringLiteral") {
                  result.filteredProps.push(el.value);
                }
              }
            }
          }
        }
        // Recurse into nested LogicalExpressions
        if (expr.type === "LogicalExpression") {
          const logicalExpr = expr as import("jscodeshift").LogicalExpression;
          if (logicalExpr.operator === "&&") {
            extractPropsFromExpr(logicalExpr.left as Expression);
            extractPropsFromExpr(logicalExpr.right as Expression);
          }
        }
      };
      extractPropsFromExpr(logicalBody.left as Expression);
      extractPropsFromExpr(logicalBody.right as Expression);
    }
  }

  return result;
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
  } else if (arg.type === "ArrowFunctionExpression" || arg.type === "FunctionExpression") {
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
            const cond = prop.value as import("jscodeshift").ConditionalExpression;
            // Extract the condition's prop reference (e.g., props.$small -> $small)
            let propRef = "";
            if (cond.test.type === "MemberExpression") {
              const member = cond.test as import("jscodeshift").MemberExpression;
              if (member.property.type === "Identifier") {
                propRef = member.property.name;
              }
            }
            // Get the truthy value
            let truthyVal: string | number | undefined;
            if (cond.consequent.type === "NumericLiteral") {
              truthyVal = (cond.consequent as import("jscodeshift").NumericLiteral).value;
            } else if (cond.consequent.type === "StringLiteral") {
              truthyVal = (cond.consequent as import("jscodeshift").StringLiteral).value;
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
 * Result from converting an object expression to styles
 */
interface ObjectStylesResult {
  styles: StyleXObject;
  dynamicFns: Map<
    string,
    {
      paramName: string;
      paramType: string | undefined;
      styles: StyleXObject;
      originalPropName?: string;
    }
  >;
  needsWrapper: boolean;
}

/**
 * Convert an ObjectExpression to StyleX styles
 */
function convertObjectExpressionToStyles(
  _j: JSCodeshift,
  objExpr: ObjectExpression,
  hasDynamicFn: boolean,
  paramName: string | undefined,
  componentName?: string,
): ObjectStylesResult {
  const styles: StyleXObject = {};
  const dynamicFns = new Map<
    string,
    {
      paramName: string;
      paramType: string | undefined;
      styles: StyleXObject;
      originalPropName?: string;
    }
  >();
  let needsWrapper = false;

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
      } else if (prop.value.type === "TemplateLiteral" && prop.value.expressions.length === 0) {
        // Simple template literal without expressions
        styles[normalizedKey] = prop.value.quasis[0]?.value.cooked ?? "";
      } else if (
        hasDynamicFn &&
        paramName &&
        prop.value.type === "LogicalExpression" &&
        prop.value.operator === "||"
      ) {
        // Handle props.$prop || defaultValue pattern
        const left = prop.value.left;
        const right = prop.value.right;

        // Extract default value from right side
        let defaultValue: string | number | null = null;
        if (right.type === "StringLiteral") {
          defaultValue = right.value;
        } else if (right.type === "NumericLiteral") {
          defaultValue = right.value;
        }

        // Extract prop name from left side (props.$background -> $background)
        let propAccessName: string | null = null;
        if (
          left.type === "MemberExpression" &&
          left.object.type === "Identifier" &&
          left.object.name === paramName &&
          left.property.type === "Identifier"
        ) {
          propAccessName = left.property.name;
        }

        if (defaultValue !== null && propAccessName) {
          // Add default value to base styles
          styles[normalizedKey] = defaultValue;

          // Create dynamic function for this prop
          // e.g., dynamicBoxBackgroundColor: (backgroundColor: string) => ({ backgroundColor })
          const baseStyleName = componentName ? toCamelCase(componentName) : "";
          const fnName = `${baseStyleName}${capitalize(normalizedKey)}`;
          // Use the normalized key as the param name (e.g., backgroundColor)
          // Store original prop name for wrapper generation (e.g., $background)
          dynamicFns.set(fnName, {
            paramName: normalizedKey,
            paramType: "string",
            styles: { [normalizedKey]: VAR_REF_PREFIX + normalizedKey },
            originalPropName: propAccessName,
          });
          needsWrapper = true;
        } else {
          // Can't extract - skip
          continue;
        }
      } else {
        // Dynamic value we can't handle - skip
        continue;
      }
    }
  }

  return { styles, dynamicFns, needsWrapper };
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
        // Use convertValue to properly convert numeric values
        frameStyles[decl.property] = convertValue(stripImportant(decl.value), decl.property);
      }
      keyframeStyles[selector] = frameStyles;
    }

    // Process nested rules (the actual keyframe definitions)
    for (const nested of rule.nestedRules) {
      let nestedSelector = nested.selector.trim();
      if (nestedSelector.startsWith("&")) nestedSelector = nestedSelector.slice(1).trim();

      const frameStyles: StyleXObject = {};
      for (const decl of nested.declarations) {
        // Use convertValue to properly convert numeric values
        frameStyles[decl.property] = convertValue(stripImportant(decl.value), decl.property);
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
  let cssProperty = location.context.property
    ? normalizePropertyName(location.context.property)
    : null;

  // Map shorthand properties to their expanded form when interpolation is in a specific position
  // Only apply to border shorthand (border, borderTop, borderRight, borderBottom, borderLeft)
  // NOT to borderRadius, borderColor, borderWidth, borderStyle
  let isFullValue = location.context.isFullValue;
  const borderShorthands = ["border", "borderTop", "borderRight", "borderBottom", "borderLeft"];
  if (cssProperty && borderShorthands.includes(cssProperty)) {
    // For border shorthand with interpolation, determine which expanded property it maps to
    const mapping = mapBorderInterpolationToProperty(location.context.value, location.index);
    if (mapping) {
      cssProperty = mapping.property;
      // Update isFullValue based on whether the interpolation is the full value for the expanded property
      isFullValue = mapping.isFullValue;
    }
  }

  return {
    type: classified.type,
    index: location.index,
    cssProperty,
    cssValue: location.context.value,
    selector: location.context.selector,
    isInSelector: location.context.isInSelector,
    isInPropertyName: location.context.isInPropertyName,
    isFullValue,
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
 * Map a border interpolation to the correct expanded property
 * Returns both the property name and whether the interpolation is the full value
 */
function mapBorderInterpolationToProperty(
  cssValue: string,
  interpolationIndex: number,
): { property: string; isFullValue: boolean } | null {
  const placeholder = `__INTERPOLATION_${interpolationIndex}__`;

  // Split the value to find which part the interpolation is in
  const parts = cssValue.split(/\s+/);

  const borderStyles = [
    "none",
    "hidden",
    "dotted",
    "dashed",
    "solid",
    "double",
    "groove",
    "ridge",
    "inset",
    "outset",
  ];

  for (const part of parts) {
    if (part.includes(placeholder)) {
      // This part contains the interpolation
      // Determine what type of value it is based on what else is in the part
      const withoutPlaceholder = part.replace(placeholder, "").trim();

      // If the part is just the placeholder, it's a full value
      const isFullValue = part === placeholder;

      // If the part is just the placeholder (or placeholder with color hash), it's the color
      if (!withoutPlaceholder || withoutPlaceholder === "#") {
        return { property: "borderColor", isFullValue };
      }

      // If the remaining part looks like a unit, it's the width
      if (/^(px|em|rem|%|vh|vw|pt|cm|mm|in)$/.test(withoutPlaceholder)) {
        return { property: "borderWidth", isFullValue: false };
      }

      // Check if it might be a style
      for (const style of borderStyles) {
        if (part.includes(style)) {
          return { property: "borderStyle", isFullValue: false };
        }
      }

      // Default to color if we can't determine
      return { property: "borderColor", isFullValue };
    }
  }

  return null;
}

/**
 * Extract pseudo-class from a CSS selector (e.g., "&:focus" -> ":focus")
 */
function extractPseudoClass(selector: string): string | null {
  // Match patterns like "&:hover", "&:focus", "&::before", etc.
  const match = selector.match(/&(:[:\w-]+)/);
  return match ? match[1]! : null;
}

/**
 * Check if a template literal value has whitespace outside of ${} expressions
 * (indicating multiple values in a shorthand property)
 */
function hasWhitespaceOutsideExpressions(value: string): boolean {
  let braceDepth = 0;

  for (let i = 0; i < value.length; i++) {
    const char = value[i]!;
    if (char === "$" && value[i + 1] === "{") {
      braceDepth++;
      i++; // Skip the {
    } else if (char === "}" && braceDepth > 0) {
      braceDepth--;
    } else if (/\s/.test(char) && braceDepth === 0) {
      return true;
    }
  }
  return false;
}

/**
 * Expand margin/padding shorthand template literal to longhand properties
 */
function expandMarginPaddingShorthand(
  property: "margin" | "padding",
  templateValue: string,
): Record<string, string | number> {
  const prefix = property === "margin" ? "margin" : "padding";

  // Split the template value by whitespace, but preserve ${...} expressions
  const parts: string[] = [];
  let current = "";
  let braceDepth = 0;

  for (let i = 0; i < templateValue.length; i++) {
    const char = templateValue[i]!;
    if (char === "$" && templateValue[i + 1] === "{") {
      braceDepth++;
      current += char;
    } else if (char === "{" && braceDepth > 0) {
      current += char;
    } else if (char === "}") {
      if (braceDepth > 0) braceDepth--;
      current += char;
    } else if (/\s/.test(char) && braceDepth === 0) {
      if (current.trim()) {
        parts.push(current.trim());
      }
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) {
    parts.push(current.trim());
  }

  // Map based on number of values
  let top: string | number, right: string | number, bottom: string | number, left: string | number;

  // Convert parts to appropriate types (number for "0", template literal for expressions)
  const convertPart = (part: string): string | number => {
    if (part === "0") return 0;
    if (/^\d+$/.test(part)) return parseInt(part, 10);
    // If it contains an expression, wrap in template literal prefix
    if (part.includes("${")) {
      return TEMPLATE_LITERAL_PREFIX + part;
    }
    return part;
  };

  if (parts.length === 1) {
    top = right = bottom = left = convertPart(parts[0]!);
  } else if (parts.length === 2) {
    top = bottom = convertPart(parts[0]!);
    right = left = convertPart(parts[1]!);
  } else if (parts.length === 3) {
    top = convertPart(parts[0]!);
    right = left = convertPart(parts[1]!);
    bottom = convertPart(parts[2]!);
  } else {
    top = convertPart(parts[0]!);
    right = convertPart(parts[1]!);
    bottom = convertPart(parts[2]!);
    left = convertPart(parts[3]!);
  }

  return {
    [`${prefix}Top`]: top,
    [`${prefix}Right`]: right,
    [`${prefix}Bottom`]: bottom,
    [`${prefix}Left`]: left,
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
  variantConditions: Map<string, { propName: string; comparisonValue?: string }>,
  dynamicFns: Map<
    string,
    {
      paramName: string;
      paramType: string | undefined;
      styles: StyleXObject;
      originalPropName?: string;
    }
  >,
  additionalImports: Set<string>,
  warnings: TransformWarning[],
  bailedExpressions: Array<{
    cssProperty: string;
    sourceCode: string;
    referencedProps: string[];
  }>,
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
        if (context.cssProperty === "animation" && context.type === "keyframes") {
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
        } else if (
          (context.cssProperty === "margin" || context.cssProperty === "padding") &&
          typeof decision.value === "string" &&
          decision.value.startsWith(TEMPLATE_LITERAL_PREFIX)
        ) {
          // Special handling for margin/padding shorthand with interpolations:
          // Only expand to longhand properties when there are multiple values
          const templateValue = decision.value.slice(TEMPLATE_LITERAL_PREFIX.length);
          // Check if there's whitespace outside of ${} expressions (indicating multiple values)
          const hasMultipleValues = hasWhitespaceOutsideExpressions(templateValue);

          if (hasMultipleValues) {
            const expandedStyles = expandMarginPaddingShorthand(context.cssProperty, templateValue);
            for (const [prop, val] of Object.entries(expandedStyles)) {
              styles[prop] = val;
            }
            // Remove the original shorthand if it exists
            delete styles[context.cssProperty];
          } else {
            // Single value - keep as shorthand
            styles[context.cssProperty] = decision.value;
          }
        } else {
          styles[context.cssProperty] = decision.value;
        }
      } else if (context.type === "helper" && typeof decision.value === "string") {
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

      // Track bailed expressions that reference props for inline style generation
      if (context.cssProperty) {
        let referencedProps: string[] = [];

        // Try to get props from propPath first
        if (context.propPath && context.propPath.length > 0) {
          referencedProps = context.propPath
            .filter((p) => p !== "props" && p !== "p")
            .filter(Boolean);
        }

        // If no props from propPath, try to extract from source code
        // Match patterns like: props.propName, props["propName"], p.propName
        if (referencedProps.length === 0 && context.sourceCode) {
          const propMatches = context.sourceCode.matchAll(
            /(?:props|p)\.(\w+)|(?:props|p)\["(\w+)"\]/g,
          );
          const extractedProps = new Set<string>();
          for (const match of propMatches) {
            const propName = match[1] ?? match[2];
            if (propName) extractedProps.add(propName);
          }
          referencedProps = Array.from(extractedProps);
        }

        if (referencedProps.length > 0) {
          bailedExpressions.push({
            cssProperty: context.cssProperty,
            sourceCode: context.sourceCode,
            referencedProps,
          });
        }
      }
      break;
    }

    case "variant": {
      // Extract pseudo-class from selector if present (e.g., "&:focus" -> ":focus")
      const pseudoClass = extractPseudoClass(context.selector);

      // Set base value in main styles
      if (context.cssProperty && decision.baseValue !== "") {
        if (pseudoClass) {
          // Merge into pseudo-class object
          const existing = styles[context.cssProperty];
          if (typeof existing === "object" && existing !== null) {
            (existing as Record<string, unknown>)[pseudoClass] = decision.baseValue;
          } else if (existing !== undefined) {
            styles[context.cssProperty] = {
              default: existing,
              [pseudoClass]: decision.baseValue,
            };
          } else {
            styles[context.cssProperty] = {
              default: null,
              [pseudoClass]: decision.baseValue,
            };
          }
        } else {
          // Check if there's already a pseudo-class object and merge into default
          const existing = styles[context.cssProperty];
          if (typeof existing === "object" && existing !== null && "default" in existing) {
            (existing as Record<string, unknown>)["default"] = decision.baseValue;
          } else {
            styles[context.cssProperty] = decision.baseValue;
          }
        }
      }

      // Add variant styles
      for (const variant of decision.variants) {
        const variantName = `${toCamelCase(context.componentName)}${variant.name}`;
        const existing = variantStyles.get(variantName) ?? {};

        // For each style in the variant, merge pseudo-class context
        for (const [prop, value] of Object.entries(variant.styles)) {
          if (pseudoClass) {
            const existingProp = existing[prop];
            if (typeof existingProp === "object" && existingProp !== null) {
              (existingProp as Record<string, unknown>)[pseudoClass] = value;
            } else if (existingProp !== undefined) {
              existing[prop] = {
                default: existingProp,
                [pseudoClass]: value,
              };
            } else {
              existing[prop] = {
                default: null,
                [pseudoClass]: value,
              };
            }
          } else {
            // Check if there's already a pseudo-class object and set the default
            const existingProp = existing[prop];
            if (
              typeof existingProp === "object" &&
              existingProp !== null &&
              "default" in existingProp
            ) {
              (existingProp as Record<string, unknown>)["default"] = value;
            } else {
              existing[prop] = value;
            }
          }
        }

        variantStyles.set(variantName, existing);

        // Store variant condition for wrapper generation
        const conditionInfo: { propName: string; comparisonValue?: string } = {
          propName: decision.propName,
        };
        if (decision.comparisonValue !== undefined) {
          conditionInfo.comparisonValue = decision.comparisonValue;
        }
        variantConditions.set(variantName, conditionInfo);
      }
      break;
    }

    case "dynamic-fn": {
      // Create a dynamic style function
      const fnName = `${toCamelCase(context.componentName)}${capitalize(decision.paramName)}`;
      const fnStyles: StyleXObject = {};
      if (context.cssProperty) {
        fnStyles[context.cssProperty] = decision.valueExpression;
        // If there's a fallback value, set it as the base style
        if (decision.fallbackValue !== undefined) {
          styles[context.cssProperty] = decision.fallbackValue;
        }
      }
      const fnConfig: {
        paramName: string;
        paramType: string | undefined;
        styles: StyleXObject;
        originalPropName?: string;
      } = {
        paramName: decision.paramName,
        paramType: decision.paramType,
        styles: fnStyles,
      };
      if (decision.originalPropName) {
        fnConfig.originalPropName = decision.originalPropName;
      }
      dynamicFns.set(fnName, fnConfig);
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
 * Returns an array of statements: keyframes declarations first, then styles declaration
 */
function generateStyleXCode(
  j: JSCodeshift,
  styleInfos: StyleInfo[],
  keyframesStyles: Map<string, StyleXObject>,
  _adapter: Adapter,
  cssHelperStyles?: Map<string, StyleXObject>,
): VariableDeclaration[] {
  const statements: VariableDeclaration[] = [];

  // Generate keyframes declarations first (each as a separate const)
  for (const [name, keyframeStyles] of keyframesStyles) {
    const styleObj = styleObjectToAST(j, keyframeStyles);
    const keyframesCall = j.callExpression(
      j.memberExpression(j.identifier("stylex"), j.identifier("keyframes")),
      [styleObj as unknown as Parameters<typeof j.callExpression>[1][number]],
    );
    statements.push(
      j.variableDeclaration("const", [j.variableDeclarator(j.identifier(name), keyframesCall)]),
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
        j.tsTypeReference(j.identifier("const")),
      );
      statements.push(
        j.variableDeclaration("const", [
          j.variableDeclarator(
            j.identifier(name),
            asConst as unknown as Parameters<typeof j.variableDeclarator>[1],
          ),
        ]),
      );
    }
  }

  // Build style properties
  const properties: Array<{ key: Identifier; value: Expression }> = [];

  // Add component styles
  for (const info of styleInfos) {
    const styleName = toCamelCase(info.componentName);

    // For sibling selectors, add extra styles BEFORE the base style
    // For other patterns, add base style first then extra styles
    const hasSiblingSelectors = info.siblingSelectors && info.siblingSelectors.length > 0;

    if (hasSiblingSelectors) {
      // Add extra styles first for sibling selector patterns
      for (const [extraName, extraStylesObj] of info.extraStyles) {
        properties.push({
          key: j.identifier(extraName),
          value: styleObjectToAST(j, extraStylesObj),
        });
      }
      // Then add base style
      properties.push({
        key: j.identifier(styleName),
        value: styleObjectToAST(j, info.styles),
      });
    } else {
      // Add base style first for other patterns
      properties.push({
        key: j.identifier(styleName),
        value: styleObjectToAST(j, info.styles),
      });
      // Then add extra styles
      for (const [extraName, extraStylesObj] of info.extraStyles) {
        properties.push({
          key: j.identifier(extraName),
          value: styleObjectToAST(j, extraStylesObj),
        });
      }
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

  // Add styles declaration
  statements.push(
    j.variableDeclaration("const", [j.variableDeclarator(j.identifier("styles"), createCall)]),
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
      valueNode as unknown as Parameters<typeof j.objectProperty>[1],
    );
    if (computedExpr) {
      (prop as unknown as { computed?: boolean }).computed = true;
    }
    // Enable shorthand syntax when key and value are identical identifiers
    // e.g., { backgroundColor } instead of { backgroundColor: backgroundColor }
    if (
      keyNode.type === "Identifier" &&
      valueNode.type === "Identifier" &&
      keyNode.name === valueNode.name
    ) {
      (prop as unknown as { shorthand?: boolean }).shorthand = true;
    }
    regularProperties.push(prop);
  }

  // Spread properties come first, then regular properties
  const allProperties = [...spreadProperties, ...regularProperties];
  return j.objectExpression(allProperties as unknown as Parameters<typeof j.objectExpression>[0]);
}

function parseBracketComputedKeyToExpression(j: JSCodeshift, key: string): Expression | null {
  const trimmed = key.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return null;
  const inner = trimmed.slice(1, -1).trim();

  const match = inner.match(
    /^stylex\.when\.(ancestor|descendant|anySibling|siblingBefore|siblingAfter)\(\s*(['"])([^'"]+)\2\s*(?:,\s*(.+)\s*)?\)$/,
  );
  if (!match) return null;

  const method = match[1]!;
  const pseudo = match[3]!;
  const markerArg = match[4]?.trim();

  const callee = j.memberExpression(
    j.memberExpression(j.identifier("stylex"), j.identifier("when")),
    j.identifier(method),
  );

  const args: Expression[] = [j.literal(pseudo) as unknown as Expression];

  if (markerArg) {
    if (markerArg === "stylex.defaultMarker()") {
      args.push(
        j.callExpression(
          j.memberExpression(j.identifier("stylex"), j.identifier("defaultMarker")),
          [],
        ) as unknown as Expression,
      );
    } else if (/^[a-zA-Z_$][a-zA-Z0-9_$.]*$/.test(markerArg)) {
      args.push(parseMemberExpression(j, markerArg));
    } else {
      return null;
    }
  }

  return j.callExpression(
    callee,
    args as unknown as Parameters<typeof j.callExpression>[1],
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
  return value.startsWith(VAR_REF_PREFIX) ? value.slice(VAR_REF_PREFIX.length) : value;
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
    j.templateElement({ raw: q.raw, cooked: q.cooked }, i === quasis.length - 1),
  );

  return j.templateLiteral(
    templateQuasis as unknown as Parameters<typeof j.templateLiteral>[0],
    expressions as unknown as Parameters<typeof j.templateLiteral>[1],
  );
}

/**
 * Parse a member expression string into AST
 * Handles: theme.colors.primary
 */
function parseMemberExpression(j: JSCodeshift, exprStr: string): Expression {
  const parts = exprStr.split(".");
  // jscodeshift typing expects ExpressionKind; keep internal as unknown and cast at the end.
  let expr = j.identifier(parts[0]!) as unknown as Parameters<typeof j.memberExpression>[0];

  for (let i = 1; i < parts.length; i++) {
    expr = j.memberExpression(
      expr,
      j.identifier(parts[i]!) as unknown as Parameters<typeof j.memberExpression>[1],
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
      j.literal(parseInt(divMatch[2]!, 10)),
    );
  }

  const mulMatch = exprStr.match(/^(\w+)\s*\*\s*(\d+)$/);
  if (mulMatch) {
    return j.binaryExpression(
      "*",
      j.identifier(mulMatch[1]!),
      j.literal(parseInt(mulMatch[2]!, 10)),
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
  source: string,
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
      if (attr.type !== "JSXAttribute" || attr.name.type !== "JSXIdentifier") continue;
      if (attr.name.name === "as" || attr.name.name === "forwardedAs") {
        // Extract the element name from the as/forwardedAs prop value
        if (attr.value?.type === "StringLiteral") {
          baseElement = attr.value.value;
        }
        // If wrapper supports `as`, convert `forwardedAs` to `as` but don't remove
        if (info.supportsAs) {
          if (attr.name.name === "forwardedAs") {
            attr.name.name = "as";
          }
          // Don't add to propsToRemove - keep the prop for the wrapper
        } else {
          propsToRemove.push(attr.name.name);
        }
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
      if (attr.type !== "JSXAttribute" || attr.name.type !== "JSXIdentifier") continue;

      const propName = attr.name.name;

      // Check if this prop controls a variant
      for (const [variantName] of info.variantStyles) {
        const expectedProp = variantName.replace(toCamelCase(info.componentName), "");
        const propWithPrefix = `$${expectedProp.charAt(0).toLowerCase()}${expectedProp.slice(1)}`;
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
          } else if (attr.value && attr.value.type === "JSXExpressionContainer") {
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
        const cleanPropName = propName.startsWith("$") ? propName.slice(1) : propName;
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
          attrsToAdd.push(j.jsxAttribute(j.jsxIdentifier(key), j.literal(value)));
        } else if (typeof value === "number") {
          attrsToAdd.push(
            j.jsxAttribute(j.jsxIdentifier(key), j.jsxExpressionContainer(j.literal(value))),
          );
        } else if (typeof value === "boolean" && value) {
          attrsToAdd.push(j.jsxAttribute(j.jsxIdentifier(key), null));
        }
      }

      // Collect dynamic attrs - check existing JSX props and apply computed values
      for (const dynamicAttr of info.attrsConfig.dynamicAttrs) {
        // Use the new conditionProp and truthyValue fields if available
        if (dynamicAttr.conditionProp && dynamicAttr.truthyValue !== undefined) {
          // Find if the condition prop is present in JSX
          const conditionAttr = attributes.find(
            (attr) =>
              attr.type === "JSXAttribute" &&
              attr.name.type === "JSXIdentifier" &&
              attr.name.name === dynamicAttr.conditionProp,
          );

          if (conditionAttr && conditionAttr.type === "JSXAttribute") {
            // Boolean prop is present (value is null for <Input $small />)
            if (conditionAttr.value === null) {
              // Apply the truthy value
              if (typeof dynamicAttr.truthyValue === "number") {
                attrsToAdd.push(
                  j.jsxAttribute(
                    j.jsxIdentifier(dynamicAttr.prop),
                    j.jsxExpressionContainer(j.literal(dynamicAttr.truthyValue)),
                  ),
                );
              } else if (typeof dynamicAttr.truthyValue === "string") {
                attrsToAdd.push(
                  j.jsxAttribute(
                    j.jsxIdentifier(dynamicAttr.prop),
                    j.literal(dynamicAttr.truthyValue),
                  ),
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
          if (attr.type !== "JSXAttribute" || attr.name.type !== "JSXIdentifier") continue;
          const propName = attr.name.name;

          if (dynamicAttr.expr.includes(propName)) {
            if (attr.value === null) {
              // Boolean prop - extract numeric value from ternary expression
              if (dynamicAttr.expr.includes("?") && dynamicAttr.expr.includes(":")) {
                const match = dynamicAttr.expr.match(/\?\s*(\d+)\s*:/);
                if (match) {
                  attrsToAdd.push(
                    j.jsxAttribute(
                      j.jsxIdentifier(dynamicAttr.prop),
                      j.jsxExpressionContainer(j.literal(parseInt(match[1]!, 10))),
                    ),
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
        if (attr.type !== "JSXAttribute" || attr.name.type !== "JSXIdentifier") return true;
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
            j.identifier(style!.trim()),
          ) as unknown as Expression;
        }
        // Check if it's a function call like styles.fnName("arg")
        const fnCallMatch = ref.match(/^(styles\.\w+)\("([^"]+)"\)$/);
        if (fnCallMatch) {
          const [, fnPath, arg] = fnCallMatch;
          const [obj, prop] = fnPath!.split(".");
          return j.callExpression(j.memberExpression(j.identifier(obj!), j.identifier(prop!)), [
            j.literal(arg!),
          ]) as unknown as Expression;
        }
        return j.identifier(ref) as unknown as Expression;
      });
      const stylexPropsCall = j.callExpression(
        j.memberExpression(j.identifier("stylex"), j.identifier("props")),
        stylexArgs as unknown as Parameters<typeof j.callExpression>[1],
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
          a.argument.callee.property.name === "props",
      );

      if (existingSpread && existingSpread.type === "JSXSpreadAttribute") {
        const call = existingSpread.argument;
        if (call.type === "CallExpression") {
          // Prepend so later-added styles (already in the spread) keep override priority.
          call.arguments.unshift(
            ...(stylexArgs as unknown as Parameters<typeof j.callExpression>[1]),
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
        (c): c is import("jscodeshift").JSXElement => c.type === "JSXElement",
      );

      // Apply `child` to all direct children, and `childNotFirst` to all except first
      for (let i = 0; i < directChildElements.length; i++) {
        const childEl = directChildElements[i]!;
        const childOpening = childEl.openingElement;
        if (!childOpening.attributes) childOpening.attributes = [];

        // Determine styles to apply for this child index
        const styleNames: string[] = [];
        const isFirst = i === 0;
        const isLast = i === directChildElements.length - 1;
        for (const rule of info.jsxRewriteRules) {
          if (rule.type === "direct-children") {
            styleNames.push(...rule.styleNames);
          } else if (rule.type === "direct-children-except-first" && !isFirst) {
            styleNames.push(...rule.styleNames);
          } else if (rule.type === "direct-children-except-last" && !isLast) {
            styleNames.push(...rule.styleNames);
          } else if (rule.type === "direct-children-first" && isFirst) {
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
            a.argument.callee.property.name === "props",
        );

        const extraArgs = uniqueStyleNames.map((n) =>
          j.memberExpression(j.identifier("styles"), j.identifier(n)),
        ) as unknown as Expression[];

        if (existingSpread && existingSpread.type === "JSXSpreadAttribute") {
          const call = existingSpread.argument;
          if (call.type === "CallExpression") {
            call.arguments.push(
              ...(extraArgs as unknown as Parameters<typeof j.callExpression>[1]),
            );
          }
        } else {
          const propsCall = j.callExpression(
            j.memberExpression(j.identifier("stylex"), j.identifier("props")),
            extraArgs as unknown as Parameters<typeof j.callExpression>[1],
          );
          childOpening.attributes.push(j.jsxSpreadAttribute(propsCall));
        }
      }
    }

    // Apply descendant styled-component rewrite rules (e.g., `${Icon}` blocks inside `${Button}`).
    const descendantRules = info.jsxRewriteRules.filter(
      (r) => r.type === "descendant-styled-component",
    ) as Array<
      Extract<StyleInfo["jsxRewriteRules"][number], { type: "descendant-styled-component" }>
    >;

    if (descendantRules.length > 0) {
      const seen = new Set<string>();
      for (const rule of descendantRules) {
        const key = `${rule.targetComponentName}::${rule.styleName}`;
        if (seen.has(key)) continue;
        seen.add(key);
        applyStyleToDescendantComponents(j, path.node, rule.targetComponentName, rule.styleName);
      }
    }
  });

  // Add sibling selector props to JSX elements
  // For components with sibling selectors (e.g., & + &), we need to add props
  // like isAdjacentSibling based on element position among siblings
  const componentsWithSiblingSelectors = new Map<string, SiblingSelectorInfo[]>();
  for (const info of styleInfos) {
    if (info.siblingSelectors.length > 0) {
      componentsWithSiblingSelectors.set(info.componentName, info.siblingSelectors);
    }
  }

  if (componentsWithSiblingSelectors.size > 0) {
    // Find all JSX elements that could be parents of sibling styled components
    root.find(j.JSXElement).forEach((parentPath) => {
      const children = parentPath.node.children ?? [];
      const jsxChildren = children.filter(
        (c): c is import("jscodeshift").JSXElement => c.type === "JSXElement",
      );

      if (jsxChildren.length < 2) return;

      // Track which component types we've seen and their positions
      type SiblingTracker = {
        seenFirst: boolean;
        afterClassName: string | null;
      };
      const trackers = new Map<string, SiblingTracker>();

      for (const childEl of jsxChildren) {
        const childOpening = childEl.openingElement;
        if (childOpening.name.type !== "JSXIdentifier") continue;

        const childComponentName = childOpening.name.name;
        const siblingSelectors = componentsWithSiblingSelectors.get(childComponentName);
        if (!siblingSelectors) continue;

        // Get or create tracker for this component type
        let tracker = trackers.get(childComponentName);
        if (!tracker) {
          tracker = { seenFirst: false, afterClassName: null };
          trackers.set(childComponentName, tracker);
        }

        // Check if this element has a className
        const classNameAttr = (childOpening.attributes ?? []).find(
          (a) =>
            a.type === "JSXAttribute" &&
            a.name.type === "JSXIdentifier" &&
            a.name.name === "className",
        );
        let currentClassName: string | null = null;
        if (classNameAttr && classNameAttr.type === "JSXAttribute") {
          if (classNameAttr.value?.type === "StringLiteral") {
            currentClassName = classNameAttr.value.value;
          }
        }

        // Ensure attributes array exists
        if (!childOpening.attributes) childOpening.attributes = [];

        // If we've already seen one of this component type, this is an adjacent sibling
        if (tracker.seenFirst) {
          // Add isAdjacentSibling prop for & + & selector
          const hasAdjacentSelector = siblingSelectors.some(
            (s) => s.selector === "& + &" || s.selector === "&+&",
          );
          if (hasAdjacentSelector) {
            const propName = siblingSelectors.find(
              (s) => s.selector === "& + &" || s.selector === "&+&",
            )!.propName;
            // Check if prop already exists
            const exists = childOpening.attributes.some(
              (a) =>
                a.type === "JSXAttribute" &&
                a.name.type === "JSXIdentifier" &&
                a.name.name === propName,
            );
            if (!exists) {
              childOpening.attributes.push(j.jsxAttribute(j.jsxIdentifier(propName), null));
            }
          }

          // Add isSiblingAfterSomething prop if we're after an element with .something class
          if (tracker.afterClassName) {
            const generalSibSelector = siblingSelectors.find((s) => {
              const match = s.selector.match(/^&\.(\w+)\s*~\s*&$/);
              return match && match[1] === tracker!.afterClassName;
            });
            if (generalSibSelector) {
              const exists = childOpening.attributes.some(
                (a) =>
                  a.type === "JSXAttribute" &&
                  a.name.type === "JSXIdentifier" &&
                  a.name.name === generalSibSelector.propName,
              );
              if (!exists) {
                childOpening.attributes.push(
                  j.jsxAttribute(j.jsxIdentifier(generalSibSelector.propName), null),
                );
              }
            }
          }
        }

        // Update tracker state
        tracker.seenFirst = true;
        // If this element has a matching className for a general sibling selector, track it
        if (currentClassName) {
          const hasMatchingSelector = siblingSelectors.some((s) => {
            const match = s.selector.match(/^&\.(\w+)\s*~\s*&$/);
            return match && match[1] === currentClassName;
          });
          if (hasMatchingSelector) {
            tracker.afterClassName = currentClassName;
          }
        }
      }
    });
  }
}

function applyStyleToDescendantComponents(
  j: JSCodeshift,
  rootEl: import("jscodeshift").JSXElement,
  targetComponentName: string,
  styleName: string,
): void {
  const targetStyleKey = toCamelCase(targetComponentName);

  function hasBaseStyleApplied(opening: import("jscodeshift").JSXOpeningElement): boolean {
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

  function ensureStyleApplied(opening: import("jscodeshift").JSXOpeningElement): void {
    if (!opening.attributes) opening.attributes = [];

    const existingSpread = opening.attributes.find(
      (a) =>
        a.type === "JSXSpreadAttribute" &&
        a.argument.type === "CallExpression" &&
        a.argument.callee.type === "MemberExpression" &&
        a.argument.callee.object.type === "Identifier" &&
        a.argument.callee.object.name === "stylex" &&
        a.argument.callee.property.type === "Identifier" &&
        a.argument.callee.property.name === "props",
    );

    const extraArg = j.memberExpression(j.identifier("styles"), j.identifier(styleName));

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
            extraArg as unknown as Parameters<typeof j.callExpression>[1][number],
          );
        }
      }
      return;
    }

    const propsCall = j.callExpression(
      j.memberExpression(j.identifier("stylex"), j.identifier("props")),
      [extraArg as unknown as Parameters<typeof j.callExpression>[1][number]],
    );
    opening.attributes.push(j.jsxSpreadAttribute(propsCall));
  }

  function visit(node: import("jscodeshift").JSXElement): void {
    for (const child of node.children ?? []) {
      if (child.type !== "JSXElement") continue;
      const opening = child.openingElement;

      if (opening.name.type === "JSXIdentifier") {
        // Match before conversion (<Icon />) OR after conversion (element with styles.icon already applied).
        if (opening.name.name === targetComponentName || hasBaseStyleApplied(opening)) {
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

/**
 * Generate wrapper components for styled components that need them
 */
function generateWrapperComponents(
  j: JSCodeshift,
  styleInfos: StyleInfo[],
): (
  | VariableDeclaration
  | import("jscodeshift").FunctionDeclaration
  | import("jscodeshift").TSInterfaceDeclaration
)[] {
  const wrappers: (
    | VariableDeclaration
    | import("jscodeshift").FunctionDeclaration
    | import("jscodeshift").TSInterfaceDeclaration
  )[] = [];

  // Build a map for looking up base elements of components
  const componentBaseElements = new Map<string, string>();
  for (const info of styleInfos) {
    componentBaseElements.set(info.componentName, info.baseElement);
  }

  for (const info of styleInfos) {
    if (!info.needsWrapper) continue;

    const {
      componentName,
      transientProps,
      attributeSelectors,
      siblingSelectors,
      hasShouldForwardProp,
      filteredProps,
      filterTransientProps,
      dynamicFns,
      isExtending,
      extendsFrom,
      hasSpecificityHacks,
    } = info;

    // Resolve the actual base element (walking inheritance chain if needed)
    let baseElement = info.baseElement;
    if (isExtending && extendsFrom) {
      // Walk up the inheritance chain to find the root base element
      let current = extendsFrom;
      while (current) {
        const parentInfo = styleInfos.find((s) => s.componentName === current);
        if (parentInfo) {
          baseElement = parentInfo.baseElement;
          if (parentInfo.extendsFrom) {
            current = parentInfo.extendsFrom;
          } else {
            break;
          }
        } else {
          break;
        }
      }
    }

    const styleName = toCamelCase(componentName);
    const isInputElement = baseElement === "input";
    const isAnchorElement = baseElement === "a";

    // Collect props to destructure
    const propsToDestructure: string[] = [];
    const propsToFilter: string[] = [];

    // Add attribute selector props
    for (const attrSel of attributeSelectors) {
      if (!propsToDestructure.includes(attrSel.propName)) {
        propsToDestructure.push(attrSel.propName);
      }
    }

    // Add sibling selector props
    for (const sibSel of siblingSelectors) {
      if (!propsToDestructure.includes(sibSel.propName)) {
        propsToDestructure.push(sibSel.propName);
      }
    }

    // Add filtered props (from shouldForwardProp)
    for (const prop of filteredProps) {
      if (!propsToDestructure.includes(prop)) {
        propsToDestructure.push(prop);
        propsToFilter.push(prop);
      }
    }

    // Add dynamic function props
    // For filterTransientProps mode, don't destructure $-prefixed props (they'll be accessed via props["$..."])
    for (const [, fnConfig] of dynamicFns) {
      // Use originalPropName if available (from object syntax), otherwise use paramName
      const propToUse = fnConfig.originalPropName ?? fnConfig.paramName;
      // Skip $-prefixed props when filterTransientProps is true (they're deleted from rest anyway)
      if (filterTransientProps && propToUse.startsWith("$")) {
        continue;
      }
      if (!propsToDestructure.includes(propToUse)) {
        propsToDestructure.push(propToUse);
        propsToFilter.push(propToUse);
      }
    }

    // Add transient props
    for (const prop of transientProps) {
      if (!propsToDestructure.includes(prop.name)) {
        propsToDestructure.push(prop.name);
        propsToFilter.push(prop.name);
      }
    }

    // Add bailed expression props with underscore prefix (to avoid unused variable warnings)
    // These props are destructured but not passed to the DOM element
    const bailedPropRenames: Map<string, string> = new Map();
    for (const bailed of info.bailedExpressions) {
      for (const prop of bailed.referencedProps) {
        // Check if prop is already in the list (possibly without underscore prefix)
        const existingIndex = propsToDestructure.indexOf(prop);
        if (existingIndex !== -1) {
          // Replace with underscore-prefixed version
          propsToDestructure[existingIndex] = `${prop}: _${prop}`;
          bailedPropRenames.set(prop, `_${prop}`);
        } else if (!propsToDestructure.includes(`${prop}: _${prop}`)) {
          // Add with underscore prefix for renaming
          propsToDestructure.push(`${prop}: _${prop}`);
          bailedPropRenames.set(prop, `_${prop}`);
          propsToFilter.push(prop);
        }
      }
    }

    // Always include className for merging
    if (!propsToDestructure.includes("className")) {
      propsToDestructure.push("className");
    }

    // Build style conditionals
    const styleConditions: string[] = [];

    // Base style
    if (isExtending && extendsFrom) {
      styleConditions.push(`styles.${toCamelCase(extendsFrom)}`);
    }
    styleConditions.push(`styles.${styleName}`);

    // Attribute selector conditionals
    for (const attrSel of attributeSelectors) {
      if (attrSel.propValue) {
        if (attrSel.operator === "^=") {
          // startsWith
          styleConditions.push(
            `${attrSel.propName}?.startsWith("${attrSel.propValue.replace(
              /"/g,
              '\\"',
            )}") && styles.${attrSel.styleName}`,
          );
        } else if (attrSel.operator === "$=") {
          // endsWith
          styleConditions.push(
            `${attrSel.propName}?.endsWith("${attrSel.propValue.replace(
              /"/g,
              '\\"',
            )}") && styles.${attrSel.styleName}`,
          );
        } else {
          // Exact match
          styleConditions.push(
            `${attrSel.propName} === "${attrSel.propValue.replace(
              /"/g,
              '\\"',
            )}" && styles.${attrSel.styleName}`,
          );
        }
      } else {
        // Boolean attribute
        styleConditions.push(`${attrSel.propName} && styles.${attrSel.styleName}`);
      }
    }

    // Sibling selector conditionals
    for (const sibSel of siblingSelectors) {
      styleConditions.push(`${sibSel.propName} && styles.${sibSel.styleName}`);
    }

    // Variant style conditionals
    for (const [variantName] of info.variantStyles) {
      const condition = info.variantConditions.get(variantName);
      if (condition) {
        // Use stored condition info (prop name and comparison value)
        if (condition.comparisonValue) {
          styleConditions.push(
            `${condition.propName} === "${condition.comparisonValue}" && styles.${variantName}`,
          );
        } else {
          // Boolean variant (no comparison value)
          styleConditions.push(`${condition.propName} && styles.${variantName}`);
        }
      } else {
        // Fallback: parse variant name (legacy behavior)
        const propPart = variantName.slice(styleName.length);
        if (propPart) {
          const propName = propPart.charAt(0).toLowerCase() + propPart.slice(1);
          styleConditions.push(`${propName} && styles.${variantName}`);
        }
      }
    }

    // Dynamic function calls
    for (const [fnName, fnConfig] of dynamicFns) {
      // Use originalPropName if available (from object syntax), otherwise use paramName
      const propToUse = fnConfig.originalPropName ?? fnConfig.paramName;
      // For filterTransientProps with $-prefixed props, use props["$..."] syntax
      if (filterTransientProps && propToUse.startsWith("$")) {
        styleConditions.push(`props["${propToUse}"] && styles.${fnName}(props["${propToUse}"])`);
      } else {
        styleConditions.push(`${propToUse} && styles.${fnName}(${propToUse})`);
      }
    }

    // Transient prop conditionals
    for (const prop of transientProps) {
      if (prop.truthyStyleName) {
        styleConditions.push(`${prop.name} && ${prop.truthyStyleName}`);
      }
    }

    // Generate interface if needed (for TypeScript)
    const interfaceName = `${componentName}Props`;

    // Build interface
    const interfaceProps: string[] = [];
    for (const sibSel of siblingSelectors) {
      interfaceProps.push(`${sibSel.propName}?: boolean`);
    }
    if (interfaceProps.length > 0 || !isInputElement) {
      interfaceProps.push("children?: React.ReactNode");
    }

    // Interface code generated but currently not used in all wrapper patterns
    // (TypeScript interfaces are only included for specific wrapper types)
    const _unusedInterfaceCode =
      siblingSelectors.length > 0 || (!isInputElement && !isAnchorElement)
        ? `interface ${interfaceName} {\n  ${interfaceProps.join(
            ";\n  ",
          )};\n  className?: string;\n}`
        : "";
    void _unusedInterfaceCode; // Silence unused variable warning

    // Generate function body
    const destructureList = [...propsToDestructure, "...rest"];
    const propsTypeAnnotation =
      siblingSelectors.length > 0
        ? interfaceName
        : isInputElement
          ? "InputProps"
          : isAnchorElement
            ? "LinkProps"
            : "{ children?: React.ReactNode; className?: string; [key: string]: unknown }";

    // Build the component code
    let componentCode: string;

    if (isInputElement && hasShouldForwardProp && attributeSelectors.length === 0) {
      // Simple shouldForwardProp-only Input wrapper (no attribute selectors)
      // Build the list of props to destructure: className, style, filtered props, ...rest
      const inputDestructure = ["className", "style"];
      for (const prop of filteredProps) {
        if (!inputDestructure.includes(prop)) {
          inputDestructure.push(prop);
        }
      }
      inputDestructure.push("...rest");

      // Build simple conditional style conditions
      const inputStyleConditions = [`styles.${styleName}`];
      for (const prop of filteredProps) {
        // Create variant style name from filtered prop
        const variantStyleName = `${styleName}${capitalize(prop)}`;
        inputStyleConditions.push(`${prop} && styles.${variantStyleName}`);
      }

      componentCode = `
function ${componentName}(props) {
  const { ${inputDestructure.join(", ")} } = props;

  const sx = stylex.props(${inputStyleConditions.join(", ")});

  return (
    <input
      {...sx}
      className={[sx.className, className].filter(Boolean).join(" ")}
      style={style}
      {...rest}
    />
  );
}`;
    } else if (isInputElement) {
      // Input wrapper with attribute selectors (TypeScript interface needed)
      componentCode = `
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

function ${componentName}(props: InputProps) {
  const { ${destructureList.join(", ")} } = props;
  const sx = stylex.props(
    ${styleConditions.join(",\n    ")}
  );
  return (
    <input
      {...sx}
      className={[sx.className, className].filter(Boolean).join(" ")}
      ${propsToDestructure
        .filter((p) => p !== "className")
        .map((p) => `${p}={${p}}`)
        .join("\n      ")}
      {...rest}
    />
  );
}`;
    } else if (isAnchorElement && hasShouldForwardProp && attributeSelectors.length === 0) {
      // Simple shouldForwardProp-only Anchor wrapper (no interface needed)
      const anchorDestructure = ["className", "children", "style"];
      for (const prop of filteredProps) {
        if (!anchorDestructure.includes(prop)) {
          anchorDestructure.push(prop);
        }
      }
      anchorDestructure.push("...rest");

      componentCode = `
function ${componentName}(props) {
  const { ${anchorDestructure.join(", ")} } = props;

  const sx = stylex.props(${styleConditions.join(", ")});

  return (
    <a
      {...sx}
      className={[sx.className, className].filter(Boolean).join(" ")}
      style={style}
      {...rest}
    >
      {children}
    </a>
  );
}`;
    } else if (isAnchorElement) {
      // Anchor-specific wrapper (with interface)
      componentCode = `
interface LinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  children?: React.ReactNode;
}

function ${componentName}({ ${destructureList.join(", ")} }: LinkProps) {
  const sx = stylex.props(
    ${styleConditions.join(",\n    ")}
  );
  return (
    <a
      {...sx}
      className={[sx.className, className].filter(Boolean).join(" ")}
      ${propsToDestructure
        .filter((p) => p !== "className" && p !== "children")
        .map((p) => `${p}={${p}}`)
        .join("\n      ")}
      {...rest}
    >
    {children}
    </a>
  );
}`;
    } else if (siblingSelectors.length > 0) {
      // Sibling selector wrapper with function pattern
      componentCode = `
function ${componentName}(props) {
  const { children, className, ${siblingSelectors
    .map((s) => s.propName)
    .join(", ")}, ...rest } = props;

  const sx = stylex.props(
    ${styleConditions.join(",\n    ")}
  );

  return (
    <${baseElement} {...sx} className={[sx.className, className].filter(Boolean).join(" ")} {...rest}>
      {children}
    </${baseElement}>
  );
}`;
    } else if (hasShouldForwardProp) {
      // shouldForwardProp wrapper
      let filterCode = "";
      if (filterTransientProps) {
        filterCode = `
  for (const k of Object.keys(rest)) {
    if (k.startsWith("$")) delete rest[k];
  }
`;
      }

      // Build destructure list - handle props with underscore prefix for bailed expressions
      const destructureProps = ["className", "children", "style"];
      for (const prop of propsToFilter) {
        // Check if this prop has a bailed expression rename
        const rename = bailedPropRenames.get(prop);
        if (rename) {
          if (!destructureProps.includes(`${prop}: ${rename}`)) {
            destructureProps.push(`${prop}: ${rename}`);
          }
        } else if (!destructureProps.includes(prop)) {
          destructureProps.push(prop);
        }
      }

      // Build inline style expression for bailed expressions
      let styleExpr = "{style}";
      if (info.bailedExpressions.length > 0) {
        const inlineStyles = info.bailedExpressions.map((bailed) => {
          // Generate IIFE: ((props) => expression)(props)
          return `${bailed.cssProperty}: (${bailed.sourceCode})(props)`;
        });
        styleExpr = `{{\n          ...style,\n          ${inlineStyles.join(",\n          ")},\n        }}`;
      }

      componentCode = `
function ${componentName}(props) {
  const { ${destructureProps.join(", ")}, ...rest } = props;
${filterCode}
  const sx = stylex.props(
    ${styleConditions.join(",\n    ")}
  );

  return (
    <${baseElement}
      {...sx}
      className={[sx.className, className].filter(Boolean).join(" ")}
      style=${styleExpr}
      {...rest}
    >
      {children}
    </${baseElement}>
  );
}`;
    } else if (info.supportsAs) {
      // Polymorphic wrapper with `as` prop support
      // If extending another component, reuse parent's props interface
      const propsInterfaceName =
        isExtending && extendsFrom ? `${extendsFrom}Props` : `${componentName}Props`;
      const needsInterface = !isExtending || !extendsFrom;

      const interfaceDecl = needsInterface
        ? `interface ${propsInterfaceName} extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  as?: React.ElementType;
  href?: string;
}

`
        : "";

      componentCode = `
${interfaceDecl}
function ${componentName}({
  as: Component = "${baseElement}",
  children,
  ...props
}: ${propsInterfaceName} & { children?: React.ReactNode }) {
  return (
    <Component {...stylex.props(${styleConditions.join(", ")})} {...props}>
      {children}
    </Component>
  );
}`;
    } else if (
      hasSpecificityHacks &&
      attributeSelectors.length === 0 &&
      siblingSelectors.length === 0 &&
      !hasShouldForwardProp &&
      dynamicFns.size === 0
    ) {
      // Simple specificity-only wrapper - minimal signature
      componentCode = `
const ${componentName} = ({ children }: { children: React.ReactNode }) => (
  <${baseElement} {...stylex.props(styles.${styleName})}>{children}</${baseElement}>
);`;
    } else if (info.hasObjectSyntaxDynamicFns) {
      // Object-syntax dynamic function wrapper (styled.div((props) => ({...})) pattern)
      // Uses simple function pattern without TypeScript types
      const objDestructure = ["className", "children", "style"];
      for (const [, fnConfig] of dynamicFns) {
        const propToUse = fnConfig.originalPropName ?? fnConfig.paramName;
        if (!objDestructure.includes(propToUse)) {
          objDestructure.push(propToUse);
        }
      }

      componentCode = `
function ${componentName}(props) {
  const { ${objDestructure.join(", ")} } = props;

  const sx = stylex.props(
    ${styleConditions.join(",\n    ")}
  );

  return (
    <${baseElement} {...sx} className={[sx.className, className].filter(Boolean).join(" ")} style={style}>
      {children}
    </${baseElement}>
  );
}`;
    } else {
      // Generic wrapper
      componentCode = `
const ${componentName} = ({ ${destructureList.join(", ")} }: ${propsTypeAnnotation}) => (
  <${baseElement} {...stylex.props(${styleConditions.join(", ")})} className={className}>
    {children}
  </${baseElement}>
);`;
    }

    try {
      // Build comment prefix for the component code
      let commentPrefix = "";
      if (info.leadingComments && info.leadingComments.length > 0) {
        commentPrefix = info.leadingComments
          .map((c) => {
            if (c.type === "CommentBlock" || c.type === "Block") {
              return `/*${c.value}*/`;
            }
            return `//${c.value}`;
          })
          .join("\n");
        commentPrefix += "\n";
      }

      // Prepend comment to component code (with blank line before for separation)
      const fullCode = `\n${commentPrefix}${componentCode.trim()}`;

      const parsed = j(fullCode);
      const funcDecls = parsed.find(j.FunctionDeclaration);
      const varDecls = parsed.find(j.VariableDeclaration);
      const interfaceDecls = parsed.find(j.TSInterfaceDeclaration);

      // Add interface first
      interfaceDecls.forEach((p) => {
        wrappers.push(p.node);
      });

      // Add function or variable declaration
      if (funcDecls.length > 0) {
        funcDecls.forEach((p) => {
          wrappers.push(p.node);
        });
      } else if (varDecls.length > 0) {
        varDecls.forEach((p) => {
          wrappers.push(p.node);
        });
      }
    } catch (e) {
      // Skip if parsing fails - complex components may need manual handling
      console.warn(`Failed to generate wrapper for ${componentName}:`, e);
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
