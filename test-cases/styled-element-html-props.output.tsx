import * as React from "react";
import * as stylex from "@stylexjs/stylex";

interface TextColorProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** The color of the text. */
  color: string;
}

/**
 * A text span that sets the color.
 * When exported, should include HTML span props (className, children, style).
 */
export function TextColor(props: TextColorProps) {
  const { className, children, style, color } = props;

  const sx = stylex.props(styles.textColor, styles.textColorColor(color));
  return (
    <span
      {...sx}
      className={[sx.className, className].filter(Boolean).join(" ")}
      style={{
        ...sx.style,
        ...style,
      }}
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
  textColor: {},
  textColorColor: (color: string) => ({
    color,
  }),
});
