import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div>
    <button sx={styles.button}>Hover or Focus Me</button>
    <a href="#" sx={styles.link}>
      Link
    </a>
    <input placeholder="Type here..." sx={styles.input} />
  </div>
);

const styles = stylex.create({
  // Comma-separated pseudo-class selectors
  button: {
    paddingBlock: 8,
    paddingInline: 16,
    backgroundColor: {
      default: "white",
      ":hover": "#bf4f74",
      ":focus": "#bf4f74",
    },
    color: {
      default: "#333",
      ":hover": "white",
      ":focus": "white",
    },
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: {
      default: "#ccc",
      ":hover": "#bf4f74",
      ":focus": "#bf4f74",
    },
    borderRadius: 4,
    cursor: "pointer",
    outline: {
      default: null,
      ":active": "2px solid #4f74bf",
      ":focus-visible": "2px solid #4f74bf",
    },
    outlineOffset: {
      default: null,
      // eslint-disable-next-line stylex/valid-styles -- numeric outlineOffset is valid
      ":active": 2,
      // eslint-disable-next-line stylex/valid-styles -- numeric outlineOffset is valid
      ":focus-visible": 2,
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
    paddingBlock: 8,
    paddingInline: 12,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: {
      default: "#ccc",
      ":hover": "#bf4f74",
      ":focus": "#bf4f74",
    },
    borderRadius: 4,
    "::placeholder": {
      color: "#999",
    },
  },
});
