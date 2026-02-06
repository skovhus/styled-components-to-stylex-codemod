import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";

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
