import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div {...stylex.props(styles.container)}>
    <h2 {...stylex.props(styles.title)}>Responsive Media Queries</h2>
    <div {...stylex.props(styles.grid)}>
      <div {...stylex.props(styles.card)}>
        <h3 {...stylex.props(styles.cardTitle)}>Card One</h3>
        <p {...stylex.props(styles.cardText)}>
          Resize the window to see the layout change from 1 to 2 to 3 columns.
        </p>
      </div>
      <div {...stylex.props(styles.card)}>
        <h3 {...stylex.props(styles.cardTitle)}>Card Two</h3>
        <p {...stylex.props(styles.cardText)}>
          The background color also changes at different breakpoints.
        </p>
      </div>
      <div {...stylex.props(styles.card)}>
        <h3 {...stylex.props(styles.cardTitle)}>Card Three</h3>
        <p {...stylex.props(styles.cardText)}>
          Hover over cards to see the hover effect (on devices that support it).
        </p>
      </div>
    </div>
    <button {...stylex.props(styles.button)}>Interactive Button</button>
  </div>
);

const styles = stylex.create({
  container: {
    width: {
      default: "100%",
      "@media (min-width: 768px)": "750px",
      "@media (min-width: 1024px)": "960px",
    },
    padding: {
      default: "1.5rem",
      "@media (min-width: 768px)": "2rem",
      "@media (min-width: 1024px)": "2.5rem",
    },
    backgroundImage: {
      default: "linear-gradient(135deg, #ffe4b5 0%, #ffd699 100%)",
      "@media (min-width: 768px)": "linear-gradient(135deg, #98fb98 0%, #90ee90 100%)",
      "@media (min-width: 1024px)": "linear-gradient(135deg, #87ceeb 0%, #add8e6 100%)",
    },
    borderRadius: "12px",
    boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",

    marginBlock: {
      default: null,
      "@media (min-width: 768px)": 0,
    },
    marginInline: {
      default: null,
      "@media (min-width: 768px)": "auto",
    },
  },
  title: {
    marginTop: 0,
    marginRight: 0,
    marginBottom: "1rem",
    marginLeft: 0,

    fontSize: {
      default: "1.5rem",
      "@media (min-width: 768px)": "2rem",
      "@media (min-width: 1024px)": "2.5rem",
    },
    color: "#333",
  },
  grid: {
    display: "grid",

    gridTemplateColumns: {
      default: "1fr",
      "@media (min-width: 768px)": "repeat(2, 1fr)",
      "@media (min-width: 1024px)": "repeat(3, 1fr)",
    },
    gap: {
      default: "1rem",
      "@media (min-width: 768px)": "1.5rem",
      "@media (min-width: 1024px)": "2rem",
    },
  },
  card: {
    padding: "1rem",
    backgroundColor: "white",
    borderRadius: "8px",

    boxShadow: {
      default: "0 2px 4px rgba(0, 0, 0, 0.1)",

      ":hover": {
        default: null,
        "@media (hover: hover)": "0 8px 16px rgba(0, 0, 0, 0.15)",
      },
    },
    transition: "transform 0.2s ease,box-shadow 0.2s ease",

    transform: {
      default: null,

      ":hover": {
        default: null,
        "@media (hover: hover)": "translateY(-4px)",
      },
    },
  },
  cardTitle: {
    marginTop: 0,
    marginRight: 0,
    marginBottom: "0.5rem",
    marginLeft: 0,
    fontSize: "1rem",
    color: "#555",
  },
  cardText: {
    margin: 0,
    fontSize: "0.875rem",
    color: "#777",
    lineHeight: 1.5,
  },
  button: {
    display: "block",

    width: {
      default: "100%",
      "@media (min-width: 768px)": "auto",
    },
    marginTop: "1.5rem",
    paddingBlock: "12px",
    paddingInline: "24px",
    backgroundImage: "linear-gradient(135deg, #4169e1 0%, #6495ed 100%)",
    borderWidth: 0,
    borderRadius: "8px",
    cursor: "pointer",
    color: "white",
    fontSize: "1rem",
    fontWeight: 600,
    transition: "transform 0.2s ease,box-shadow 0.2s ease",

    transform: {
      default: null,

      ":hover": {
        default: null,
        "@media (hover: hover)": "scale(1.05)",
      },
      ":active": "scale(0.95)",
    },
    boxShadow: {
      default: null,

      ":hover": {
        default: null,
        "@media (hover: hover)": "0 4px 12px rgba(65, 105, 225, 0.4)",
      },
    },
  },
});
