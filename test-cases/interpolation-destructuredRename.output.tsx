import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type ButtonProps = React.PropsWithChildren<{
  color?: string;
}>;

// Simple renamed destructured prop with static base style
function Button(props: ButtonProps) {
  const { children, color } = props;

  return (
    <button sx={[styles.button, styles.buttonColor(props.color || "hotpink")]}>{children}</button>
  );
}

type CardProps = React.PropsWithChildren<{
  padding?: string;
}>;

// Destructured prop with default value
function Card(props: CardProps) {
  const { children, padding } = props;

  return <div sx={[styles.card, padding != null && styles.cardPadding(padding)]}>{children}</div>;
}

type BoxProps = React.PropsWithChildren<{
  margin?: string;
}>;

// Renamed destructured prop with default value
function Box(props: BoxProps) {
  const { children, margin } = props;

  return <div sx={[styles.box, margin != null && styles.boxMargin(margin)]}>{children}</div>;
}

export const App = () => (
  <>
    <Button color="red">Click</Button>
    <Button>Click (default)</Button>
    <a href="#" sx={styles.linkFontSize("14px")}>
      Link
    </a>
    <Card>Card</Card>
    <Card padding="24px">Card with padding</Card>
    <Box>Box</Box>
    <Box margin="12px">Box with margin</Box>
    <span sx={[styles.textFontWeight("bold"), styles.textFontSize("16px")]}>Text</span>
  </>
);

const styles = stylex.create({
  button: {
    height: 100,
  },
  buttonColor: (color: string | undefined) => ({
    color,
  }),
  linkFontSize: (fontSize: string) => ({
    fontSize,
  }),
  card: {
    padding: "16px",
  },
  cardPadding: (padding: string) => ({
    padding,
  }),
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
