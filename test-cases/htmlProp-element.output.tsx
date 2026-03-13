import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

interface TextColorProps {
  /** The color of the text. */
  color: string;
  sx?: stylex.StyleXStyles;
}

/**
 * A text span that sets the color.
 * When exported, should include HTML span props (className, children, style).
 */
export function TextColor(
  props: TextColorProps & React.ComponentProps<"span"> & { sx?: stylex.StyleXStyles },
) {
  const { className, children, style, sx, color, ...rest } = props;

  return (
    <span
      {...rest}
      {...mergedSx(
        [
          styles.textColorColor({
            color: color,
          }),
          sx,
        ],
        className,
        style,
      )}
    >
      {children}
    </span>
  );
}

// Usage should work with children, className, style
export const App = () => (
  <TextColor color="red" className="my-class" style={{ fontSize: 16 }}>
    Hello World
  </TextColor>
);

const styles = stylex.create({
  textColorColor: (props: { color: string }) => ({
    color: props.color,
  }),
});
