import * as React from "react";
import * as stylex from "@stylexjs/stylex";

const color1 = "#ff0000";
const color2 = "#0000ff";
const color3 = "#00ff00";

type PopoverProps = React.PropsWithChildren<{
  $expanded: boolean;
}>;

// Multiple interpolations in a transform value
// Should produce a single template literal preserving all transform functions
function Popover(props: PopoverProps) {
  const { children, $expanded } = props;

  return (
    <div sx={[styles.popover, $expanded ? styles.popoverExpanded : undefined]}>{children}</div>
  );
}

export const App = () => (
  <>
    <div sx={styles.linearGradientBox}>Linear</div>
    <div sx={styles.radialGradientBox}>Radial</div>
    <div sx={styles.conicGradientBox}>Conic</div>
    <div sx={styles.repeatingLinearGradientBox}>Repeating</div>
    <Popover $expanded={true}>Expanded</Popover>
    <Popover $expanded={false}>Collapsed</Popover>
  </>
);

const styles = stylex.create({
  linearGradientBox: {
    backgroundImage: `linear-gradient(${color1}, ${color2})`,
    width: "200px",
    height: "100px",
  },
  radialGradientBox: {
    backgroundImage: `radial-gradient(${color1}, ${color2})`,
    width: "200px",
    height: "100px",
  },
  conicGradientBox: {
    backgroundImage: `conic-gradient(${color1}, ${color2}, ${color3})`,
    width: "200px",
    height: "100px",
  },
  repeatingLinearGradientBox: {
    backgroundImage: `repeating-linear-gradient(${color1} 0%, ${color2} 10%)`,
    width: "200px",
    height: "100px",
  },
  popover: {
    transform: "translateY(-50%) translateX(-8px) scale(0.9)",
    opacity: 0,
  },
  popoverExpanded: {
    transform: "translateY(-50%) translateX(0) scale(1)",
    opacity: 1,
  },
});
