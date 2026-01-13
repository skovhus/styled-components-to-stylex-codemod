import * as React from "react";
import * as stylex from "@stylexjs/stylex";

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

type LabelProps = React.ComponentProps<typeof Text> &
  React.PropsWithChildren<{
    htmlFor?: string;
    ref?: React.Ref<HTMLLabelElement>;
  }>;

export function Label(props: LabelProps) {
  const { className, children, style, ...rest } = props;

  const sx = stylex.props(styles.label);
  return (
    <Text
      as="label"
      {...rest}
      {...sx}
      className={[sx.className, className].filter(Boolean).join(" ")}
      style={{
        ...sx.style,
        ...style,
      }}
    >
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
