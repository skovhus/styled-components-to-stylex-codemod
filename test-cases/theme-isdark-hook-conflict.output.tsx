import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { useTheme } from "styled-components";

type BoxProps = {
  theme: { isDark: boolean };
};

function Box(props: Omit<React.ComponentProps<"div">, "className" | "style"> & BoxProps) {
  const { children, ...rest } = props;

  const themeFromContext = useTheme();

  return (
    <div {...rest} {...stylex.props(themeFromContext.isDark ? styles.boxDark : styles.boxLight)}>
      {children}
    </div>
  );
}

export const App = () => <Box theme={{ isDark: true }} />;

const styles = stylex.create({
  boxDark: {
    color: "white",
  },
  boxLight: {
    color: "black",
  },
});
