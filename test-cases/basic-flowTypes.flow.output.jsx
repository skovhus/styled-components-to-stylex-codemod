import * as stylex from "@stylexjs/stylex";

export function Button(props) {
  const { children, ...rest } = props;

  return (
    <button {...rest} {...stylex.props(styles.button)}>
      {children}
    </button>
  );
}

export const App = () => (
  <div>
    <Button>Click me</Button>
    <div {...stylex.props(styles.card)}>Card content</div>
  </div>
);

const styles = stylex.create({
  button: {
    backgroundColor: "#bf4f74",
    backgroundImage: "none",
    color: "white",
    paddingBlock: "8px",
    paddingInline: "16px",
    borderWidth: 0,
    borderStyle: "none",
    borderColor: "currentcolor",
    borderRadius: "4px",
  },
  card: {
    padding: "16px",
    backgroundColor: "white",
    backgroundImage: "none",
    borderRadius: "8px",
  },
});
