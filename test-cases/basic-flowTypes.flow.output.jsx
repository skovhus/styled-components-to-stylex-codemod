import * as stylex from "@stylexjs/stylex";

export function Button(props) {
  const { children, ...rest } = props;
  return (
    <button {...rest} sx={styles.button}>
      {children}
    </button>
  );
}

export const App = () => (
  <div>
    <Button>Click me</Button>
    <div sx={styles.card}>Card content</div>
  </div>
);

const styles = stylex.create({
  button: {
    backgroundColor: "#bf4f74",
    color: "white",
    paddingBlock: 8,
    paddingInline: 16,
    borderWidth: 0,
    borderStyle: "none",
    borderColor: "initial",
    borderRadius: 4,
  },
  card: {
    padding: 16,
    backgroundColor: "white",
    borderRadius: 8,
  },
});
