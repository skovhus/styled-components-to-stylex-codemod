import * as stylex from "@stylexjs/stylex";
import { Flex } from "./lib/flex";

export const App = () => (
  <div style={{ display: "flex", gap: 16, padding: 16 }}>
    <Flex
      gap={8}
      {...stylex.props(styles.box, styles.boxBackgroundColor("#bf4f74"), styles.boxColor("white"))}
    >
      Red
    </Flex>
    <Flex
      gap={12}
      {...stylex.props(styles.box, styles.boxBackgroundColor("#4f74bf"), styles.boxColor("black"))}
    >
      Blue
    </Flex>
  </div>
);

const styles = stylex.create({
  box: {
    padding: "8px",
  },
  boxBackgroundColor: (backgroundColor: string) => ({
    backgroundColor,
  }),
  boxColor: (color: string) => ({
    color,
  }),
});
