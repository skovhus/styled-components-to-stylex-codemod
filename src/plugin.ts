/**
 * Plugin System for styled-components to StyleX Codemod
 *
 * This module defines the rich context plugin architecture that allows
 * callers to intercept and customize transformations at every level.
 */

import type { ASTNode } from "jscodeshift";

// Use jscodeshift's AST types which are compatible with @babel/types
// eslint-disable-next-line @typescript-eslint/no-namespace
namespace t {
  export type Expression = ASTNode;
  export type CallExpression = ASTNode & { type: "CallExpression"; arguments: ASTNode[] };
}

type Expression = t.Expression;

// ============================================================================
// Value Types & Location Context
// ============================================================================

/**
 * Classification of interpolated values in styled-components templates
 */
export type ValueType =
  | "literal" // Static CSS value: "16px", "#BF4F74"
  | "theme" // Theme reference: props.theme.colors.primary
  | "prop" // Prop-based value: props.$primary ? 'x' : 'y'
  | "helper" // Helper call: color('primary'), truncate()
  | "interpolation" // Generic ${...} expression
  | "keyframes-ref" // Reference to keyframes: ${rotate}
  | "component-ref" // Component selector: ${Link}
  | "css-ref"; // css`` template reference: ${truncate}

/**
 * Where in the CSS structure this value appears
 */
export type ContextLocation =
  | "declaration-value" // color: <HERE>
  | "declaration-prop" // <HERE>: blue (custom property)
  | "selector" // <HERE> { color: blue }
  | "at-rule-params" // @media <HERE>
  | "at-rule-name" // @<HERE> (min-width: ...)
  | "keyframe-selector" // <HERE> { transform: ... } (0%, from, to)
  | "animation-name"; // animation-name: <HERE>

// ============================================================================
// Plugin Context - Rich information passed to plugin hooks
// ============================================================================

/**
 * Hints about the current CSS context
 */
export interface ContextHints {
  /** Is this inside a pseudo-element (::before, ::after)? */
  isPseudoElement: boolean;
  /** Is this inside a pseudo-class (:hover, :focus)? */
  isPseudoClass: boolean;
  /** Is this a shorthand property (background, border, margin)? */
  isShorthand: boolean;
  /** Detected shorthand expansions needed */
  shorthandExpansion?: Record<string, string>;
  /** Is this vendor-prefixed? */
  isVendorPrefixed: boolean;
  /** Does this use CSS functions (calc, var, rgb)? */
  cssFunctions: string[];
  /** Is this inside a specificity hack (&&, &&&)? */
  hasSpecificityHack: boolean;
  /** Contains !important? */
  hasImportant: boolean;
}

/**
 * Information about a helper function call
 */
export interface HelperInfo {
  /** The helper function name */
  name: string;
  /** The arguments passed to the helper */
  args: Expression[];
  /** The original call expression */
  callExpression: t.CallExpression;
}

/**
 * Rich context provided to plugin hooks
 */
export interface PluginContext {
  // === Location Context ===
  /** Where in the CSS structure this appears */
  location: ContextLocation;

  // === Selector/At-Rule Path ===
  /** Full selector path from root, e.g., ['&:hover', '> *', '&:not(:first-child)'] */
  selectorPath: string[];
  /** At-rule stack, e.g., ['@media (min-width: 768px)', '@supports (display: grid)'] */
  atRulePath: string[];
  /** Combined specificity hint */
  specificity: { a: number; b: number; c: number };

  // === Value Information ===
  /** The original CSS property name (kebab-case) */
  property?: string;
  /** The original raw value string */
  rawValue: string;
  /** Parsed/classified value type */
  valueType: ValueType;
  /** For theme/prop access: the path segments ['theme', 'colors', 'primary'] */
  accessPath?: string[];
  /** For helpers: the function name and arguments */
  helperInfo?: HelperInfo;
  /** For component refs: the identifier name */
  componentRef?: string;

  // === Hints ===
  hints: ContextHints;

  // === Component Context ===
  /** Name of the styled component being transformed */
  componentName: string;
  /** Base element or component: 'button', 'div', or 'CustomComponent' */
  baseElement: string;
  /** Is this extending another styled component? */
  extendsComponent?: string;
  /** TypeScript props interface if available */
  propsType?: string;

