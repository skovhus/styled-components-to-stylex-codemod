import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";

type Props = { enabled?: boolean };

type StatusBadgeProps = React.PropsWithChildren<Props>;

function StatusBadge(props: StatusBadgeProps) {
  const { children, enabled } = props;

  return (
    <div {...stylex.props(styles.statusBadge, enabled ? styles.statusBadgeEnabled : undefined)}>
      {children}
    </div>
  );
}

export const App = () => (
  <div style={{ display: "flex", gap: 16, padding: 16 }}>
    <StatusBadge enabled>On</StatusBadge>
    <StatusBadge enabled={false}>Off</StatusBadge>
    <StatusBadge>Default</StatusBadge>
  </div>
);

const styles = stylex.create({
  statusBadge: {
    backgroundColor: $colors.labelMuted,
    color: "white",
    width: "80px",
    height: "80px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "50%",
    fontSize: "12px",
    fontWeight: "bold",
  },
  statusBadgeEnabled: {
    backgroundColor: $colors.greenBase,
  },
});
