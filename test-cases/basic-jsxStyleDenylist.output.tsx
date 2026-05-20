import React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

function Card(
  props: React.PropsWithChildren<{
    sx?: stylex.StyleXStyles;
    style?: React.CSSProperties;
  }>,
) {
  const { children, style, sx } = props;
  return <div {...mergedSx([styles.card, sx], undefined, style)}>{children}</div>;
}

export function App() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <Card style={{ color: "white", backgroundColor: "#4f74bf" }}>
        Sibling site is also held back by the denylisted entry below
      </Card>
      <Card style={{ font: "12px/1.4 system-ui", color: "black" }}>
        font shorthand is denylisted
      </Card>
      {/*
        Complex `background` shorthand (color + repeat + position/size) cannot
        be safely decomposed into backgroundColor/backgroundImage longhands.
        Promotion bails so the inline style is preserved verbatim.
      */}
      <div
        {...mergedSx(styles.banner, undefined, {
          background: "red no-repeat center/cover",
          color: "white",
        })}
      >
        Complex background shorthand cannot be promoted
      </div>
    </div>
  );
}

const styles = stylex.create({
  card: {
    padding: 12,
    backgroundColor: "#f0f5ff",
    borderRadius: 6,
  },
  banner: {
    padding: 12,
    backgroundColor: "#ffe0e0",
  },
});
