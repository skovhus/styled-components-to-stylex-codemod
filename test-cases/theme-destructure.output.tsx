import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";

type Props = { enabled?: boolean };

function StatusBadge(props: React.PropsWithChildren<Props>) {
  const { children, enabled } = props;

  return (
    <div sx={[styles.statusBadge, enabled ? styles.statusBadgeEnabled : undefined]}>{children}</div>
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
    width: 80,
    height: 80,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "50%",
    fontSize: 12,
    fontWeight: "bold",
  },
  statusBadgeEnabled: {
    backgroundColor: $colors.greenBase,
  },
});
