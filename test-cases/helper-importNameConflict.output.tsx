import React from "react";
import * as stylex from "@stylexjs/stylex";
import { transitionSpeed as transitionSpeedVars } from "./tokens.stylex";
import { transitionSpeed } from "./lib/helpers";

const speedLabel = transitionSpeed("fast");

export const App = () => (
  <div>
    <div>{speedLabel}</div>
    <div sx={styles.box} />
  </div>
);

const styles = stylex.create({
  box: {
    transition: `color ${transitionSpeedVars.normal}`,
  },
});
