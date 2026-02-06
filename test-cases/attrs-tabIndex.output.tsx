import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";

// Bug: `.attrs()` sets `tabIndex` with a default of 0, but the converted output
// does not preserve the tabIndex attribute or its default value. The element
// loses keyboard focusability that the original styled component provided.

type Props = {
  $applyBackground?: boolean;
};

export function Component(props: Omit<React.ComponentProps<"div">, "className" | "style"> & Props) {
  const { children, $applyBackground, tabIndex, ...rest } = props;

  return (
    <div
      tabIndex={tabIndex ?? 0}
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
