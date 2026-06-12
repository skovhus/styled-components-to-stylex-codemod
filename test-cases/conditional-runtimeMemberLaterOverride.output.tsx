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

export const App = () => <Box>Later margin-top wins</Box>;

const styles = stylex.create({
  box: {
    marginRight: 12,
    marginLeft: 12,
    marginBottom: 8,
    marginTop: 0,
    backgroundColor: "peachpuff",
  },
  boxBrowserIsTouchDevice: {
    marginRight: 12,
    marginLeft: 12,
    marginBottom: 4,
  },
});
