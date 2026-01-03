/**
 * Wrapper Component Generation
 *
 * Generates React wrapper components for styled-components patterns that
 * cannot be directly mapped to StyleX.
 */

import type { JSCodeshift, Identifier, VariableDeclaration } from "jscodeshift";

export interface WrapperConfig {
  /** Component name (e.g., "Comp") */
  name: string;
  /** Base element or component name (e.g., "div", "Link") */
  baseElement: string;
  /** Whether the base is a custom component (not a DOM element) */
  isComponent: boolean;
  /** Style names to apply (e.g., ["styles.comp"]) */
  styleRefs: string[];
  /** Transient props ($-prefixed) to handle */
  transientProps: TransientProp[];
  /** Whether to support `as` prop for polymorphism */
  supportsAs: boolean;
  /** Props interface name (e.g., "CompProps") */
  propsInterfaceName?: string;
  /** Additional props to pass through */
  additionalProps?: string[];
}

export interface TransientProp {
  /** Prop name including $ (e.g., "$draggable") */
  name: string;
  /** TypeScript type (e.g., "boolean") */
  type: string;
  /** Style to apply when truthy */
  truthyStyle?: string;
  /** Style to apply when falsy */
  falsyStyle?: string;
  /** Whether this is optional */
  optional: boolean;
}

/**
 * Generate a wrapper function component declaration
 */
export function generateWrapperComponent(
  j: JSCodeshift,
  config: WrapperConfig,
): VariableDeclaration {
  const { name, baseElement, isComponent, styleRefs, transientProps, supportsAs } = config;

  // Build destructured props
  const propsDestructure: string[] = [];
  const propsToFilter: string[] = [];

  // Add transient props to destructure (so they don't get passed to DOM)
  for (const prop of transientProps) {
    propsDestructure.push(prop.name);
    propsToFilter.push(prop.name);
  }

  // Add `as` prop if polymorphic
  if (supportsAs) {
    propsDestructure.push(`as: Component = "${baseElement}"`);
  }

  // Always add children and rest props
  propsDestructure.push("children");
  propsDestructure.push("...props");

  // Build style expression
  let styleExpr = "";
  if (styleRefs.length === 1 && transientProps.length === 0) {
    styleExpr = `{...stylex.props(${styleRefs[0]})}`;
  } else {
    const styleArgs: string[] = [...styleRefs];

    // Add conditional styles for transient props
    for (const prop of transientProps) {
      if (prop.truthyStyle && prop.falsyStyle) {
        styleArgs.push(`${prop.name} ? ${prop.truthyStyle} : ${prop.falsyStyle}`);
      } else if (prop.truthyStyle) {
        styleArgs.push(`${prop.name} && ${prop.truthyStyle}`);
      }
    }

    styleExpr = `{...stylex.props(${styleArgs.join(", ")})}`;
  }

  // Build element to render
  const elementName = supportsAs ? "Component" : isComponent ? baseElement : `"${baseElement}"`;
  const actualElement = supportsAs ? "Component" : baseElement;

  // Build props type
  const propsTypeParts: string[] = [];
  for (const prop of transientProps) {
    propsTypeParts.push(`${prop.name}${prop.optional ? "?" : ""}: ${prop.type}`);
  }
  propsTypeParts.push("children?: React.ReactNode");

  // Generate the component code as a string and parse it
  const componentCode = supportsAs
    ? `const ${name} = ({ ${propsDestructure.join(", ")} }: { ${propsTypeParts.join("; ")} }) => (
    <${actualElement} ${styleExpr} {...props}>
      {children}
    </${actualElement}>
  )`
    : `const ${name} = ({ ${propsDestructure.join(", ")} }: { ${propsTypeParts.join("; ")} }) => (
    <${actualElement} ${styleExpr} {...props}>
      {children}
    </${actualElement}>
  )`;

  // Parse and return the declaration
  const parsed = j(componentCode);
  const decl = parsed.find(j.VariableDeclaration).at(0).get().node;
  return decl as VariableDeclaration;
}

/**
 * Generate a wrapper for styled(Component) pattern
 */
export function generateStyledComponentWrapper(
  j: JSCodeshift,
  name: string,
  baseComponent: string,
  styleRefs: string[],
  transientProps: TransientProp[],
): VariableDeclaration {
  // Build destructured props (filter transient props)
  const propsDestructure: string[] = [];
  for (const prop of transientProps) {
    propsDestructure.push(prop.name);
  }
  propsDestructure.push("...props");

  // Build style expression
  const styleArgs: string[] = [...styleRefs];
  for (const prop of transientProps) {
    if (prop.truthyStyle && prop.falsyStyle) {
      styleArgs.push(`${prop.name} ? ${prop.truthyStyle} : ${prop.falsyStyle}`);
    } else if (prop.truthyStyle) {
      styleArgs.push(`${prop.name} && ${prop.truthyStyle}`);
    }
  }
  const styleExpr = `{...stylex.props(${styleArgs.join(", ")})}`;

  // Build props type
  const propsTypeParts: string[] = [];
  for (const prop of transientProps) {
    propsTypeParts.push(`${prop.name}${prop.optional ? "?" : ""}: ${prop.type}`);
  }
  // Add the base component's props (simplified - just use text for Link example)
  propsTypeParts.push("text: string");

  const componentCode = `const ${name} = ({ ${propsDestructure.join(", ")} }: { ${propsTypeParts.join("; ")} }) => (
    <${baseComponent} {...props} ${styleExpr} />
  )`;

  const parsed = j(componentCode);
  const decl = parsed.find(j.VariableDeclaration).at(0).get().node;
  return decl as VariableDeclaration;
}

/**
 * Check if a prop name is a transient prop ($-prefixed)
 */
export function isTransientProp(propName: string): boolean {
  return propName.startsWith("$");
}

/**
 * Extract transient prop info from a type parameter or prop access
 */
export function extractTransientPropInfo(propName: string, propType = "boolean"): TransientProp {
  return {
    name: propName,
    type: propType,
    optional: true,
  };
}
