import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type TooltipProps = React.PropsWithChildren<{
  $open?: boolean;
}>;

// Support negated boolean conditions in ternary CSS blocks.
// Pattern: !props.$prop ? "css;" : ""

export function Tooltip(props: TooltipProps) {
  const { children, $open } = props;
  return <div {...stylex.props(!$open && styles.tooltipNotOpen)}>{children}</div>;
}

export const App = () => (
  <div>
    <Tooltip $open>Visible tooltip</Tooltip>
    <Tooltip $open={false}>Hidden tooltip</Tooltip>
    <Tooltip>Default hidden tooltip</Tooltip>
  </div>
);

const styles = stylex.create({
  tooltipNotOpen: {
    pointerEvents: "none",
    opacity: 0.1,
  },
});
