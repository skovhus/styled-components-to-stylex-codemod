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
        margin: `${(props.margin ?? 10) || 5}px`,
      }}
    />
  );
}

type PillProps = { rounded?: boolean } & Omit<
  React.ComponentProps<"span">,
  "className" | "style" | "sx"
>;

// Truthy boolean default in a ternary:
// When $rounded is undefined, the default (true) applies → 12px radius
// Only an explicit false should produce 0 radius
function Pill(props: PillProps) {
  const { children, rounded } = props;
  return (
    <span sx={[styles.pill, (rounded === undefined || rounded) && styles.pillRounded]}>
      {children}
    </span>
  );
}

type FrameProps = { framed?: boolean } & Omit<
  React.ComponentProps<"div">,
  "className" | "style" | "sx"
>;

// Truthy boolean default gating a conditional block:
// When $framed is undefined, the default (true) applies → border is shown
function Frame(props: FrameProps) {
  const { children, framed } = props;
  return (
    <div sx={[styles.frame, (framed === undefined || framed) && styles.frameFramed]}>
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
    <Pill>Default (rounded)</Pill>
    <Pill rounded={false}>Square</Pill>
    <Pill rounded>Rounded</Pill>
    <Frame>Default (framed)</Frame>
    <Frame framed={false}>No frame</Frame>
  </>
);

const styles = stylex.create({
  button: (color: string | undefined) => ({
    color,
  }),
  pill: {
    paddingBlock: 4,
    paddingInline: 8,
    backgroundColor: "lightseagreen",
    borderRadius: "0",
  },
  pillRounded: {
    borderRadius: 12,
  },
  frame: {
    padding: 8,
  },
  frameFramed: {
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: "darkslategray",
  },
});
