import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";

// Bug: The destructured `theme` from `${({ enabled, theme }) => ...}` is converted to
// `props.theme.color.greenBase` but `theme` doesn't exist on the component's props type.
// The theme reference should be resolved via the adapter. Causes TS2339.

type Props = { enabled?: boolean };

type StatusIconProps = React.PropsWithChildren<Props>;

function StatusIcon(props: StatusIconProps) {
  const { children, enabled } = props;

  return (
    <div {...stylex.props(styles.statusIcon, enabled ? styles.statusIconEnabled : undefined)}>
      {children}
    </div>
  );
}

export const App = () => (
  <div style={{ display: "flex", gap: 8 }}>
    <StatusIcon enabled />
    <StatusIcon enabled={false} />
    <StatusIcon />
  </div>
);

const styles = stylex.create({
  statusIcon: {
    fill: $colors.labelMuted,
    width: "6px",
    height: "6px",
  },
  statusIconEnabled: {
    fill: $colors.greenBase,
  },
});
