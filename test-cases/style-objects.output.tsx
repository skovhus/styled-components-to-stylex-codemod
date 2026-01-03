import * as stylex from "@stylexjs/stylex";

const styles = stylex.create({
  staticBox: {
    backgroundColor: "#BF4F74",
    height: "50px",
    width: "50px",
    borderRadius: "4px",
  },
  dynamicBox: {
    borderRadius: "4px",
  },
});

export const App = () => (
  <div>
    <div {...stylex.props(styles.staticBox)} />
    <div $background="mediumseagreen" $size="100px" {...stylex.props(styles.dynamicBox)} />
  </div>
);
