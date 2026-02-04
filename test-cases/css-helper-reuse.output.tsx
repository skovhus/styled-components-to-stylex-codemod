import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";

type CheckMarkProps = React.PropsWithChildren<{
  $opaque: boolean;
}>;

function CheckMark(props: CheckMarkProps) {
  const { children, $opaque } = props;

  return (
    <div {...stylex.props(styles.checkMark, $opaque ? styles.checkMarkOpaque : undefined)}>
      {children}
    </div>
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

    // above regular rows
    zIndex: 3,

    borderTopWidth: "1px",
    borderTopStyle: "solid",
    borderTopColor: $colors.bgBorderFaint,
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: $colors.bgBorderFaint,
  },
  rowBase: {
    display: "grid",
    gridTemplateColumns: "1fr 2fr",
    gridColumn: "1/-1",
    alignItems: "center",
    paddingBlock: 0,
    paddingInline: "8px",
    minHeight: "36px",
    backgroundColor: $colors.bgBase,
  },
  projectRow: {
    backgroundColor: {
      default: $colors.bgBase,
      ":hover": $colors.bgBaseHover,
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
