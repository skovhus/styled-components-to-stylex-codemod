import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { $zIndex } from "./tokens.stylex";

type FocusableCellProps = React.PropsWithChildren<{
  isAnimating?: boolean;
}>;

function FocusableCell(props: FocusableCellProps) {
  const { children, isAnimating } = props;
  return (
    <div sx={[styles.focusableCell, isAnimating && styles.focusableCellAnimating]}>{children}</div>
  );
}

export const App = () => (
  <div style={{ display: "grid", gap: 12 }}>
    <div data-label=" after" sx={styles.thing}>
      Hover me!
    </div>
    <FocusableCell isAnimating>
      <button type="button">Focusable cell</button>
    </FocusableCell>
  </div>
);

const styles = stylex.create({
  thing: {
    borderRightWidth: 1,
    borderRightStyle: "solid",
    borderRightColor: "hotpink",
    color: {
      default: "blue",
      ":hover": "red",
    },
    outline: {
      default: null,
      ":focus": "2px solid blue",
    },
    "::before": {
      content: '"🔥"',
    },
    "::after": {
      content: "attr(data-label)",
    },
  },
  focusableCell: {
    position: "relative",
    zIndex: {
      default: null,
      ":focus-within": `calc(${$zIndex.modal} + 2)`,
    },
  },
  focusableCellAnimating: {
    zIndex: $zIndex.modal,
  },
});
