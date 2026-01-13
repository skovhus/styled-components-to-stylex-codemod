import * as stylex from "@stylexjs/stylex";
import * as React from "react";

// Simplified Text component for test case
type TextProps = React.PropsWithChildren<{
  as?: React.ElementType;
  className?: string;
  style?: React.CSSProperties;
}>;

function Text(props: TextProps) {
  const { as: Component = "span", children, style, ...rest } = props;
  return (
    <Component {...rest} {...stylex.props(styles.text)} style={style}>
      {children}
    </Component>
  );
}

type LabelProps = Omit<React.ComponentProps<typeof Text>, "className" | "style"> &
  React.PropsWithChildren<{
    htmlFor?: string;
    ref?: React.Ref<HTMLLabelElement>;
  }>;

export function Label(props: LabelProps) {
  return <Text {...props} as="label" {...stylex.props(styles.label)} />;
}

export function FormField() {
  // When .attrs({ as: "label" }) is used, ref should be typed as HTMLLabelElement
  const labelRef = React.useRef<HTMLLabelElement>(null);
  return (
    <div>
      <Label ref={labelRef} htmlFor="input-id">
        Username
      </Label>
      <input id="input-id" type="text" />
    </div>
  );
}

export const App = () => <FormField />;

const styles = stylex.create({
  text: {
    fontSize: "14px",
    lineHeight: 1.5,
  },
  label: {
    cursor: "pointer",
    userSelect: "none",
  },
});
