import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

// Simplified Text component for test case
type TextProps = { sx?: stylex.StyleXStyles } & React.PropsWithChildren<{
  as?: React.ElementType;
  className?: string;
  style?: React.CSSProperties;
}>;

function Text(
  props: TextProps & React.ComponentPropsWithRef<"span"> & { sx?: stylex.StyleXStyles },
) {
  const { as: Component = "span", className, children, style, sx, ...rest } = props;

  return (
    <Component {...rest} {...mergedSx([styles.text, sx], className, style)}>
      {children}
    </Component>
  );
}

type LabelProps = Omit<React.ComponentPropsWithRef<typeof Text>, "className" | "style"> & {
  htmlFor?: string;
  ref?: React.Ref<HTMLLabelElement>;
};

/**
 * Label component that can be used with htmlFor to target an input.
 * Uses .attrs({ as: "label" }) to set the element type.
 */
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
