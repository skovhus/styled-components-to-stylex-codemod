import * as stylex from "@stylexjs/stylex";
import { calcVars } from "./css-calc.stylex";

export const App = () => (
  <div {...stylex.props(styles.container)}>
    <div {...stylex.props(styles.grid)}>
      <div {...stylex.props(styles.flexItem)}>Item 1</div>
      <div {...stylex.props(styles.flexItem)}>Item 2</div>
    </div>
    <aside {...stylex.props(styles.sidebar)}>Sidebar content</aside>
    <div {...stylex.props(styles.complexCalc)}>Complex calc</div>
    <div {...stylex.props(styles.withVariables)}>With variables</div>
  </div>
);

const styles = stylex.create({
  container: {
    width: "calc(100% - 40px)",
    maxWidth: "calc(1200px - 2rem)",
    marginBlock: "0",
    marginInline: "auto",
    padding: "calc(16px + 1vw)",
  },
  sidebar: {
    width: "calc(25% - 20px)",
    minWidth: "calc(200px + 2vw)",
    height: "calc(100vh - 60px)",
    padding: "calc(8px * 2)",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, calc(33.333% - 20px))",
    gap: "calc(10px + 0.5vw)",
  },
  flexItem: {
    flex: "0 0 calc(50% - 1rem)",
    padding: "calc(1rem / 2)",
  },

  // Nested calc
  complexCalc: {
    width: "calc(100% - calc(20px + 2rem))",
    margin: "calc(10px + calc(5px * 2))",
  },

  // Calc with CSS variables
  withVariables: {
    width: `calc(${calcVars.baseSize} * 10)`,
    padding: `calc(${calcVars.baseSize} / 2)`,
  },
});
