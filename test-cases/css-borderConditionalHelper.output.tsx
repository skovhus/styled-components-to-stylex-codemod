import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { pixelVars } from "./tokens.stylex";

type SimpleBoxProps = React.PropsWithChildren<{
  bordered?: boolean;
}>;

function SimpleBox(props: SimpleBoxProps) {
  const { children, bordered } = props;
  return <div sx={[styles.simpleBox, bordered && styles.simpleBoxBordered]}>{children}</div>;
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
    <SimpleBox bordered>Bordered</SimpleBox>
    <SimpleBox>Not Bordered</SimpleBox>
    <EnumBox position="top">Top</EnumBox>
    <EnumBox position="bottom">Bottom</EnumBox>
    <EnumBox position="free">Free</EnumBox>
  </div>
);

const styles = stylex.create({
  simpleBox: {
    padding: 8,
    borderStyle: "none",
    width: 60,
    height: 30,
  },
  simpleBoxBordered: {
    borderWidth: pixelVars.thin,
    borderStyle: "solid",
    borderColor: "blue",
  },
  enumBox: {
    padding: 8,
    borderStyle: "none",
    width: 60,
    height: 30,
  },
  enumBoxPositionNotFree: {
    borderWidth: pixelVars.thin,
    borderStyle: "solid",
    borderColor: "transparent",
  },
  enumBoxPositionNotTop: {
    borderTopWidth: 0,
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 6,
  },
  enumBoxPositionTop: {
    borderBottomWidth: 0,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
  },
});
