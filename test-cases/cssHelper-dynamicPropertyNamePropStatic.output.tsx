// Prop-based conditional with dynamic property-name split and static branch values
import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

type StripProps = {
  enabled?: boolean;
  column?: boolean;
  className?: string;
  children?: React.ReactNode;
};

export function Strip(props: StripProps & Omit<React.ComponentProps<"div">, "className">) {
  const { children, style, enabled, column, ...rest } = props;

  return (
    <div
      {...rest}
      {...mergedSx(
        [
          styles.strip,
          enabled && column ? styles.stripEnabledColumn : undefined,
          enabled && !column ? styles.stripEnabledNotColumn : undefined,
        ],
        undefined,
        style,
      )}
    >
      {children}
    </div>
  );
}

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 12 }}>
    <Strip enabled style={{ background: "#e6f8e0", padding: 8 }}>
      <div style={{ background: "#6abf69", color: "white", padding: 8 }}>Enabled row gap</div>
      <div style={{ background: "#6abf69", color: "white", padding: 8 }}>Enabled row gap</div>
    </Strip>
    <Strip enabled column style={{ background: "#fbe7ff", padding: 8 }}>
      <div style={{ background: "#ba68c8", color: "white", padding: 8 }}>Enabled column gap</div>
      <div style={{ background: "#ba68c8", color: "white", padding: 8 }}>Enabled column gap</div>
    </Strip>
    <Strip style={{ background: "#f1f1f1", padding: 8 }}>
      <div style={{ background: "#9e9e9e", color: "white", padding: 8 }}>Disabled</div>
      <div style={{ background: "#9e9e9e", color: "white", padding: 8 }}>Disabled</div>
    </Strip>
  </div>
);

const styles = stylex.create({
  strip: {
    display: "flex",
  },
  stripEnabledColumn: {
    columnGap: "16px",
  },
  stripEnabledNotColumn: {
    rowGap: "16px",
  },
});
