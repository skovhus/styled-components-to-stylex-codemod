import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

interface TextColorProps extends Omit<React.ComponentProps<"span">, "style"> {
  /** The color of the text. */
  color: string;
  as?: React.ElementType;
}

/**
 * A text span that sets the color.
 * When exported, should include HTML span props (className, children, style).
 */
export function TextColor(props: TextColorProps) {
  const { as: Component = "span", className, children, color } = props;
  return <Component {...mergedSx([styles.textColorColor(color)], className)}>{children}</Component>;
}

// Usage should work with children, className
export const App = () => (
  <TextColor color="red" className="my-class">
    Hello World
  </TextColor>
);

const styles = stylex.create({
  textColorColor: (color: string) => ({
    color,
  }),
});
