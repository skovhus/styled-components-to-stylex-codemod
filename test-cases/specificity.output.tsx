import React from "react";
import * as stylex from "@stylexjs/stylex";

const styles = stylex.create({
  thing: {
    color: "blue",
  },
  overrideStyles: {
    backgroundColor: "papayawhip",
  },
});

const Thing = ({ children }: { children: React.ReactNode }) => (
  <div {...stylex.props(styles.thing)}>{children}</div>
);

const OverrideStyles = ({ children }: { children: React.ReactNode }) => (
  <div {...stylex.props(styles.overrideStyles)}>{children}</div>
);

export const App = () => (
  <div className="wrapper">
    <Thing>High specificity text (blue due to &&&)</Thing>
    <OverrideStyles>Context override (papayawhip background)</OverrideStyles>
  </div>
);
