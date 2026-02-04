import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type ButtonProps = Omit<React.ComponentProps<"button">, "className" | "style"> & {
  color?: string;
};

// Destructured prop with default AND || fallback
// When color is undefined, should use "hotpink" (default)
// When color is falsy but defined (e.g., ""), should use "blue" (|| fallback)
function Button(props: ButtonProps) {
  const { children, ...rest } = props;

  return (
    <button
      {...rest}
      style={{
        color: (props.color ?? "hotpink") || "blue",
      }}
    >
      {children}
    </button>
  );
}

type CardProps = Omit<React.ComponentProps<"div">, "className" | "style"> & {
  size?: number;
};

// Destructured prop with ternary using default
// When size is undefined, should use 16 (default), then check if it equals 16
function Card(props: CardProps) {
  const { children, ...rest } = props;

  return (
    <div
      {...rest}
      style={{
        padding: (props.size ?? 16) === 16 ? "1rem" : `${props.size ?? 16}px`,
      }}
    >
      {children}
    </div>
  );
}

type BoxProps = Omit<React.ComponentProps<"div">, "className" | "style"> & {
  margin?: number;
};

// Renamed destructured prop with default AND fallback
function Box(props: BoxProps) {
  const { children, ...rest } = props;

  return (
    <div
      {...rest}
      style={{
        margin: `${(props.margin ?? 10) || 5}px`,
      }}
    >
      {children}
    </div>
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
const styles = stylex.create({});
