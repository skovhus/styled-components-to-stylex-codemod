import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { Text } from "./lib/text";

export const App = () => (
  <div sx={styles.notice}>
    <Text variant="small" {...stylex.props(styles.title)}>
      Imported custom root
    </Text>
  </div>
);

const styles = stylex.create({
  notice: {
    padding: 8,
    backgroundColor: "#eef2ff",
  },
  title: {
    color: "#1d4ed8",
    fontWeight: 600,
  },
});
