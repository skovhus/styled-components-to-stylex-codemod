import * as stylex from "@stylexjs/stylex";
import isPropValid from "@emotion/is-prop-valid";

const styles = stylex.create({
  button: {
    padding: "8px 16px",
    fontSize: "14px",
    color: "white",
    borderWidth: 0,
    borderStyle: "none",
    borderRadius: "4px",
  },
  buttonColor: {
    backgroundColor: "#BF4F74",
  },
  buttonSize: {
    padding: "12px 24px",
    fontSize: "18px",
  },
  link: {
    color: "#333",
    fontWeight: "normal",
    textDecoration: "none",
  },
  linkActive: {
    color: "#BF4F74",
    fontWeight: "bold",
  },
  box: {
    borderRadius: "8px",
    boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
  },
  boxBackground: {
    backgroundColor: "white",
  },
  boxPadding: {
    padding: "16px",
  },
  card: {
    backgroundColor: "#4F74BF",
    borderRadius: "4px",
    padding: "16px",
    color: "white",
  },
  cardVariant: {
    backgroundColor: "#BF4F74",
  },
  cardRounded: {
    borderRadius: "16px",
  },
});

export const App = () => (
  <div>
    <button {...stylex.props(styles.button)}>Large Green Button</button>
    <button {...stylex.props(styles.button)}>Default Button</button>
    <br />
    <a href="#" isActive {...stylex.props(styles.link)}>
      Active Link
    </a>
    <a href="#" {...stylex.props(styles.link)}>
      Normal Link
    </a>
    <br />
    <div {...stylex.props(styles.box)}>Box with transient-like props</div>
    <div elevation={3} {...stylex.props(styles.card, styles.cardRounded)}>
      Elevated Card
    </div>
  </div>
);
