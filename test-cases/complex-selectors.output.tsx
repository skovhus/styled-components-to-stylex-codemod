import * as stylex from "@stylexjs/stylex";

const styles = stylex.create({
  multiSelector: {
    '&.active,&[aria-selected="true"]': {
      backgroundColor: "#4F74BF",
      color: "white",
    },
    backgroundColor: {
      default: null,
      ":hover,&:focus": "#BF4F74",
    },
    color: {
      default: null,
      ":hover,&:focus": "white",
    },
    outline: {
      default: null,
      ":active,&:focus-visible": "2px solid #4F74BF",
    },
    outlineOffset: {
      default: null,
      ":active,&:focus-visible": "2px",
    },
  },
  compoundSelector: {
    "&.card.highlighted": {
      borderWidth: "2px",
      borderStyle: "solid",
      borderColor: "gold",
    },
    "&.card.error": {
      borderWidth: "2px",
      borderStyle: "solid",
      borderColor: "red",
      backgroundColor: "#fee",
    },
  },
  chainedPseudo: {
    borderColor: {
      default: null,
      ":focus:not(:disabled)": "#BF4F74",
      ":hover:not(:disabled):not(:focus)": "#999",
    },
    backgroundColor: {
      default: null,
      ":checked:not(:disabled)": "#BF4F74",
    },
  },
  complexNested: {
    "& a": {
      color: "#333",
      textDecoration: "none",
    },
    "&.active": {
      fontWeight: "bold",
      color: "#4F74BF",
    },
    color: {
      default: null,
      ":hover,&:focus": "#BF4F74",
    },
  },
  groupDescendant: {
    "& h1,& h2,& h3": {
      marginBottom: "0.5em",
      lineHeight: 1.2,
    },
    "& p,& li": {
      marginBottom: "1em",
      lineHeight: 1.6,
    },
  },
});

export const App = () => (
  <div>
    <button {...stylex.props(styles.multiSelector)}>Multi Selector</button>
    <div className="card highlighted" {...stylex.props(styles.compoundSelector)}>
      Compound
    </div>
    <input type="checkbox" {...stylex.props(styles.chainedPseudo)} />
    <nav {...stylex.props(styles.complexNested)}>
      <a href="#" className="active">
        Active Link
      </a>
      <a href="#">Normal Link</a>
    </nav>
    <div {...stylex.props(styles.groupDescendant)}>
      <h1>Heading</h1>
      <p>Paragraph</p>
    </div>
  </div>
);
