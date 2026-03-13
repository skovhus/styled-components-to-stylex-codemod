import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type ButtonProps = React.PropsWithChildren<{
  color?: string;
}>;

// Simple renamed destructured prop with static base style
function Button(props: ButtonProps) {
  const { children, color } = props;

  return (
    <button
      sx={styles.button({
        color: props.color || "hotpink",
      })}
    >
      {children}
    </button>
  );
}

type CardProps = React.PropsWithChildren<{
  padding?: string;
}>;

// Destructured prop with default value
function Card(props: CardProps) {
  const { children, padding } = props;

  return (
    <div
      sx={[
        styles.card,
        padding != null &&
          styles.cardPadding({
            padding: padding,
          }),
      ]}
    >
      {children}
    </div>
  );
}

type BoxProps = React.PropsWithChildren<{
  margin?: string;
}>;

// Renamed destructured prop with default value
function Box(props: BoxProps) {
  const { children, margin } = props;

  return (
    <div
      sx={[
        styles.box,
        margin != null &&
          styles.boxMargin({
            margin: margin,
          }),
      ]}
    >
      {children}
    </div>
  );
}

export const App = () => (
  <>
    <Button color="red">Click</Button>
    <Button>Click (default)</Button>
    <a
      href="#"
      sx={styles.linkFontSize({
        fontSize: "14px",
      })}
    >
      Link
    </a>
    <Card>Card</Card>
    <Card padding="24px">Card with padding</Card>
    <Box>Box</Box>
    <Box margin="12px">Box with margin</Box>
    <span
      sx={[
        styles.textFontWeight({
          fontWeight: "bold",
        }),
        styles.textFontSize({
          fontSize: "16px",
        }),
      ]}
    >
      Text
    </span>
  </>
);

const styles = stylex.create({
  button: (props: { color: string | undefined }) => ({
    height: 100,
    color: props.color,
  }),
  linkFontSize: (props: { fontSize: string }) => ({
    fontSize: props.fontSize,
  }),
  card: {
    padding: "16px",
  },
  cardPadding: (props: { padding: string }) => ({
    padding: props.padding,
  }),
  box: {
    margin: "8px",
  },
  boxMargin: (props: { margin: string }) => ({
    margin: props.margin,
  }),
  textFontWeight: (props: { fontWeight: string }) => ({
    fontWeight: props.fontWeight,
  }),
  textFontSize: (props: { fontSize: string }) => ({
    fontSize: props.fontSize,
  }),
});
