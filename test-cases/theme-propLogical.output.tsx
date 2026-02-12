import * as React from "react";
import { useTheme } from "styled-components";
import * as stylex from "@stylexjs/stylex";

type BoxProps = Omit<React.ComponentProps<"div">, "className" | "style"> & {
  enabled: boolean;
};

// Block-level theme logical conditional: theme.isDark && props.enabled controls entire CSS block
function Box(props: BoxProps) {
  const { children, enabled } = props;

  const theme = useTheme();

  return (
    <div {...stylex.props(styles.box, theme.isDark && props.enabled ? styles.boxDark : undefined)}>
      {children}
    </div>
  );
}

export const App = () => (
  <>
    <Box enabled={true} />
    <Box enabled={false} />
  </>
);

const styles = stylex.create({
  box: {
    height: "100px",
    width: "100px",
    backgroundColor: "red",
  },
  boxDark: {
    opacity: 0.5,
  },
});
