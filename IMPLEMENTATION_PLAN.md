# styled-components → StyleX Codemod: Implementation Plan

## Executive Summary

This document outlines a comprehensive implementation plan for a codemod that transforms styled-components template literals to StyleX. The design centers on a **plugin system with rich context** that enables callers to intercept and customize transformations at every level—from dynamic interpolations to selector paths.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Plugin System Design](#plugin-system-design)
3. [CSS Parsing Pipeline](#css-parsing-pipeline)
4. [Node Classification & Context](#node-classification--context)
5. [Transformation Strategies](#transformation-strategies)
6. [Conservative Default Rules](#conservative-default-rules)
7. [Edge-Case Strategies](#edge-case-strategies)
8. [Testing & Fixtures](#testing--fixtures)
9. [Phased Rollout Plan](#phased-rollout-plan)
10. [Implementation Modules](#implementation-modules)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Transform Pipeline                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────┐     ┌──────────────┐     ┌────────────────┐              │
│   │  jscodeshift│────▶│ SC Collector │────▶│ CSS Parser     │              │
│   │    (AST)    │     │              │     │ (postcss/      │              │
│   └─────────────┘     └──────────────┘     │  postcss-scss) │              │
│                              │             └───────┬────────┘              │
│                              │                     │                        │
│                              ▼                     ▼                        │
│                       ┌──────────────┐     ┌────────────────┐              │
│                       │ Component    │     │ Declaration    │              │
│                       │ Registry     │     │ Extractor      │              │
│                       └──────────────┘     └───────┬────────┘              │
│                              │                     │                        │
│                              └──────────┬──────────┘                        │
│                                         ▼                                   │
│                              ┌──────────────────────┐                       │
│                              │  Plugin Dispatcher   │◀─── User Plugins      │
│                              │  (rich context)      │                       │
│                              └──────────┬───────────┘                       │
│                                         │                                   │
│                    ┌────────────────────┼────────────────────┐              │
│                    ▼                    ▼                    ▼              │
│           ┌──────────────┐    ┌──────────────┐    ┌──────────────┐         │
│           │ Style Object │    │  Component   │    │   Import     │         │
│           │  Generator   │    │  Rewriter    │    │   Manager    │         │
│           └──────────────┘    └──────────────┘    └──────────────┘         │
│                    │                    │                    │              │
│                    └────────────────────┼────────────────────┘              │
│                                         ▼                                   │
│                              ┌──────────────────────┐                       │
│                              │    Code Emitter      │                       │
│                              └──────────────────────┘                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Key Principles

1. **Separation of Concerns**: CSS parsing, JS AST manipulation, and code generation are isolated
2. **Plugin-First**: Every transformation decision passes through the plugin system
3. **Context-Rich**: Plugins receive exhaustive information about the current node's location
4. **Fail-Safe**: Unknown patterns produce warnings, not silent corruption
5. **Incremental**: Designed for phased rollout with feature flags

---

## 2. Plugin System Design

### 2.1 Plugin Interface

```typescript
// src/plugin.ts

export type PluginDecision = 
  | { action: 'convert'; value: StyleXValue }      // Apply standard conversion
  | { action: 'rewrite'; ast: t.Expression }       // Custom AST rewrite
  | { action: 'passthrough'; css: string }         // Keep as inline style/comment
  | { action: 'bail'; reason: string }             // Skip with warning
  | { action: 'defer' };                           // Let default handler decide

export type ValueType = 
  | 'literal'           // Static CSS value: "16px", "#BF4F74"
  | 'theme'             // Theme reference: props.theme.colors.primary
  | 'prop'              // Prop-based value: props.$primary ? 'x' : 'y'  
  | 'helper'            // Helper call: color('primary'), truncate()
  | 'interpolation'     // Generic ${...} expression
  | 'keyframes-ref'     // Reference to keyframes: ${rotate}
  | 'component-ref'     // Component selector: ${Link}
  | 'css-ref';          // css`` template reference: ${truncate}

export type ContextLocation = 
  | 'declaration-value'  // color: <HERE>
  | 'declaration-prop'   // <HERE>: blue (custom property)
  | 'selector'           // <HERE> { color: blue }
  | 'at-rule-params'     // @media <HERE>
  | 'at-rule-name'       // @<HERE> (min-width: ...)
  | 'keyframe-selector'  // <HERE> { transform: ... } (0%, from, to)
  | 'animation-name';    // animation-name: <HERE>

export interface PluginContext {
  // === Location Context ===
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
  helperInfo?: { name: string; args: t.Expression[] };
  /** For component refs: the identifier name */
  componentRef?: string;
  
  // === Hints ===
  hints: {
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
  };
  
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

export interface Plugin {
  name: string;
  
  /**
   * Called for each dynamic node (interpolation) in template literals
   */
  onInterpolation?(
    node: t.Expression,
    context: PluginContext
  ): PluginDecision | Promise<PluginDecision>;
  
  /**
   * Called for each static CSS declaration
   */
  onDeclaration?(
    property: string,
    value: string,
    context: PluginContext
  ): PluginDecision | Promise<PluginDecision>;
  
  /**
   * Called for each selector (allows rewriting or bailing)
   */
  onSelector?(
    selector: string,
    context: PluginContext
  ): PluginDecision | Promise<PluginDecision>;
  
  /**
   * Called for at-rules (@media, @keyframes, @supports)
   */
  onAtRule?(
    name: string,
    params: string,
    context: PluginContext
  ): PluginDecision | Promise<PluginDecision>;
  
  /**
   * Called after processing a complete styled component
   */
  onComponent?(
    info: ComponentInfo
  ): void | Promise<void>;
  
  /**
   * Called at file end to emit additional imports/declarations
   */
  getImports?(): string[];
  getDeclarations?(): string[];
}

export interface PluginHost {
  /**
   * Register a plugin (later plugins override earlier ones)
   */
  use(plugin: Plugin): this;
  
  /**
   * Dispatch to plugins, returning first non-defer decision
   */
  dispatch<K extends keyof Plugin>(
    hook: K,
    ...args: Parameters<NonNullable<Plugin[K]>>
  ): Promise<PluginDecision>;
}
```

### 2.2 Built-in Plugins

```typescript
// src/plugins/index.ts

export { themePlugin } from './theme-plugin';
export { helperPlugin } from './helper-plugin';
export { shorthandPlugin } from './shorthand-plugin';
export { pseudoPlugin } from './pseudo-plugin';
export { mediaQueryPlugin } from './media-query-plugin';
export { keyframesPlugin } from './keyframes-plugin';
export { attrsPlugin } from './attrs-plugin';
export { componentSelectorPlugin } from './component-selector-plugin';
export { cssVariablesPlugin } from './css-variables-plugin';
```

### 2.3 Example Plugin Usage

```typescript
import { runTransform } from 'styled-components-to-stylex-codemod';
import type { Plugin, PluginContext, PluginDecision } from 'styled-components-to-stylex-codemod';

const myThemePlugin: Plugin = {
  name: 'my-theme',
  
  onInterpolation(node, ctx): PluginDecision {
    // Handle theme.colors.* → themeVars.*
    if (ctx.valueType === 'theme' && ctx.accessPath?.[0] === 'colors') {
      const varName = ctx.accessPath.slice(1).join('_');
      return {
        action: 'convert',
        value: { type: 'identifier', name: `colorVars.${varName}` }
      };
    }
    
    // Handle color('primary') helper
    if (ctx.valueType === 'helper' && ctx.helperInfo?.name === 'color') {
      const colorName = ctx.helperInfo.args[0];
      if (colorName?.type === 'StringLiteral') {
        return {
          action: 'convert',
          value: { type: 'identifier', name: `colorVars.${colorName.value}` }
        };
      }
    }
    
    // Unknown pattern - bail with warning
    if (ctx.hints.hasSpecificityHack) {
      return {
        action: 'bail',
        reason: 'Specificity hacks (&&) require manual refactoring'
      };
    }
    
    return { action: 'defer' };
  },
  
  getImports() {
    return ["import { colorVars } from './theme.stylex';"];
  }
};

await runTransform({
  files: 'src/**/*.tsx',
  plugins: [myThemePlugin],
});
```

---

## 3. CSS Parsing Pipeline

### 3.1 Template Literal Extraction

The first step extracts CSS from styled-components template literals while tracking interpolation positions:

```typescript
// src/css-extractor.ts

export interface ExtractedCSS {
  /** CSS with placeholders for interpolations */
  css: string;
  /** Map of placeholder ID to original expression */
  interpolations: Map<string, InterpolationInfo>;
  /** Source map for error reporting */
  sourceMap: SourceMap;
}

export interface InterpolationInfo {
  expression: t.Expression;
  position: { start: number; end: number };
  /** Context hint from surrounding CSS */
  contextHint: 'value' | 'selector' | 'property' | 'unknown';
}

/**
 * Extracts CSS from template literal, replacing expressions with placeholders
 * 
 * Input:  styled.div`color: ${props => props.theme.primary}; &:hover { color: red; }`
 * Output: { css: "color: __INTERP_0__; &:hover { color: red; }", interpolations: {...} }
 */
export function extractCSS(
  templateLiteral: t.TemplateLiteral,
  filePath: string
): ExtractedCSS {
  const quasis = templateLiteral.quasis;
  const expressions = templateLiteral.expressions;
  const interpolations = new Map<string, InterpolationInfo>();
  
  let css = '';
  let position = 0;
  
  for (let i = 0; i < quasis.length; i++) {
    const quasi = quasis[i];
    css += quasi.value.cooked ?? quasi.value.raw;
    position += quasi.value.raw.length;
    
    if (i < expressions.length) {
      const expr = expressions[i];
      const id = `__INTERP_${i}__`;
      const contextHint = inferContextFromSurrounding(css, quasis[i + 1]?.value.raw ?? '');
      
      interpolations.set(id, {
        expression: expr,
        position: { start: position, end: position + id.length },
        contextHint,
      });
      
      css += id;
      position += id.length;
    }
  }
  
  return { css, interpolations, sourceMap: buildSourceMap(quasis, filePath) };
}

function inferContextFromSurrounding(before: string, after: string): InterpolationInfo['contextHint'] {
  const trimmedBefore = before.trimEnd();
  const trimmedAfter = after.trimStart();
  
  // After a colon → likely a value
  if (trimmedBefore.endsWith(':')) return 'value';
  
  // Before a colon → likely a property (custom property)
  if (trimmedAfter.startsWith(':')) return 'property';
  
  // Inside braces after & → likely a selector
  if (/&[^{]*$/.test(trimmedBefore)) return 'selector';
  
  return 'unknown';
}
```

### 3.2 PostCSS Parsing with Interpolation Awareness

```typescript
// src/css-parser.ts
import postcss, { Root, Rule, Declaration, AtRule } from 'postcss';
import postcssScss from 'postcss-scss';

export interface ParsedStylesheet {
  root: Root;
  interpolations: Map<string, InterpolationInfo>;
}

/**
 * Parse CSS string (with interpolation placeholders) into PostCSS AST
 */
export function parseCSS(extracted: ExtractedCSS): ParsedStylesheet {
  // Use SCSS parser for nested selectors and & references
  const root = postcss.parse(extracted.css, {
    parser: postcssScss,
    from: extracted.sourceMap.file,
  });
  
  return {
    root,
    interpolations: extracted.interpolations,
  };
}

/**
 * Walk the PostCSS AST, building context for each node
 */
export function walkWithContext(
  parsed: ParsedStylesheet,
  visitor: (node: postcss.Node, context: WalkContext) => void
): void {
  const walk = (node: postcss.Node, ctx: WalkContext) => {
    visitor(node, ctx);
    
    if ('nodes' in node && node.nodes) {
      for (const child of node.nodes) {
        const childCtx = buildChildContext(child, ctx);
        walk(child, childCtx);
      }
    }
  };
  
  walk(parsed.root, { selectorPath: [], atRulePath: [], specificity: { a: 0, b: 0, c: 0 } });
}

interface WalkContext {
  selectorPath: string[];
  atRulePath: string[];
  specificity: { a: number; b: number; c: number };
}

function buildChildContext(node: postcss.Node, parent: WalkContext): WalkContext {
  if (node.type === 'rule') {
    const rule = node as Rule;
    return {
      ...parent,
      selectorPath: [...parent.selectorPath, rule.selector],
      specificity: addSpecificity(parent.specificity, calculateSpecificity(rule.selector)),
    };
  }
  
  if (node.type === 'atrule') {
    const atRule = node as AtRule;
    return {
      ...parent,
      atRulePath: [...parent.atRulePath, `@${atRule.name} ${atRule.params}`],
    };
  }
  
  return parent;
}
```

---

## 4. Node Classification & Context

### 4.1 Interpolation Classifier

```typescript
// src/classifier.ts

export function classifyInterpolation(
  expr: t.Expression,
  contextHint: string
): ClassificationResult {
  // Arrow function: (props) => props.theme.x
  if (t.isArrowFunctionExpression(expr)) {
    return classifyArrowFunction(expr);
  }
  
  // Function call: color('primary'), truncate()
  if (t.isCallExpression(expr)) {
    return classifyCallExpression(expr);
  }
  
  // Identifier: ${rotate} (keyframes), ${Link} (component)
  if (t.isIdentifier(expr)) {
    return classifyIdentifier(expr, contextHint);
  }
  
  // Conditional: condition ? 'a' : 'b'
  if (t.isConditionalExpression(expr)) {
    return classifyConditional(expr);
  }
  
  // Logical: condition && 'styles'
  if (t.isLogicalExpression(expr)) {
    return classifyLogical(expr);
  }
  
  // Template literal: `${size}px`
  if (t.isTemplateLiteral(expr)) {
    return classifyTemplateLiteral(expr);
  }
  
  // Member expression: theme.colors.primary
  if (t.isMemberExpression(expr)) {
    return classifyMemberExpression(expr);
  }
  
  // Literal: 16, '16px'
  if (t.isLiteral(expr)) {
    return { type: 'literal', value: extractLiteralValue(expr) };
  }
  
  return { type: 'interpolation', expression: expr };
}

function classifyArrowFunction(expr: t.ArrowFunctionExpression): ClassificationResult {
  const body = expr.body;
  const param = expr.params[0];
  
  // Simple theme access: props => props.theme.x
  if (t.isMemberExpression(body)) {
    const path = extractMemberPath(body);
    
    if (path[0] === 'props' && path[1] === 'theme') {
      return {
        type: 'theme',
        accessPath: path.slice(2),
        expression: expr,
      };
    }
    
    // Prop access: props => props.$primary
    if (path[0] === 'props' && path[1]?.startsWith('$')) {
      return {
        type: 'prop',
        propName: path[1],
        expression: expr,
      };
    }
  }
  
  // Ternary: props => props.$x ? 'a' : 'b'
  if (t.isConditionalExpression(body)) {
    return classifyPropConditional(body, param);
  }
  
  // Logical: props => props.$x && 'styles'
  if (t.isLogicalExpression(body)) {
    return classifyPropLogical(body, param);
  }
  
  return { type: 'interpolation', expression: expr };
}
```

### 4.2 Context Builder

```typescript
// src/context-builder.ts

export function buildPluginContext(
  node: postcss.Node,
  walkCtx: WalkContext,
  interpolation: InterpolationInfo | null,
  componentInfo: ComponentInfo,
  filePath: string
): PluginContext {
  const classification = interpolation 
    ? classifyInterpolation(interpolation.expression, interpolation.contextHint)
    : null;
  
  return {
    location: determineLocation(node),
    selectorPath: walkCtx.selectorPath,
    atRulePath: walkCtx.atRulePath,
    specificity: walkCtx.specificity,
    
    property: node.type === 'decl' ? node.prop : undefined,
    rawValue: node.type === 'decl' ? node.value : (node as any).selector ?? '',
    valueType: classification?.type ?? 'literal',
    accessPath: classification?.accessPath,
    helperInfo: classification?.helperInfo,
    componentRef: classification?.componentRef,
    
    hints: {
      isPseudoElement: walkCtx.selectorPath.some(s => /::/.test(s)),
      isPseudoClass: walkCtx.selectorPath.some(s => /:[^:]/.test(s)),
      isShorthand: isShorthandProperty(node.type === 'decl' ? node.prop : ''),
      shorthandExpansion: maybeExpandShorthand(node),
      isVendorPrefixed: node.type === 'decl' && /^-/.test(node.prop),
      cssFunctions: extractCSSFunctions(node.type === 'decl' ? node.value : ''),
      hasSpecificityHack: walkCtx.selectorPath.some(s => /&&/.test(s)),
      hasImportant: node.type === 'decl' && node.important,
    },
    
    componentName: componentInfo.name,
    baseElement: componentInfo.baseElement,
    extendsComponent: componentInfo.extendsComponent,
    propsType: componentInfo.propsType,
    
    filePath,
    line: node.source?.start?.line,
    column: node.source?.start?.column,
  };
}
```

---

## 5. Transformation Strategies

### 5.1 Static Declarations

```typescript
// Input:  font-size: 1.5em;
// Output: fontSize: "1.5em"

function transformStaticDeclaration(
  prop: string,
  value: string,
  context: PluginContext
): StyleXProperty {
  const camelProp = kebabToCamel(prop);
  
  // Handle shorthand expansion
  if (context.hints.isShorthand && context.hints.shorthandExpansion) {
    return Object.entries(context.hints.shorthandExpansion).map(
      ([expandedProp, expandedValue]) => ({
        [kebabToCamel(expandedProp)]: wrapValue(expandedValue),
      })
    );
  }
  
  // Handle !important (strip it, StyleX has its own specificity model)
  const cleanValue = value.replace(/\s*!important\s*$/, '');
  
  return { [camelProp]: wrapValue(cleanValue) };
}
```

### 5.2 Pseudo-Classes & Pseudo-Elements

```typescript
// Input:  &:hover { color: red; }
// Output: color: { default: "blue", ":hover": "red" }

// Input:  &::before { content: '🔥'; }
// Output: "::before": { content: '"🔥"' }

function transformPseudoSelector(
  selector: string,
  declarations: ParsedDeclaration[],
  baseStyles: StyleXObject
): StyleXObject {
  const pseudoMatch = selector.match(/&(::?\w+(?:-\w+)*)/);
  if (!pseudoMatch) return baseStyles;
  
  const pseudo = pseudoMatch[1]; // :hover, ::before, etc.
  const isPseudoElement = pseudo.startsWith('::');
  
  if (isPseudoElement) {
    // Pseudo-elements get their own object
    baseStyles[pseudo] = {};
    for (const decl of declarations) {
      baseStyles[pseudo][decl.camelProp] = decl.value;
    }
  } else {
    // Pseudo-classes merge into conditional values
    for (const decl of declarations) {
      const existing = baseStyles[decl.camelProp];
      if (typeof existing === 'object' && existing !== null) {
        existing[pseudo] = decl.value;
      } else {
        baseStyles[decl.camelProp] = {
          default: existing ?? null,
          [pseudo]: decl.value,
        };
      }
    }
  }
  
  return baseStyles;
}
```

### 5.3 Media Queries

```typescript
// Input:
//   width: 100%;
//   @media (min-width: 768px) { width: 750px; }
// Output:
//   width: {
//     default: "100%",
//     "@media (min-width: 768px)": "750px",
//   }

function transformMediaQuery(
  atRule: AtRule,
  declarations: ParsedDeclaration[],
  baseStyles: StyleXObject
): StyleXObject {
  const mediaQuery = `@media ${atRule.params}`;
  
  for (const decl of declarations) {
    const existing = baseStyles[decl.camelProp];
    if (typeof existing === 'object' && existing !== null && !Array.isArray(existing)) {
      existing[mediaQuery] = decl.value;
    } else {
      baseStyles[decl.camelProp] = {
        default: existing ?? null,
        [mediaQuery]: decl.value,
      };
    }
  }
  
  return baseStyles;
}
```

### 5.4 Keyframes

```typescript
// Input:
//   const rotate = keyframes`from { transform: rotate(0deg); } to { transform: rotate(360deg); }`;
//   animation: ${rotate} 2s linear infinite;
// Output:
//   const rotate = stylex.keyframes({ from: { transform: "rotate(0deg)" }, to: { transform: "rotate(360deg)" } });
//   animationName: rotate, animationDuration: "2s", ...

function transformKeyframes(
  name: string,
  css: string
): t.VariableDeclaration {
  const parsed = postcss.parse(css);
  const keyframeObj: Record<string, Record<string, string>> = {};
  
  parsed.walkRules((rule) => {
    const selector = rule.selector; // from, to, 0%, 100%
    keyframeObj[selector] = {};
    rule.walkDecls((decl) => {
      keyframeObj[selector][kebabToCamel(decl.prop)] = `"${decl.value}"`;
    });
  });
  
  return t.variableDeclaration('const', [
    t.variableDeclarator(
      t.identifier(name),
      t.callExpression(
        t.memberExpression(t.identifier('stylex'), t.identifier('keyframes')),
        [buildObjectExpression(keyframeObj)]
      )
    )
  ]);
}
```

### 5.5 Dynamic Props → Variants or Function Styles

```typescript
// Strategy 1: Boolean props → separate style objects
// Input:  background: ${props => props.$primary ? '#BF4F74' : 'white'};
// Output: 
//   button: { backgroundColor: 'white' },
//   buttonPrimary: { backgroundColor: '#BF4F74' },
//   Usage: stylex.props(styles.button, $primary && styles.buttonPrimary)

// Strategy 2: String/enum props → function styles
// Input:  padding: ${props => props.$padding};
// Output:
//   inputPadding: (padding: string) => ({ padding }),
//   Usage: stylex.props(styles.input, styles.inputPadding($padding))

function transformDynamicProp(
  expr: t.ArrowFunctionExpression,
  propName: string,
  context: PluginContext
): TransformResult {
  const body = expr.body;
  
  // Boolean conditional: props.$x ? 'a' : 'b'
  if (t.isConditionalExpression(body)) {
    const condition = body.test;
    const consequent = extractStaticValue(body.consequent);
    const alternate = extractStaticValue(body.alternate);
    
    if (consequent && alternate && isBooleanPropAccess(condition)) {
      const boolProp = extractPropName(condition);
      return {
        type: 'variant',
        baseValue: alternate,
        variantName: `${context.componentName}${capitalize(boolProp.slice(1))}`,
        variantValue: consequent,
        condition: boolProp,
      };
    }
  }
  
  // Direct prop pass-through: props.$padding
  if (t.isMemberExpression(body)) {
    const propPath = extractMemberPath(body);
    if (propPath[0] === 'props' && propPath[1]?.startsWith('$')) {
      return {
        type: 'function-style',
        paramName: propPath[1].slice(1), // Remove $ prefix
        styleProperty: context.property,
      };
    }
  }
  
  // Complex expression: bail to inline style
  return {
    type: 'inline-style',
    expression: expr,
    property: context.property,
  };
}
```

---

## 6. Conservative Default Rules

### 6.1 What Gets Auto-Converted

| Pattern | Confidence | Action |
|---------|------------|--------|
| Static declarations | ✅ High | Convert |
| `&:hover`, `&:focus`, etc. | ✅ High | Conditional values |
| `&::before`, `&::after` | ✅ High | Pseudo-element object |
| `@media` queries | ✅ High | Conditional values |
| `keyframes` | ✅ High | `stylex.keyframes()` |
| `styled.div` → base element | ✅ High | Use element directly |
| `styled(Component)` | ⚠️ Medium | Compose styles |
| `props => props.theme.x` | ⚠️ Medium | Via adapter |
| `props => props.$x ? a : b` | ⚠️ Medium | Variant styles |

### 6.2 What Produces Warnings

| Pattern | Warning Level | Recommendation |
|---------|---------------|----------------|
| `createGlobalStyle` | ⚠️ Warning | Use CSS reset file |
| `${Component}:hover &` | ⚠️ Warning | Manual refactor |
| `&&`, `&&&` specificity | ⚠️ Warning | StyleX handles specificity |
| `> *`, child selectors | ⚠️ Warning | Split into child styles |
| `.attrs()` with expressions | ⚠️ Warning | Move to component props |
| Complex interpolations | ⚠️ Warning | Review output |

### 6.3 What Bails (Requires Manual Intervention)

| Pattern | Reason |
|---------|--------|
| Dynamic property names | Not expressible in StyleX |
| Runtime-computed selectors | Not static |
| `css` helper with props | Context-dependent |
| `withTheme` HOC | Architectural change needed |

---

## 7. Edge-Case Strategies

### 7.1 Shorthand Expansion

```typescript
// src/shorthand.ts

const SHORTHAND_MAP: Record<string, string[]> = {
  background: ['backgroundColor'],  // Simplified; full is complex
  border: ['borderWidth', 'borderStyle', 'borderColor'],
  margin: ['marginTop', 'marginRight', 'marginBottom', 'marginLeft'],
  padding: ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'],
  // ... etc
};

export function expandShorthand(prop: string, value: string): Record<string, string> | null {
  if (!SHORTHAND_MAP[prop]) return null;
  
  // Handle border: 2px solid red
  if (prop === 'border') {
    const parts = value.split(/\s+/);
    // Heuristic parsing
    const width = parts.find(p => /^\d/.test(p)) ?? '1px';
    const style = parts.find(p => ['solid', 'dashed', 'dotted', 'none'].includes(p)) ?? 'solid';
    const color = parts.find(p => !(/^\d/.test(p)) && !['solid', 'dashed', 'dotted', 'none'].includes(p)) ?? 'currentColor';
    return { borderWidth: width, borderStyle: style, borderColor: color };
  }
  
  // Handle margin/padding: 1px 2px 3px 4px
  if (prop === 'margin' || prop === 'padding') {
    const parts = value.split(/\s+/);
    const [top, right = top, bottom = top, left = right] = parts;
    const prefix = prop === 'margin' ? 'margin' : 'padding';
    return {
      [`${prefix}Top`]: top,
      [`${prefix}Right`]: right,
      [`${prefix}Bottom`]: bottom,
      [`${prefix}Left`]: left,
    };
  }
  
  return null;
}
```

### 7.2 CSS `content` Quoting

```typescript
// content property needs double quotes inside the string value
// Input:  content: '🔥'
// Output: content: '"🔥"'

function normalizeContentValue(value: string): string {
  // Already has inner quotes
  if (/^["'].*["']$/.test(value.trim())) {
    return value;
  }
  
  // Wrap in quotes
  const cleaned = value.replace(/^['"]|['"]$/g, '');
  return `'"${cleaned}"'`;
}
```

### 7.3 Nesting & Child Selectors

```typescript
// Input:
//   > * { flex: 1; &:not(:first-child) { margin-left: 1rem; } }
// Strategy: Extract child styles as separate style objects

function transformNesting(
  rule: Rule,
  parentContext: PluginContext
): NestingResult {
  const selector = rule.selector;
  
  // Child selector: > *
  if (selector.includes('> *') || selector.includes('> :')) {
    return {
      type: 'extract-child',
      styleName: `${parentContext.componentName}Child`,
      styles: extractDeclarations(rule),
      usageHint: 'Apply to child elements manually',
    };
  }
  
  // Sibling selectors: & + &, & ~ &
  if (/&\s*[+~]\s*&/.test(selector)) {
    return {
      type: 'extract-variant',
      styleName: `${parentContext.componentName}Sibling`,
      styles: extractDeclarations(rule),
      usageHint: 'Apply to non-first siblings',
    };
  }
  
  // Nested pseudo: &:not(:first-child)
  if (/&:not\(:first-child\)/.test(selector)) {
    return {
      type: 'extract-variant',
      styleName: `${parentContext.componentName}NotFirst`,
      styles: extractDeclarations(rule),
      usageHint: 'Apply to all except first',
    };
  }
  
  return { type: 'unknown', selector };
}
```

### 7.4 Component Selector Transformation

```typescript
// Input:  ${Link}:hover & { fill: rebeccapurple; }
// Strategy: Hoist hover state to parent, pass styles to child

function transformComponentSelector(
  componentRef: string,
  selector: string,
  declarations: ParsedDeclaration[],
  context: PluginContext
): ComponentSelectorResult {
  // This is fundamentally a paradigm shift: styled-components uses
  // CSS cascade, StyleX uses explicit style passing
  
  return {
    type: 'requires-refactor',
    warning: `Component selector \${${componentRef}} requires architectural changes. ` +
             `StyleX doesn't support CSS-based component relationships. ` +
             `Convert to: 1) Pass styles as props, 2) Use React state for hover`,
    suggestedApproach: {
      // Extract the hover variant styles
      parentStyles: {
        name: `${context.componentName}Hover`,
        styles: declarations,
      },
      // Suggest useState + onMouseEnter pattern
      stateManagement: 'useState',
      propsToPass: ['isHovered'],
    },
  };
}
```

### 7.5 `.attrs()` Handling

```typescript
// Input:
//   styled.input.attrs(props => ({ type: 'text', size: props.$small ? 5 : undefined }))`...`
// Output:
//   <input type="text" size={$small ? 5 : undefined} {...stylex.props(styles.input)} />

function transformAttrs(
  attrsArg: t.Expression,
  componentInfo: ComponentInfo
): AttrsResult {
  // Static object: .attrs({ type: 'text' })
  if (t.isObjectExpression(attrsArg)) {
    return {
      type: 'static-props',
      props: extractStaticProps(attrsArg),
    };
  }
  
  // Arrow function: .attrs(props => ({ ... }))
  if (t.isArrowFunctionExpression(attrsArg)) {
    const body = attrsArg.body;
    
    if (t.isObjectExpression(body)) {
      const staticProps: Record<string, any> = {};
      const dynamicProps: Record<string, t.Expression> = {};
      
      for (const prop of body.properties) {
        if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
          const value = prop.value;
          if (t.isLiteral(value)) {
            staticProps[prop.key.name] = extractLiteralValue(value);
          } else {
            dynamicProps[prop.key.name] = value;
          }
        }
      }
      
      return { type: 'mixed-props', staticProps, dynamicProps };
    }
  }
  
  return { type: 'complex', expression: attrsArg };
}
```

---

## 8. Testing & Fixtures

### 8.1 Test Structure

```
test-cases/
├── basic.input.tsx              # Input file
├── basic.output.tsx             # Expected output
├── basic.warnings.json          # Expected warnings (optional)
├── basic.stylex.ts              # Required StyleX imports (optional)
├── category/                    # Grouped test cases
│   ├── nested.input.tsx
│   └── nested.output.tsx
└── lib/                         # Shared helpers for test cases
    ├── helpers.ts
    └── helpers.stylex.ts
```

### 8.2 Test Runner Enhancement

```typescript
// src/transform.test.ts

describe('transform', () => {
  const testCases = getTestCases();
  
  describe.each(testCases)('%s', (name) => {
    const { input, output, warnings: expectedWarnings } = readTestCase(name);
    
    it('produces expected output', () => {
      const result = runTransform(input);
      expect(result.code).toBe(output);
    });
    
    it('produces expected warnings', () => {
      const result = runTransform(input);
      expect(result.warnings.map(w => w.feature)).toEqual(expectedWarnings ?? []);
    });
    
    it('output passes linting', () => {
      const result = runTransform(input);
      expect(() => lintCode(result.code)).not.toThrow();
    });
    
    it('output is valid StyleX', () => {
      const result = runTransform(input);
      expect(() => validateStyleX(result.code)).not.toThrow();
    });
  });
});
```

### 8.3 Snapshot Testing for Complex Cases

```typescript
// For cases where exact output matching is too brittle
describe('complex transforms', () => {
  it('handles deeply nested media queries', () => {
    const input = `
      const Box = styled.div\`
        width: 100%;
        @media (min-width: 768px) {
          width: 50%;
          @media (min-width: 1024px) {
            width: 33%;
          }
        }
      \`;
    `;
    
    const result = runTransform(input);
    expect(result.code).toMatchSnapshot();
  });
});
```

### 8.4 Visual Regression Testing

The existing Storybook setup provides visual regression testing:

```typescript
// test-cases/TestCases.stories.tsx
// Auto-discovers and renders input/output side-by-side
```

Run with Playwright MCP for automated visual comparison.

---

## 9. Phased Rollout Plan

### Phase 1: Foundation (Weeks 1-2)
**Goal**: Core infrastructure and simple cases

- [ ] CSS extraction from template literals
- [ ] PostCSS parsing with interpolation tracking
- [ ] Plugin system scaffold
- [ ] Static declarations transformation
- [ ] `styled.element` → native element + stylex.props
- [ ] **Test cases**: `basic`, `style-objects`

### Phase 2: Selectors & At-Rules (Weeks 3-4)
**Goal**: Handle CSS structure

- [ ] Pseudo-classes (`:hover`, `:focus`, `:active`)
- [ ] Pseudo-elements (`::before`, `::after`, `::placeholder`)
- [ ] Media queries
- [ ] `@keyframes` transformation
- [ ] **Test cases**: `pseudo-selectors`, `media-queries`, `keyframes`, `multiple-animations`

### Phase 3: Dynamic Values (Weeks 5-6)
**Goal**: Handle interpolations

- [ ] Theme access (`props.theme.x`)
- [ ] Boolean prop conditionals (`props.$primary ? a : b`)
- [ ] String interpolations (`${variable}px`)
- [ ] CSS variables (`var(--x)`)
- [ ] `calc()` expressions
- [ ] **Test cases**: `theming`, `adapting-props`, `conditional-styles`, `string-interpolation`, `css-variables`, `css-calc`

### Phase 4: Component Patterns (Weeks 7-8)
**Goal**: Handle styled-components patterns

- [ ] `styled(Component)` extension
- [ ] `.attrs()` transformation
- [ ] `css` helper
- [ ] Transient props (`$propName`)
- [ ] `.withConfig()` (strip, preserve displayName in dev)
- [ ] **Test cases**: `extending-styles`, `attrs`, `css-helper`, `transient-props`, `with-config`

### Phase 5: Advanced Selectors (Weeks 9-10)
**Goal**: Handle complex selectors with warnings

- [ ] Child selectors (`> *`)
- [ ] Sibling selectors (`& + &`, `& ~ &`)
- [ ] Attribute selectors (`&[disabled]`, `&[type="text"]`)
- [ ] Nesting extraction
- [ ] **Test cases**: `nesting`, `sibling-selectors`, `attribute-selectors`, `universal-selector`, `complex-selectors`

### Phase 6: Theming & Context (Weeks 11-12)
**Goal**: Theme provider transformation

- [ ] `ThemeProvider` → `stylex.createTheme`
- [ ] `useTheme` hook conversion
- [ ] `withTheme` HOC (warning + manual guidance)
- [ ] Ad-hoc theme prop
- [ ] Function theme
- [ ] **Test cases**: `theming`, `use-theme`, `with-theme`, `adhoc-theme`, `function-theme`

### Phase 7: Edge Cases & Polish (Weeks 13-14)
**Goal**: Handle remaining patterns

- [ ] Component selectors (with warnings)
- [ ] Specificity hacks (with warnings)
- [ ] `createGlobalStyle` (with warnings)
- [ ] `!important` stripping
- [ ] Refs forwarding
- [ ] `forwardedAs` prop
- [ ] `shouldForwardProp`
- [ ] **Test cases**: `component-selector`, `specificity`, `global-styles`, `important`, `refs`, `forwarded-as`, `should-forward-prop`, `descendant-component-selector`

### Phase 8: Helpers & Validation (Week 15)
**Goal**: Final polish

- [ ] Helper function plugin system
- [ ] Complete shorthand expansion
- [ ] Output validation
- [ ] Performance optimization
- [ ] Documentation
- [ ] **Test cases**: `helpers`

---

## 10. Implementation Modules

### Module Structure

```
src/
├── index.ts                    # Public exports
├── transform.ts                # Main jscodeshift transform
├── run.ts                      # Programmatic runner
├── plugin.ts                   # Plugin interface & host
├── css/
│   ├── extractor.ts            # Template literal → CSS extraction
│   ├── parser.ts               # PostCSS parsing
│   ├── walker.ts               # Context-building walker
│   └── shorthand.ts            # Shorthand property expansion
├── classifier/
│   ├── index.ts                # Main classifier
│   ├── theme.ts                # Theme access classification
│   ├── props.ts                # Prop-based classification
│   ├── helpers.ts              # Helper function classification
│   └── selectors.ts            # Selector classification
├── generators/
│   ├── styles.ts               # stylex.create() generation
│   ├── keyframes.ts            # stylex.keyframes() generation
│   ├── theme.ts                # stylex.createTheme() generation
│   ├── component.ts            # Component rewriting
│   └── imports.ts              # Import management
├── plugins/
│   ├── defaults/
│   │   ├── static.ts           # Static declaration handling
│   │   ├── pseudo.ts           # Pseudo-class/element handling
│   │   ├── media.ts            # Media query handling
│   │   └── keyframes.ts        # Keyframes handling
│   └── adapters/
│       ├── css-variables.ts    # CSS custom properties adapter
│       ├── define-vars.ts      # stylex.defineVars adapter
│       └── inline-values.ts    # Inline value adapter
├── utils/
│   ├── naming.ts               # kebab-to-camel, style naming
│   ├── ast.ts                  # AST helpers
│   ├── specificity.ts          # Selector specificity calculation
│   └── source-map.ts           # Source map utilities
└── types.ts                    # Shared type definitions
```

### Key Dependencies

```json
{
  "dependencies": {
    "jscodeshift": "^17.3.0",
    "postcss": "^8.5.0",
    "postcss-scss": "^4.0.9",
    "postcss-selector-parser": "^7.1.0",
    "css-what": "^6.1.0"
  }
}
```

---

## Appendix A: StyleX Syntax Reference

### Conditional Values

```typescript
// Pseudo-classes
const styles = stylex.create({
  button: {
    color: {
      default: 'blue',
      ':hover': 'red',
      ':active': 'darkred',
    },
  },
});

// Media queries
const styles = stylex.create({
  container: {
    width: {
      default: '100%',
      '@media (min-width: 768px)': '750px',
    },
  },
});
```

### Pseudo-Elements

```typescript
const styles = stylex.create({
  element: {
    '::before': {
      content: '"→"',
      marginRight: '0.5em',
    },
  },
});
```

### Keyframes

```typescript
const fadeIn = stylex.keyframes({
  from: { opacity: 0 },
  to: { opacity: 1 },
});

const styles = stylex.create({
  animated: {
    animationName: fadeIn,
    animationDuration: '0.3s',
  },
});
```

### Dynamic Styles (Function Styles)

```typescript
const styles = stylex.create({
  box: (size: number) => ({
    width: size,
    height: size,
  }),
});

// Usage
<div {...stylex.props(styles.box(100))} />
```

### Theme Variables

```typescript
// tokens.stylex.ts
export const colors = stylex.defineVars({
  primary: '#BF4F74',
  secondary: '#4F74BF',
});

// component.tsx
import { colors } from './tokens.stylex';

const styles = stylex.create({
  button: {
    backgroundColor: colors.primary,
  },
});

// Theme override
const darkTheme = stylex.createTheme(colors, {
  primary: '#FF6B9D',
});
```

---

## Appendix B: Decision Matrix

| Input Pattern | Output Strategy | Confidence | Plugin Hook |
|---------------|-----------------|------------|-------------|
| `styled.div\`...\`` | `<div {...stylex.props(styles.x)}>` | High | `onComponent` |
| `color: blue;` | `color: "blue"` | High | `onDeclaration` |
| `&:hover { color: red }` | `color: { default: null, ':hover': 'red' }` | High | `onSelector` |
| `@media (min-width: X)` | `prop: { default: Y, '@media...': Z }` | High | `onAtRule` |
| `${props => props.theme.x}` | `themeVars.x` (via adapter) | Medium | `onInterpolation` |
| `${props => props.$x ? a : b}` | Variant styles + conditional apply | Medium | `onInterpolation` |
| `${keyframes}` | `animationName: keyframesVar` | High | `onInterpolation` |
| `${Component}:hover &` | Warning + manual refactor guidance | Low | `onSelector` |
| `&&` / `&&&` | Strip + warning | Low | `onSelector` |
| `createGlobalStyle` | Warning + remove | N/A | `onComponent` |

---

## Appendix C: Migration Checklist

For teams adopting this codemod:

### Pre-Migration
- [ ] Audit styled-components usage patterns
- [ ] Identify custom helpers and theme structure
- [ ] Create StyleX token files (`defineVars`)
- [ ] Set up StyleX build pipeline

### During Migration
- [ ] Run codemod with `--dry-run` first
- [ ] Review generated warnings
- [ ] Handle unsupported patterns manually
- [ ] Validate visual output in Storybook

### Post-Migration
- [ ] Remove styled-components dependency
- [ ] Run full test suite
- [ ] Performance benchmark
- [ ] Update documentation
