import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

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
function Text<C extends React.ElementType = "span">(props: TextProps & { as?: C }) {
  const { as: Component = "span", children, className, style } = props;
  return (
    <Component className={className} style={style}>
      {children}
    </Component>
  );
}

type LabelProps = React.ComponentPropsWithRef<typeof Text> & {
  htmlFor?: string;
  ref?: React.Ref<HTMLLabelElement>;
};

/**
 * Label component using .attrs to set as="label"
 * The wrapper should use label-specific props (htmlFor)
 */
export function Label(props: LabelProps) {
  const { className, children, style, ...rest } = props;

  return (
    <Text as="label" {...rest} {...mergedSx(styles.label, className, style)}>
      {children}
    </Text>
  );
}

// Usage with label-specific props
export const App = () => <Label htmlFor="input-id">Click me</Label>;

const styles = stylex.create({
  label: {
    borderColor: "blue",
  },
});
