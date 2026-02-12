import React from "react";
import * as stylex from "@stylexjs/stylex";

function StyleBox(props) {
  const { children, appearance } = props;

  return <div {...stylex.props(styles.styleBox, appearanceVariants[appearance])}>{children}</div>;
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
    backgroundImage: "none",
    width: "30px",
    margin: "10px",
    height: "50px",
  },
});

const appearanceVariants = stylex.create({
  small: {
    height: "10px",
  },
  medium: {
    height: "10px",
  },
  large: {
    height: "20px",
  },
  xlarge: {
    height: "20px",
  },
});
