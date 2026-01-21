import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { themeVars } from "./tokens.stylex";

type CheckMarkProps = React.PropsWithChildren<{
  $opaque: boolean;
}>;

function CheckMark(props: CheckMarkProps) {
  const { children, $opaque } = props;
  return (
    <div {...stylex.props(styles.checkMark, $opaque && styles.checkMarkOpaque)}>{children}</div>
  );
}

export const App = () => (
  <div>
    <div {...stylex.props(styles.rowBase, styles.groupHeaderRow)}>Group</div>
    <div {...stylex.props(styles.rowBase, styles.projectRow)}>Project</div>
    <CheckMark $opaque={true} />
    <CheckMark $opaque={false} />
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
      default: themeVars.bgBase,
      ":hover": themeVars.bgBaseHover,
    },
  },
  checkMark: {
    width: "10px",
    height: "10px",
    backgroundColor: "red",
  },
  checkMarkOpaque: {
    opacity: 0.4,
  },
});
