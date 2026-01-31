import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type ButtonProps = Omit<React.ComponentProps<"button">, "className" | "style"> & {
  color?: string;
};

// Simple renamed destructured prop
function Button(props: ButtonProps) {
  const { children, ...rest } = props;

  const sx = stylex.props();
  return (
    <button
      {...rest}
      {...sx}
      style={{
        ...sx.style,
        color: props.color || "hotpink",
      }}
    >
      {children}
    </button>
  );
}

export const App = () => (
  <>
    <Button color="red">Click</Button>
    <Button>Click (default)</Button>
    <a href="#" {...stylex.props(styles.linkFontSize("14px"))}>
      Link
    </a>
    <div {...stylex.props(styles.card)}>Card</div>
    <div {...stylex.props(styles.card, styles.cardPadding("24px"))}>Card with padding</div>
    <div {...stylex.props(styles.box)}>Box</div>
    <div {...stylex.props(styles.box, styles.boxMargin("12px"))}>Box with margin</div>
    <span {...stylex.props(styles.textFontWeight("bold"), styles.textFontSize("16px"))}>Text</span>
  </>
);

const styles = stylex.create({
  linkFontSize: (fontSize: string) => ({
    fontSize,
  }),

  // Destructured prop with default value
  card: {
    padding: "16px",
  },
  cardPadding: (padding: string) => ({
    padding,
  }),

  // Renamed destructured prop with default value
  box: {
    margin: "8px",
  },
  boxMargin: (margin: string) => ({
    margin,
  }),
  textFontWeight: (fontWeight: string) => ({
    fontWeight,
  }),
  textFontSize: (fontSize: string) => ({
    fontSize,
  }),
});