  // === Source Location ===
  filePath: string;
  line?: number;
  column?: number;
}

// ============================================================================
// Plugin Decision Types
// ============================================================================

/**
 * A StyleX-compatible value that can be emitted
 */
export type StyleXValue =
  | { type: "string"; value: string }
  | { type: "number"; value: number }
  | { type: "identifier"; name: string }
  | { type: "expression"; ast: Expression }
  | { type: "conditional"; conditions: Record<string, StyleXValue> }
  | null;

/**
 * Decision returned by plugin hooks
 */
export type PluginDecision =
  | { action: "convert"; value: StyleXValue } // Apply standard conversion
  | { action: "rewrite"; ast: Expression } // Custom AST rewrite
  | { action: "passthrough"; css: string } // Keep as inline style/comment
  | { action: "bail"; reason: string } // Skip with warning
  | { action: "defer" }; // Let default handler decide

// ============================================================================
// Component Information
// ============================================================================

/**
 * Information about a complete styled component
 */
export interface ComponentInfo {
  /** The component's variable name */
  name: string;
  /** The base element ('div', 'button') or component being extended */
  baseElement: string;
  /** Component being extended via styled(Component) */
  extendsComponent?: string;
  /** TypeScript props type */
  propsType?: string;
  /** Props passed via .attrs() */
  attrsProps?: {
    static: Record<string, unknown>;
    dynamic: Record<string, Expression>;
  };
  /** Config from .withConfig() */
  withConfig?: {
    displayName?: string;
    componentId?: string;
    shouldForwardProp?: Expression;
  };
  /** All CSS declarations (after parsing) */
  declarations: ParsedDeclaration[];
  /** Source location */
  loc?: { line: number; column: number };
}

/**
 * A parsed CSS declaration with interpolation info
 */
export interface ParsedDeclaration {
  /** Original property name (kebab-case) */
  property: string;
  /** Camelized property name */
  camelProperty: string;
  /** Raw value string (may contain interpolation placeholders) */
  rawValue: string;
  /** Parsed StyleX value */
  stylexValue?: StyleXValue;
  /** Interpolation expression if dynamic */
  interpolation?: Expression;
  /** Classification result */
  classification?: ClassificationResult;
  /** Selector path for nested rules */
  selectorPath: string[];
  /** At-rule path for media queries etc. */
  atRulePath: string[];
}

// ============================================================================
// Classification Results
// ============================================================================

/**
 * Result of classifying an interpolation expression
 */
export type ClassificationResult =
  | { type: "literal"; value: string | number }
  | { type: "theme"; accessPath: string[]; expression: Expression }
  | { type: "prop"; propName: string; expression: Expression }
  | {
      type: "prop-conditional";
      propName: string;
      consequent: string;
      alternate: string;
      expression: Expression;
    }
  | {
      type: "prop-logical";
      propName: string;
      value: string;
      expression: Expression;
    }
  | { type: "helper"; helperInfo: HelperInfo; expression: Expression }
  | { type: "keyframes-ref"; name: string; expression: Expression }
  | { type: "component-ref"; name: string; expression: Expression }
  | { type: "css-ref"; name: string; expression: Expression }
  | { type: "interpolation"; expression: Expression };

// ============================================================================
// Plugin Interface
// ============================================================================

/**
 * Plugin interface for customizing transformations
 */
export interface Plugin {
  /** Unique name for the plugin */
  name: string;

  /**
   * Called for each dynamic node (interpolation) in template literals
   */
  onInterpolation?(
    node: Expression,
    context: PluginContext,
  ): PluginDecision | Promise<PluginDecision>;

  /**
   * Called for each static CSS declaration
   */
  onDeclaration?(
    property: string,
    value: string,
    context: PluginContext,
  ): PluginDecision | Promise<PluginDecision>;

  /**
   * Called for each selector (allows rewriting or bailing)
   */
  onSelector?(
    selector: string,
    context: PluginContext,
  ): PluginDecision | Promise<PluginDecision>;

  /**
   * Called for at-rules (@media, @keyframes, @supports)
   */
  onAtRule?(
    name: string,
    params: string,
    context: PluginContext,
  ): PluginDecision | Promise<PluginDecision>;

  /**
   * Called after processing a complete styled component
   */
  onComponent?(info: ComponentInfo): void | Promise<void>;

