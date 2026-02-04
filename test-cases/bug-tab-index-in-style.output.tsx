import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";

type Props = {
  $applyBackground?: boolean;
};

// Test case: tabIndex used in BOTH attrs (with default) AND in styles
// The default value should be preserved when destructuring
export function Component(props: Omit<React.ComponentProps<"div">, "className" | "style"> & Props) {
  const { children, $applyBackground, tabIndex: tabIndex = 0, ...rest } = props;

  return (
    <div
      tabIndex={tabIndex}
      {...rest}
      {...stylex.props(
        styles.component,
        $applyBackground ? styles.componentApplyBackground : undefined,
        tabIndex === 0 && styles.componentTabIndex0,
      )}
    >
      {children}
    </div>
  );
}

export const App = () => <Component>Tab me!</Component>;

const styles = stylex.create({
  component: {
    overflowY: "auto",
    position: "relative",
    flexGrow: 1,
    backgroundColor: "inherit",
    outline: "auto",
  },
  componentApplyBackground: {
    backgroundColor: $colors.bgBase,
  },
  componentTabIndex0: {
    outline: "none",
  },
});
