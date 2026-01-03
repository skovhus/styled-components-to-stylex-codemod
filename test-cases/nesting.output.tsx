import * as stylex from "@stylexjs/stylex";

const styles = stylex.create({
  equalDivider: {
    display: "flex",
    margin: "0.5rem",
    padding: "1rem",
    backgroundColor: "papayawhip",
  },
  equalDividerChild: {
    flex: 1,
  },
  equalDividerChildNotFirst: {
    marginLeft: "1rem",
  },
});

export const App = () => (
  <div {...stylex.props(styles.equalDivider)}>
    <div {...stylex.props(styles.equalDividerChild)}>First</div>
    <div {...stylex.props(styles.equalDividerChild, styles.equalDividerChildNotFirst)}>Second</div>
    <div {...stylex.props(styles.equalDividerChild, styles.equalDividerChildNotFirst)}>Third</div>
  </div>
);