  /**
   * Called at file end to emit additional imports
   */
  getImports?(): string[];

  /**
   * Called at file end to emit additional declarations
   */
  getDeclarations?(): string[];
}

// ============================================================================
// Plugin Host
// ============================================================================

/**
 * Plugin host that manages plugin registration and dispatch
 */
export class PluginHost {
  private plugins: Plugin[] = [];

  /**
   * Register a plugin (later plugins override earlier ones)
   */
  use(plugin: Plugin): this {
    this.plugins.push(plugin);
    return this;
  }

  /**
   * Get all registered plugins
   */
  getPlugins(): Plugin[] {
    return [...this.plugins];
  }

  /**
   * Dispatch to plugins for interpolation handling
   */
  async dispatchInterpolation(
    _node: Expression,
    context: PluginContext,
  ): Promise<PluginDecision> {
    // Iterate in reverse so later plugins take precedence
    for (let i = this.plugins.length - 1; i >= 0; i--) {
      const plugin = this.plugins[i]!;
      if (plugin.onInterpolation) {
        const decision = await plugin.onInterpolation(_node, context);
        if (decision.action !== "defer") {
          return decision;
        }
      }
    }
    return { action: "defer" };
  }

  /**
   * Dispatch to plugins for declaration handling
   */
  async dispatchDeclaration(
    property: string,
    value: string,
    context: PluginContext,
  ): Promise<PluginDecision> {
    for (let i = this.plugins.length - 1; i >= 0; i--) {
      const plugin = this.plugins[i]!;
      if (plugin.onDeclaration) {
        const decision = await plugin.onDeclaration(property, value, context);
        if (decision.action !== "defer") {
          return decision;
        }
      }
    }
    return { action: "defer" };
  }

  /**
   * Dispatch to plugins for selector handling
   */
  async dispatchSelector(
    selector: string,
    context: PluginContext,
  ): Promise<PluginDecision> {
    for (let i = this.plugins.length - 1; i >= 0; i--) {
      const plugin = this.plugins[i]!;
      if (plugin.onSelector) {
        const decision = await plugin.onSelector(selector, context);
        if (decision.action !== "defer") {
          return decision;
        }
      }
    }
    return { action: "defer" };
  }

  /**
   * Dispatch to plugins for at-rule handling
   */
  async dispatchAtRule(
    name: string,
    params: string,
    context: PluginContext,
  ): Promise<PluginDecision> {
    for (let i = this.plugins.length - 1; i >= 0; i--) {
      const plugin = this.plugins[i]!;
      if (plugin.onAtRule) {
        const decision = await plugin.onAtRule(name, params, context);
        if (decision.action !== "defer") {
          return decision;
        }
      }
    }
    return { action: "defer" };
  }

  /**
   * Notify plugins of component processing
   */
  async notifyComponent(info: ComponentInfo): Promise<void> {
    for (const plugin of this.plugins) {
      if (plugin.onComponent) {
        await plugin.onComponent(info);
      }
    }
  }

  /**
   * Collect all imports from plugins
   */
  collectImports(): string[] {
    const imports: string[] = [];
    for (const plugin of this.plugins) {
      if (plugin.getImports) {
        imports.push(...plugin.getImports());
      }
    }
    return [...new Set(imports)]; // Dedupe
  }

  /**
   * Collect all declarations from plugins
   */
  collectDeclarations(): string[] {
    const declarations: string[] = [];
    for (const plugin of this.plugins) {
      if (plugin.getDeclarations) {
        declarations.push(...plugin.getDeclarations());
      }
    }
    return declarations;
  }
}

// ============================================================================
// Adapter Compatibility Layer
// ============================================================================

/**
 * Legacy adapter context (for backward compatibility)
 */
export interface LegacyAdapterContext {
  path: string;
  defaultValue?: string;
  valueType: "theme" | "helper" | "interpolation";
}

/**
 * Legacy adapter interface (for backward compatibility)
 */
export interface LegacyAdapter {
  transformValue(context: LegacyAdapterContext): string;
  getImports(): string[];
  getDeclarations(): string[];
}

/**
 * Convert a legacy adapter to a plugin
 */
