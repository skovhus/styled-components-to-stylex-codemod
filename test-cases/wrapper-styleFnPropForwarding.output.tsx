import * as stylex from "@stylexjs/stylex";
import { Flex } from "./lib/flex";

export const App = () => (
  <div style={{ display: "flex", gap: 16, padding: 16 }}>
    <Flex
      gap={8}
      {...stylex.props(
        styles.box,
        styles.boxBackgroundColor({
          backgroundColor: "#bf4f74",
        }),
        styles.boxColor({
          color: "white",
        }),
      )}
    >
      Red
    </Flex>
    <Flex
      gap={12}
      {...stylex.props(
        styles.box,
        styles.boxBackgroundColor({
          backgroundColor: "#4f74bf",
        }),
        styles.boxColor({
          color: "black",
        }),
      )}
    >
      Blue
    </Flex>
  </div>
);

const styles = stylex.create({
  box: {
    padding: 8,
  },
  boxBackgroundColor: (props: { backgroundColor: string }) => ({
    backgroundColor: props.backgroundColor,
  }),
  boxColor: (props: { color: string }) => ({
    color: props.color,
  }),
});
