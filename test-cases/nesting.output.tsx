import * as stylex from "@stylexjs/stylex";

const styles = stylex.create({
  equalDivider: {
    display: "flex",
    margin: "0.5rem",
    padding: "1rem",
    backgroundColor: "papayawhip",
    flex: 1,
    marginLeft: "1rem",
  },
});

export const App = () => (
  <div {...stylex.props(styles.equalDivider)}>
    <div>First</div>
    <div>Second</div>
    <div>Third</div>
  </div>
);
