import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";

type Props = {
  $applyBackground?: boolean;
};

export function Component(props: Omit<React.ComponentProps<"div">, "className" | "style"> & Props) {
  const { children, $applyBackground, tabIndex: tabIndex = 0, ...rest } = props;
  return (
    <div
      tabIndex={tabIndex}
      {...rest}
      {...stylex.props(
        styles.component,
        $applyBackground ? styles.componentApplyBackground : undefined,
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
  },
  componentApplyBackground: {
    backgroundColor: $colors.bgBase,
  },
});
