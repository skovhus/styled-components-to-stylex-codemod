import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div column={true} {...stylex.props(styles.list)}>
    <div>Item 1</div>
    <div>Item 2</div>
  </div>
);

const styles = stylex.create({
  list: {
    backgroundColor: "white",
    borderRadius: "4px",
  },
});
