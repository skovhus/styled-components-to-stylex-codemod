import React from "react";
import * as stylex from "@stylexjs/stylex";
import { useTheme as useStyledTheme } from "styled-components";
import { useTheme } from "./lib/app-theme";

function RuntimeThemeBox({ children }: { children?: React.ReactNode }) {
  const theme = useStyledTheme();

  return (
    <div sx={styles.runtimeThemeBox(theme.baseTheme?.color.bgBorderSolid ?? "#94a3b8")}>
      {children}
    </div>
  );
}

export const App = () => {
  const appTheme = useTheme();
  return <RuntimeThemeBox>{appTheme.name}</RuntimeThemeBox>;
};

const styles = stylex.create({
  runtimeThemeBox: (color: number | string) => ({
    backgroundColor: "#f8fafc",
    padding: 8,
    color,
  }),
});
