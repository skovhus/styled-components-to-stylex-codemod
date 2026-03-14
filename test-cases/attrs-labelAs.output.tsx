import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

// Simplified Text component for test case
type TextProps = React.PropsWithChildren<{
  as?: React.ElementType;
  variant?: "small" | "regular" | "large";
  className?: string;
  style?: React.CSSProperties;
}> & { sx?: stylex.StyleXStyles };

function Text(props: TextProps & React.ComponentProps<"span"> & { sx?: stylex.StyleXStyles }) {
  const {
    as: Component = "span",
    className,
    children,
    style,
    sx,
    variant = "regular",
    ...rest
  } = props;

  return (
    <Component {...rest} {...mergedSx([styles.text, variants[variant], sx], className, style)}>
      {children}
    </Component>
  );
}

type LabelProps = {
  htmlFor?: string;
  ref?: React.Ref<HTMLLabelElement>;
} & Omit<React.ComponentPropsWithRef<typeof Text>, "className" | "style">;

/**
 * Label component that can be used with htmlFor to target an input.
 * Uses .attrs({ as: "label" }) to set the element type.
 */
export function Label(props: LabelProps) {
  const { children, ref, ...rest } = props;
  return (
    <Text ref={ref} {...rest} as="label" {...stylex.props(styles.label)}>
      {children}
    </Text>
  );
}

export function FormField() {
  // When .attrs({ as: "label" }) is used, ref should be typed as HTMLLabelElement
  const labelRef = React.useRef<HTMLLabelElement>(null);

  return (
    <div>
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
    lineHeight: 1.5,
  },
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
