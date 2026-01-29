import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

interface TextColorProps extends React.ComponentProps<"span"> {
  /** The color of the text. */
  color: string;
  as?: React.ElementType;
}

/**
 * A text span that sets the color.
 * When exported, should include HTML span props (className, children, style).
 */
export function TextColor(props: TextColorProps) {
  const { as: Component = "span", className, children, style, color } = props;
  return (
    <Component {...mergedSx([styles.textColorColor(color)], className, style)}>
      {children}
    </Component>
  );
}

// Usage should work with children, className, style
export const App = () => (
  <TextColor color="red" className="my-class" style={{ fontSize: 16 }}>
    Hello World
  </TextColor>
);

const styles = stylex.create({
  textColorColor: (color: string) => ({
    color,
  }),
});
