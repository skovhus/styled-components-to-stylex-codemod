import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

// A polymorphic Text component that defaults to span
type TextProps = React.PropsWithChildren<{
  as?: React.ElementType;
  className?: string;
  style?: React.CSSProperties;
  variant?: "small" | "regular" | "large";
}>;

function Text(props: TextProps) {
  const {
    as: Component = "span",
    className,
    children,
    variant: variant = "regular",
    ...rest
  } = props;
  return (
    <Component {...rest} {...mergedSx([styles.text, variants[variant]], className)}>
      {children}
    </Component>
  );
}

type LabelProps = Omit<React.ComponentPropsWithRef<typeof Text>, "className" | "style"> & {
  htmlFor?: string;
  ref?: React.Ref<HTMLLabelElement>;
};

// When .attrs({ as: "label" }) is used, the component should accept:
// 1. HTMLLabelElement-specific props like htmlFor
// 2. ref with type RefObject<HTMLLabelElement>
function Label(props: LabelProps) {
  return <Text {...props} as="label" {...stylex.props(styles.label)} />;
}

export function FormField() {
  const labelRef = React.useRef<HTMLLabelElement>(null);
  return (
    <div>
      {/* ref should be typed as HTMLLabelElement since as="label" is set via attrs */}
      <Label ref={labelRef} htmlFor="input-id" variant="regular">
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
  },

  // When .attrs({ as: "label" }) is used, the component should accept:
  // 1. HTMLLabelElement-specific props like htmlFor
  // 2. ref with type RefObject<HTMLLabelElement>
  label: {
    cursor: "pointer",
    userSelect: "none",
  },
});

const variants = stylex.create({
  large: {
    fontSize: "18px",
  },
  small: {
    fontSize: "12px",
  },
  regular: {
    fontSize: "14px",
  },
});
