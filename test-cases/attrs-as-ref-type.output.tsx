import * as stylex from "@stylexjs/stylex";
import * as React from "react";

// A polymorphic Text component that defaults to span
type TextProps = React.PropsWithChildren<{
  as?: React.ElementType;
  className?: string;
  style?: React.CSSProperties;
  variant?: "small" | "regular" | "large";
}>;

function Text(props: TextProps) {
  const { as: Component = "span", children, style, variant, ...rest } = props;
  return (
    <Component
      {...rest}
      {...stylex.props(
        styles.text,
        variant === "large" && styles.textLarge,
        variant === "small" && styles.textSmall,
      )}
      style={style}
    >
      {children}
    </Component>
  );
}

type LabelProps = Omit<React.ComponentProps<typeof Text>, "className" | "style"> & {
  htmlFor?: string;
  ref?: React.Ref<HTMLLabelElement>;
};

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
  textLarge: {
    fontSize: "18px",
  },
  textSmall: {
    fontSize: "12px",
  },

  // When .attrs({ as: "label" }) is used, the component should accept:
  // 1. HTMLLabelElement-specific props like htmlFor
  // 2. ref with type RefObject<HTMLLabelElement>
  label: {
    cursor: "pointer",
    userSelect: "none",
  },
});
