import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div style={{ padding: 16, background: "#111" }}>
    <div {...stylex.props(styles.card)}>Gradient Card</div>
  </div>
);

const styles = stylex.create({
  // Multiline gradient formatting should normalize to a compact backgroundImage value
  // prettier-ignore
  card: {
    backgroundImage: "linear-gradient(to right, transparent, black 80%, hotpink)",
    color: "white",
    padding: "12px",
  },
});
