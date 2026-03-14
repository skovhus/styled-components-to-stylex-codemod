// Consumer passes element props (onClick) but no spread - tests P1 fix for ?? vs || operator
import * as React from "react";
import * as stylex from "@stylexjs/stylex";

export function ClickableBox(
  props: Omit<React.ComponentProps<"div">, "className" | "style"> & { sx?: stylex.StyleXStyles },
) {
  const { children, ...rest } = props;
  return (
    <div {...rest} sx={styles.clickableBox}>
      {children}
    </div>
  );
}

export const App = () => (
  <div style={{ display: "flex", gap: 8, padding: 16 }}>
    <ClickableBox onClick={() => alert("clicked")}>Click me</ClickableBox>
  </div>
);

const styles = stylex.create({
  clickableBox: {
    backgroundColor: "lightblue",
    padding: 16,
    cursor: "pointer",
  },
});
