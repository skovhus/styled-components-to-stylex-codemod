import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type TooltipProps = React.PropsWithChildren<{
  $open?: boolean;
}>;

// Support negated boolean conditions in ternary CSS blocks.
// Pattern: !props.$prop ? "css;" : ""

export function Tooltip(props: TooltipProps) {
  const { children, $open, ...rest } = props;

  return (
    <div {...rest} {...stylex.props(styles.tooltip, !$open && styles.tooltipNotOpen)}>
      {children}
    </div>
  );
}

type OverlayProps = React.PropsWithChildren<{
  $visible?: boolean;
}>;

// Pattern: !props.$prop ? "cssA;" : "cssB;" (both branches have styles)
export function Overlay(props: OverlayProps) {
  const { children, $visible, ...rest } = props;

  return (
    <div {...rest} {...stylex.props(styles.overlay, $visible ? styles.overlayVisible : undefined)}>
      {children}
    </div>
  );
}

export const App = () => (
  <div>
    <Tooltip $open>Visible tooltip</Tooltip>
    <Tooltip $open={false}>Hidden tooltip</Tooltip>
    <Tooltip>Default hidden tooltip</Tooltip>
    <Overlay $visible>Visible overlay</Overlay>
    <Overlay $visible={false}>Hidden overlay</Overlay>
  </div>
);

const styles = stylex.create({
  tooltip: {},
  tooltipNotOpen: {
    pointerEvents: "none",
    opacity: 0.1,
  },
  overlay: {
    position: "fixed",
    inset: 0,
    opacity: 0,
  },
  overlayVisible: {
    opacity: 1,
  },
});
