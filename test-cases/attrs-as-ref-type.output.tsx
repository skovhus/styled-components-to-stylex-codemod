import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

// A polymorphic Text component that defaults to span
type TextProps = React.PropsWithChildren<{
  variant?: "small" | "regular" | "large";
}>;

function Text<C extends React.ElementType = "span">(
  props: TextProps & {
    className?: string;
    style?: React.CSSProperties;
    children?: React.ReactNode;
  } & { as?: C },
) {
  const {
    as: Component = "span",
    className,
    children,
    style,
    variant: variant = "regular",
  } = props;

  return (
    <Component {...mergedSx([styles.text, variants[variant]], className, style)}>
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
