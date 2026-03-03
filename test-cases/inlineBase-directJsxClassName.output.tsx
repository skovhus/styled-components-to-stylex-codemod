import * as stylex from "@stylexjs/stylex";
import { Flex } from "./lib/inline-base-flex";

export function App() {
  return (
    <div {...stylex.props(styles.wrapper)}>
      <Flex column gap={8} className="u-margin">
        With className
      </Flex>
      <Flex column gap={16} style={{ color: "red" }}>
        With style
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
