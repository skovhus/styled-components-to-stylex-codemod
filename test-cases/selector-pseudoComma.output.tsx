import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div>
    <button {...stylex.props(styles.button)}>Hover or Focus Me</button>
    <a href="#" {...stylex.props(styles.link)}>
      Link
    </a>
    <input placeholder="Type here..." {...stylex.props(styles.input)} />
  </div>
);

const styles = stylex.create({
  // Comma-separated pseudo-class selectors
  button: {
    paddingBlock: "8px",
    paddingInline: "16px",
    backgroundColor: {
      default: "white",
      ":hover": "#bf4f74",
      ":focus": "#bf4f74",
    },
    backgroundImage: {
      default: "none",
      ":hover": "none",
      ":focus": "none",
    },
    color: {
      default: "#333",
      ":hover": "white",
      ":focus": "white",
    },
    borderWidth: "2px",
    borderStyle: "solid",
    borderColor: {
      default: "#ccc",
      ":hover": "#bf4f74",
      ":focus": "#bf4f74",
    },
    borderRadius: "4px",
    cursor: "pointer",
    outline: {
      default: null,
      ":active": "2px solid #4f74bf",
      ":focus-visible": "2px solid #4f74bf",
    },
    outlineOffset: {
      default: null,
      ":active": "2px",
      ":focus-visible": "2px",
    },
  },
  // Three pseudo-selectors combined
  link: {
    color: {
      default: "#333",
      ":hover": "#bf4f74",
      ":focus": "#bf4f74",
      ":active": "#bf4f74",
    },
    textDecoration: {
      default: "none",
      ":hover": "underline",
      ":focus": "underline",
      ":active": "underline",
    },
  },
  // Mixed with regular styles
  input: {
    paddingBlock: "8px",
    paddingInline: "12px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: {
      default: "#ccc",
      ":hover": "#bf4f74",
      ":focus": "#bf4f74",
    },
    borderRadius: "4px",
    "::placeholder": {
      color: "#999",
    },
  },
});