export function adapterToPlugin(adapter: LegacyAdapter): Plugin {
  return {
    name: "legacy-adapter",

    onInterpolation(_node, context): PluginDecision {
      if (context.valueType === "theme" && context.accessPath) {
        const path = context.accessPath.join(".");
        const value = adapter.transformValue({
          path,
          valueType: "theme",
        });
        return {
          action: "convert",
          value: { type: "identifier", name: value },
        };
      }

      if (context.valueType === "helper" && context.helperInfo) {
        const value = adapter.transformValue({
          path: context.helperInfo.name,
          valueType: "helper",
        });
        return {
          action: "convert",
          value: { type: "identifier", name: value },
        };
      }

      return { action: "defer" };
    },

    getImports() {
      return adapter.getImports();
    },

    getDeclarations() {
      return adapter.getDeclarations();
    },
  };
}

// ============================================================================
// Built-in Plugin Factories
// ============================================================================

/**
 * Create a theme plugin that maps theme paths to StyleX variables
 */
export function createThemePlugin(options: {
  /** Map theme paths to StyleX variable identifiers */
  themeMap?: Record<string, string>;
  /** Import statement for theme variables */
  themeImport?: string;
  /** Default transformer for unmapped paths */
  defaultTransform?: (path: string[], defaultValue?: string) => string;
}): Plugin {
  const usedThemePaths = new Set<string>();

  return {
    name: "theme",

    onInterpolation(_node, context): PluginDecision {
      if (context.valueType !== "theme" || !context.accessPath) {
        return { action: "defer" };
      }

      const pathKey = context.accessPath.join(".");
      usedThemePaths.add(pathKey);

      // Check explicit mapping
      if (options.themeMap?.[pathKey]) {
        return {
          action: "convert",
          value: { type: "identifier", name: options.themeMap[pathKey]! },
        };
      }

      // Use default transformer
      if (options.defaultTransform) {
        const transformed = options.defaultTransform(context.accessPath);
        return {
          action: "convert",
          value: { type: "identifier", name: transformed },
        };
      }

      // Fallback to CSS variable
      const varName = context.accessPath.join("-");
      return {
        action: "convert",
        value: { type: "string", value: `var(--${varName})` },
      };
    },

    getImports() {
      if (options.themeImport && usedThemePaths.size > 0) {
        return [options.themeImport];
      }
      return [];
    },
  };
}

/**
 * Create a helper plugin that transforms helper function calls
 */
export function createHelperPlugin(options: {
  /** Map helper names to StyleX style object identifiers */
  helperMap: Record<string, string>;
  /** Import statement for helpers */
  helperImport: string;
}): Plugin {
  const usedHelpers = new Set<string>();

  return {
    name: "helpers",

    onInterpolation(_node, context): PluginDecision {
      if (context.valueType !== "helper" || !context.helperInfo) {
        return { action: "defer" };
      }

      const helperName = context.helperInfo.name;

      if (options.helperMap[helperName]) {
        usedHelpers.add(helperName);
        return {
          action: "convert",
          value: { type: "identifier", name: options.helperMap[helperName]! },
        };
      }

      return { action: "defer" };
    },

    getImports() {
      if (usedHelpers.size > 0) {
        return [options.helperImport];
      }
      return [];
    },
  };
}

/**
 * Create a plugin that warns about unsupported patterns
 */
export function createWarningPlugin(): Plugin {
  return {
    name: "warnings",

    onSelector(selector, context): PluginDecision {
      // Component selector patterns
      if (context.componentRef && selector.includes(":hover &")) {
        return {
          action: "bail",
          reason: `Component selector \${${context.componentRef}}:hover & requires manual refactoring. StyleX doesn't support CSS-based component relationships.`,
        };
      }

      // Specificity hacks
      if (context.hints.hasSpecificityHack) {
        return {
          action: "bail",
          reason:
            "Specificity hacks (&&, &&&) are not representable in StyleX. The transform will apply styles directly; manual review may be needed.",
        };
      }

      return { action: "defer" };
    },

    onDeclaration(property, _value, context): PluginDecision {
      // !important warnings
      if (context.hints.hasImportant) {
        // We'll strip it but log a warning
        console.warn(
          `[styled-components-to-stylex] Warning: !important on ${property} will be removed. StyleX handles specificity differently.`,
        );
      }

      return { action: "defer" };
    },
  };
}
