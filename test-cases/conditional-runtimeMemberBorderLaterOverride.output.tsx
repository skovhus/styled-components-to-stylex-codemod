import React from "react";
import * as stylex from "@stylexjs/stylex";
import { Browser } from "./lib/helpers";

function Box({ children }: { children?: React.ReactNode }) {
  return (
    <div sx={[styles.box, Browser.isTouchDevice ? styles.boxBrowserIsTouchDevice : undefined]}>
      {children}
    </div>
  );
}

export const App = () => <Box>Later border-top-width wins</Box>;

const styles = stylex.create({
  box: {
    borderStyle: "solid",
    borderColor: "red",
    borderRightWidth: 2,
    borderBottomWidth: 2,
    borderLeftWidth: 2,
    borderTopWidth: 0,
    backgroundColor: "peachpuff",
  },
  boxBrowserIsTouchDevice: {
    borderStyle: "solid",
    borderColor: "red",
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderLeftWidth: 1,
  },
});
