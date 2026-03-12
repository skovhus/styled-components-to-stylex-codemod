import * as stylex from "@stylexjs/stylex";

// Styled component with an interpolated constant that must be declared before styles
const dynamicColor = "#BF4F74";

// Object with method containing JSX - this should NOT be treated as module-level usage
// because the method body executes at runtime, not during module initialization
const viewConfig = {
  render() {
    return <button sx={styles.button}>Click me</button>;
  },
};

export const App = () => viewConfig.render();

const styles = stylex.create({
  button: {
    backgroundColor: dynamicColor,
    padding: 8,
  },
});
