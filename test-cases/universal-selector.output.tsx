import * as stylex from "@stylexjs/stylex";

const styles = stylex.create({
  resetBox: {
    boxSizing: "border-box",
    margin: 0,
    padding: 0,
  },
  container: {
    display: "flex",
    gap: "16px",
    flex: 1,
    minWidth: 0,
  },
  list: {
    listStyle: "none",
    padding: 0,
    marginBottom: "8px",
    fontWeight: "bold",
  },
  hoverContainer: {
    color: "#BF4F74",
  },
  deepReset: {
    fontFamily: "inherit",
    fontSize: "inherit",
  },
});

export const App = () => (
  <div>
    <div {...stylex.props(styles.resetBox)}>
      <p>Paragraph</p>
      <span>Span</span>
    </div>
    <div {...stylex.props(styles.container)}>
      <div>Item 1</div>
      <div>Item 2</div>
      <div>Item 3</div>
    </div>
    <ul {...stylex.props(styles.list)}>
      <li>First (bold)</li>
      <li>Second</li>
      <li>Third</li>
    </ul>
    <div {...stylex.props(styles.hoverContainer)}>
      <span>Hover parent to change color</span>
    </div>
    <div {...stylex.props(styles.deepReset)}>
      <div>
        <span>Deep nested</span>
      </div>
    </div>
  </div>
);
