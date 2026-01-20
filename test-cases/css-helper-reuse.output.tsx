import * as stylex from "@stylexjs/stylex";
import { themeVars } from "./tokens.stylex";

export const App = () => (
  <div>
    <div {...stylex.props(styles.rowBase, styles.groupHeaderRow)}>Group</div>
    <div {...stylex.props(styles.rowBase, styles.projectRow)}>Project</div>
  </div>
);

const styles = stylex.create({
  groupHeaderRow: {
    position: "sticky",
    top: "var(--sticky-top, 0px)",
    zIndex: 3, // above regular rows
    borderTopWidth: "1px",
    borderTopStyle: "solid",
    borderTopColor: themeVars.bgBorderFaint,
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: themeVars.bgBorderFaint,
  },
  rowBase: {
    display: "grid",
    gridTemplateColumns: "1fr 2fr",
    gridColumn: "1/-1",
    alignItems: "center",
    paddingBlock: 0,
    paddingInline: "8px",
    minHeight: "36px",
    backgroundColor: themeVars.bgBase,
  },
  projectRow: {
    backgroundColor: {
      default: null,
      ":hover": themeVars.bgBaseHover,
    },
  },
});
