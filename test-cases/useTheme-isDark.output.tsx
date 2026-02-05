import * as React from "react";
import { useTheme } from "styled-components";
import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";

function Text(props: React.PropsWithChildren<{ ref?: React.Ref<HTMLSpanElement> }>) {
  const { children } = props;

  const theme = useTheme();

  return (
    <span {...stylex.props(styles.text, theme.isDark ? styles.textDark : styles.textLight)}>
      {children}
    </span>
  );
}

export const App = () => <Text>Label</Text>;

const styles = stylex.create({
  text: {
    fontSize: "12px",
  },
  textDark: {
    color: $colors.labelBase,
    borderColor: $colors.bgSub,
  },
  textLight: {
    color: $colors.labelMuted,
    borderColor: $colors.bgBorderFaint,
  },
});
