// theme.isDark conditional on a component wrapper should apply dark/light styles in JSX.
import * as React from "react";
import { useTheme } from "styled-components";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";
import { $colors } from "./tokens.stylex";

function InnerList(
  props: React.PropsWithChildren<{ className?: string; style?: React.CSSProperties }>,
) {
  return <div role="tablist" {...props} />;
}

function StyledList(props: React.ComponentPropsWithRef<typeof InnerList>) {
  const { className, children, style, ...rest } = props;
  const theme = useTheme();

  return (
    <InnerList
      {...rest}
      {...mergedSx(
        [styles.list, theme.isDark ? styles.listDark : styles.listLight],
        className,
        style,
      )}
    >
      {children}
    </InnerList>
  );
}

export const App = () => (
  <StyledList>
    <button>Tab 1</button>
    <button>Tab 2</button>
  </StyledList>
);

const styles = stylex.create({
  list: {
    display: "flex",
    padding: 4,
    borderRadius: 6,
  },
  listDark: {
    backgroundColor: $colors.bgBase,
  },
  listLight: {
    backgroundColor: $colors.bgSub,
  },
});
