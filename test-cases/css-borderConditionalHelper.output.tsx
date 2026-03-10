import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { pixelVars } from "./tokens.stylex";

type SimpleBoxProps = React.PropsWithChildren<{
  $bordered?: boolean;
}>;

function SimpleBox(props: SimpleBoxProps) {
  const { children, $bordered } = props;

  return (
    <div sx={[styles.simpleBox, $bordered ? styles.simpleBoxBordered : undefined]}>{children}</div>
  );
}

type EnumBoxProps = React.PropsWithChildren<{
  position: "top" | "bottom" | "free";
}>;

function EnumBox(props: EnumBoxProps) {
  const { children, position } = props;

  return (
    <div
      sx={[
        styles.enumBox,
        position !== "free" && styles.enumBoxPositionNotFree,
        position === "top" && styles.enumBoxPositionTop,
        position !== "top" && styles.enumBoxPositionNotTop,
      ]}
    >
      {children}
    </div>
  );
}

export const App = () => (
  <div style={{ display: "flex", gap: "10px", padding: "10px" }}>
    <SimpleBox $bordered>Bordered</SimpleBox>
    <SimpleBox>Not Bordered</SimpleBox>
    <EnumBox position="top">Top</EnumBox>
    <EnumBox position="bottom">Bottom</EnumBox>
    <EnumBox position="free">Free</EnumBox>
  </div>
);

const styles = stylex.create({
  simpleBox: {
    padding: "8px",
    borderStyle: "none",
    width: "60px",
    height: "30px",
  },
  simpleBoxBordered: {
    borderWidth: pixelVars.thin,
    borderStyle: "solid",
    borderColor: "blue",
  },
  enumBox: {
    padding: "8px",
    borderStyle: "none",
    width: "60px",
    height: "30px",
  },
  enumBoxPositionNotFree: {
    borderWidth: pixelVars.thin,
    borderStyle: "solid",
    borderColor: "transparent",
  },
  enumBoxPositionNotTop: {
    borderTopWidth: 0,
    borderBottomLeftRadius: "6px",
    borderBottomRightRadius: "6px",
  },
  enumBoxPositionTop: {
    borderBottomWidth: 0,
    borderTopLeftRadius: "6px",
    borderTopRightRadius: "6px",
  },
});
