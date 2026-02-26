import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "16px" }}>
    <button {...stylex.props(styles.button)}>Enabled</button>
    <button disabled {...stylex.props(styles.button)}>
      Disabled
    </button>
    <select {...stylex.props(styles.select)}>
      <option>Enabled</option>
    </select>
    <select disabled {...stylex.props(styles.select)}>
      <option>Disabled</option>
    </select>
    <textarea defaultValue="Enabled" {...stylex.props(styles.textarea)} />
    <textarea disabled defaultValue="Disabled" {...stylex.props(styles.textarea)} />
  </div>
);

const styles = stylex.create({
  button: {
    paddingBlock: "8px",
    paddingInline: "16px",
    backgroundColor: {
      default: "#bf4f74",
      ":is([disabled])": "#ccc",
    },
    color: {
      default: "white",
      ":is([disabled])": "#666",
    },
    borderWidth: 0,
    borderStyle: "none",
    borderRadius: "4px",
    cursor: {
      default: "pointer",
      ":is([disabled])": "not-allowed",
    },
  },
  select: {
    padding: "8px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#ccc",
    borderRadius: "4px",
    backgroundColor: {
      default: null,
      ":is([disabled])": "#f5f5f5",
    },
    color: {
      default: null,
      ":is([disabled])": "#999",
    },
  },
  textarea: {
    padding: "8px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#ccc",
    borderRadius: "4px",
    backgroundColor: {
      default: null,
      ":is([disabled])": "#f5f5f5",
    },
    color: {
      default: null,
      ":is([disabled])": "#999",
    },
  },
});
