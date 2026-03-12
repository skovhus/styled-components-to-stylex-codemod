import React from "react";
import * as stylex from "@stylexjs/stylex";

function StyleBox(props) {
  const { children, appearance } = props;

  return <div sx={[styles.styleBox, appearanceVariants[appearance]]}>{children}</div>;
}

export const App = () => (
  <div>
    <StyleBox appearance="normal" />
    <StyleBox appearance="small" />
    <StyleBox appearance="medium" />
    <StyleBox appearance="large" />
    <StyleBox appearance="xlarge" />
  </div>
);

const styles = stylex.create({
  styleBox: {
    backgroundColor: "hotpink",
    width: 30,
    margin: 10,
    height: 50,
  },
});

const appearanceVariants = stylex.create({
  small: {
    height: 10,
  },
  medium: {
    height: 10,
  },
  large: {
    height: 20,
  },
  xlarge: {
    height: 20,
  },
});
