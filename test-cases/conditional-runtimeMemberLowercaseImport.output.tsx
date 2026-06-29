import React from "react";
import * as stylex from "@stylexjs/stylex";
import { Browser as browser } from "./lib/helpers";

function Box({ children }: { children?: React.ReactNode }) {
  return (
    <div sx={[styles.box, browser.isTouchDevice ? styles.boxBrowserIsTouchDevice : undefined]}>
      {children}
    </div>
  );
}

export const App = () => <Box>Lowercase imported runtime condition</Box>;

const styles = stylex.create({
  box: {
    position: "relative",
    top: 1,
    height: 40,
    backgroundColor: "peachpuff",
  },
  boxBrowserIsTouchDevice: {
    top: 5,
    height: "calc(40px + 8px)",
  },
});
