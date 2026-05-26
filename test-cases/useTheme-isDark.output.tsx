import * as React from "react";
import { useTheme } from "styled-components";
import * as stylex from "@stylexjs/stylex";
import { $colors, pixelVars } from "./tokens.stylex";

function Text({ children }: { children?: React.ReactNode }) {
  const theme = useTheme();
  return (
    <span sx={[styles.text, theme.isDark ? styles.textDark : styles.textLight]}>{children}</span>
  );
}

// theme.isDark controlling an entire CSS block (empty string vs padding)
function Box({ children }: { children?: React.ReactNode }) {
  const theme = useTheme();
  return <div sx={theme.isDark ? undefined : styles.boxLight}>{children}</div>;
}

// theme.isDark setting a CSS custom property value (with optional chaining)
function DayPicker({ children }: { children?: React.ReactNode }) {
  const theme = useTheme();

  const sx = stylex.props(
    styles.dayPicker,
    theme.isDark ? styles.dayPickerDark : styles.dayPickerLight,
  );

  return (
    <div
      {...sx}
      style={{
        ...sx.style,
        backgroundColor: "var(--highlighted-color)",
      }}
    >
      {children}
    </div>
  );
}

export const App = () => (
  <div>
    <Text>Label</Text>
    <Box>Box</Box>
    <DayPicker>DayPicker</DayPicker>
  </div>
);

const styles = stylex.create({
  text: {
    fontSize: 12,
  },
  textDark: {
    color: $colors.labelBase,
    borderColor: $colors.bgSub,
  },
  textLight: {
    color: $colors.labelMuted,
    borderColor: $colors.bgBorderFaint,
  },
  boxLight: {
    padding: pixelVars.thin,
  },
  dayPicker: {
    padding: 16,
  },
  dayPickerDark: {
    "--highlighted-color": $colors.bgBorderSolid,
  },
  dayPickerLight: {
    "--highlighted-color": $colors.bgBorderFaint,
  },
});
