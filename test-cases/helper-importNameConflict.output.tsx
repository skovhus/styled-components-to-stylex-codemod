import React from "react";
import * as stylex from "@stylexjs/stylex";
import { transitionSpeed as transitionSpeedVars } from "./tokens.stylex";
import { transitionSpeed } from "./lib/helpers";

const speedLabel = transitionSpeed("fast");

export const App = () => (
  <div>
    <div>{speedLabel}</div>
    <div {...stylex.props(styles.box)} />
  </div>
);

const styles = stylex.create({
  /**
   * Test case for helper name conflicts.
   * The adapter should alias its StyleX import when the helper is used outside styled templates.
   */
  box: {
    transition: `color ${transitionSpeedVars.normal}`,
  },
});
