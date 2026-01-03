import * as stylex from "@stylexjs/stylex";

const styles = stylex.create({
  resetBox: {},
  resetBoxChild: {
    boxSizing: "border-box",
    margin: 0,
    padding: 0,
  },
  container: {
    display: "flex",
    gap: "16px",
  },
  containerChild: {
    flex: 1,
    minWidth: 0,
  },
  list: {
    listStyle: "none",
    padding: 0,
  },
  listChildNotLast: {
    marginBottom: "8px",
  },
  listChildFirst: {
    fontWeight: "bold",
  },
  hoverContainer: {
    "--sc2sx-hoverContainer-color": {
      default: "inherit",
      ":hover": "#BF4F74",
    },
  },
  hoverContainerChild: {
    color: "var(--sc2sx-hoverContainer-color)",
  },
  deepReset: {},
  deepResetChild: {
    fontFamily: "inherit",
  },
  deepResetGrandchild: {
    fontSize: "inherit",
  },
});

export const App = () => (
  <div>
    <div {...stylex.props(styles.resetBox)}>
      <p {...stylex.props(styles.resetBoxChild)}>Paragraph</p>
      <span {...stylex.props(styles.resetBoxChild)}>Span</span>
    </div>
    <div {...stylex.props(styles.container)}>
      <div {...stylex.props(styles.containerChild)}>Item 1</div>
      <div {...stylex.props(styles.containerChild)}>Item 2</div>
      <div {...stylex.props(styles.containerChild)}>Item 3</div>
    </div>
    <ul {...stylex.props(styles.list)}>
      <li {...stylex.props(styles.listChildNotLast, styles.listChildFirst)}>First (bold)</li>
      <li {...stylex.props(styles.listChildNotLast)}>Second</li>
      <li>Third</li>
    </ul>
    <div {...stylex.props(styles.hoverContainer)}>
      <span {...stylex.props(styles.hoverContainerChild)}>Hover parent to change color</span>
    </div>
    <div {...stylex.props(styles.deepReset)}>
      <div {...stylex.props(styles.deepResetChild)}>
        <span>Deep nested</span>
      </div>
    </div>
  </div>
);
