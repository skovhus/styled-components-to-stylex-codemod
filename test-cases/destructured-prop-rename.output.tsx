import * as stylex from "@stylexjs/stylex";

export const App = () => <button {...stylex.props(styles.buttonColor("red"))}>Click</button>;

const styles = stylex.create({
  buttonColor: (color: string) => ({
    color,
  }),
});
