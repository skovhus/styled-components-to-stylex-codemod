// Wrapping a previously-transformed StyleX component should use sx prop
import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { StyleXButton } from "./lib/stylex-button";

export function PrimaryButton(
  props: React.ComponentPropsWithRef<typeof StyleXButton> & {
    className?: string;
    style?: React.CSSProperties;
    sx?: stylex.StyleXStyles;
  },
) {
  const { className, children, style, sx, ...rest } = props;

  return (
    <StyleXButton {...rest} sx={[styles.primaryButton, sx]} className={className} style={style}>
      {children}
    </StyleXButton>
  );
}

export const App = () => (
  <div style={{ display: "flex", gap: 16, padding: 16 }}>
    <PrimaryButton>Primary</PrimaryButton>
    <PrimaryButton disabled>Disabled</PrimaryButton>
  </div>
);

const styles = stylex.create({
  primaryButton: {
    backgroundColor: "blue",
    color: "white",
    fontWeight: "bold",
  },
});
