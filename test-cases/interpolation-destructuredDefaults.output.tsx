import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type ButtonProps = { color?: string } & Omit<
  React.ComponentProps<"button">,
  "className" | "style" | "sx"
>;

// Destructured prop with default AND || fallback
// When color is undefined, should use "hotpink" (default)
// When color is falsy but defined (e.g., ""), should use "blue" (|| fallback)
function Button(props: ButtonProps) {
  const { children, color } = props;
  return <button sx={styles.button((props.color ?? "hotpink") || "blue")}>{children}</button>;
}

type CardProps = { size?: number } & Omit<
  React.ComponentProps<"div">,
  "className" | "style" | "sx"
>;

// Destructured prop with ternary using default
// When size is undefined, should use 16 (default), then check if it equals 16
function Card(props: CardProps) {
  return (
    <div
      {...props}
      style={{
        padding: (props.size ?? 16) === 16 ? "1rem" : `${props.size ?? 16}px`,
      }}
    />
  );
}

type BoxProps = { margin?: number } & Omit<
  React.ComponentProps<"div">,
  "className" | "style" | "sx"
>;

// Renamed destructured prop with default AND fallback
function Box(props: BoxProps) {
  return (
    <div
      {...props}
      style={{
        margin: (props.margin ?? 10) || 5,
      }}
    />
  );
}

export const App = () => (
  <>
    <Button>Default (should be hotpink)</Button>
    <Button color="">Empty string (should be blue)</Button>
    <Button color="red">Red</Button>
    <Card>Default size (should be 1rem)</Card>
    <Card size={16}>Size 16 (should be 1rem)</Card>
    <Card size={24}>Size 24 (should be 24px)</Card>
    <Box>Default (should be 10px)</Box>
    <Box margin={0}>Zero (should be 5px)</Box>
    <Box margin={20}>20px</Box>
  </>
);

const styles = stylex.create({
  button: (color: string | undefined) => ({
    color,
  }),
});
