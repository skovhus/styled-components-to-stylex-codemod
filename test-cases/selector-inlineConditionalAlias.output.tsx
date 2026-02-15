import React from "react";
import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";
import { Browser } from "./lib/helpers";

function Badge(props: React.PropsWithChildren<{ ref?: React.Ref<HTMLDivElement> }>) {
  const { children } = props;

  return (
    <div
      {...stylex.props(
        styles.badge,
        (Browser.isSafari ? "active" : "hover") === "active"
          ? styles.badgePseudoAliasR2Active
          : (Browser.isSafari ? "active" : "hover") === "hover"
            ? styles.badgePseudoAliasR2Hover
            : undefined,
      )}
    >
      {children}
    </div>
  );
}

export const App = () => (
  <div style={{ display: "flex", gap: 12, padding: 16 }}>
    <Badge>Inline Conditional Alias</Badge>
  </div>
);

const styles = stylex.create({
  badge: {
    backgroundColor: "#f4f4f4",
    color: "#111",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#999",
    paddingBlock: "10px",
    paddingInline: "14px",
    borderRadius: "6px",
    display: "inline-block",
  },
  badgePseudoAliasR2Active: {
    backgroundColor: {
      default: "#f4f4f4",
      ":active": $colors.bgBorderFaint,
    },
    color: {
      default: "#111",
      ":active": "#003a8c",
    },
    borderColor: {
      default: "#999",
      ":active": "#003a8c",
    },
  },
  badgePseudoAliasR2Hover: {
    backgroundColor: {
      default: "#f4f4f4",
      ":hover": $colors.bgBorderFaint,
    },
    color: {
      default: "#111",
      ":hover": "#003a8c",
    },
    borderColor: {
      default: "#999",
      ":hover": "#003a8c",
    },
  },
});
