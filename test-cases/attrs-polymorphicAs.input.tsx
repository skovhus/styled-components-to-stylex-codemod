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
function Text<C extends React.ElementType = "span">(
  props: TextProps & React.ComponentPropsWithRef<C> & { as?: C },
) {
  const { as: Component = "span", children, className, style, ...rest } = props;
  return (
    <Component className={className} style={style} {...rest}>
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

/** Fixed href supplied by attrs should be omitted from polymorphic C props */
export const FixedHrefText = styled(Text).attrs({ href: "/fixed" })`
  text-decoration: underline;
`;

/** forwardedAs attrs normalize to an emitted "as" prop */
export const ForwardedAsText = styled(Text).attrs({ forwardedAs: "em" })`
  color: purple;
`;

// Usage with label-specific props
export const App = () => (
  <>
    <Label htmlFor="input-id">Click me</Label>
    <FixedHrefText as="a">Fixed href</FixedHrefText>
    <ForwardedAsText>Forwarded as emphasis</ForwardedAsText>
  </>
);
