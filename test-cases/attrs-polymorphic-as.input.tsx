import styled from "styled-components";

// Pattern: styled(Component).attrs({ as: "element" })
// The "as" prop changes the underlying element type
// The generated type must account for the polymorphic element change

interface TextProps {
  variant?: "small" | "medium" | "large";
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

/** A polymorphic Text component that accepts "as" prop */
function Text(props: TextProps & { as?: React.ElementType }) {
  const { as: Component = "span", children, className, style } = props;
  return (
    <Component className={className} style={style}>
      {children}
    </Component>
  );
}

/**
 * Label component using .attrs to set as="label"
 * The wrapper should use label-specific props (htmlFor)
 */
export const Label = styled(Text).attrs({ as: "label" })<{ htmlFor?: string }>`
  border-color: blue;
`;

// Usage with label-specific props
export const App = () => <Label htmlFor="input-id">Click me</Label>;
