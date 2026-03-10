// Dynamic consumed prop expressions should be resolved, not left as raw JSX attributes
import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { Flex } from "./lib/inline-base-flex";

export function App({ isCompact }: { isCompact: boolean }) {
  return (
    <div sx={styles.wrapper}>
      <Flex column grow={1} align={isCompact ? "start" : "center"} gap={isCompact ? 8 : 16}>
        Content
      </Flex>
    </div>
  );
}

const styles = stylex.create({
  wrapper: {
    padding: "16px",
    backgroundColor: "#f0f5ff",
  },
});
