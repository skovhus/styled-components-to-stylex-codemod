import * as React from "react";
import { useTheme } from "styled-components";
import * as stylex from "@stylexjs/stylex";
import { $colors, pixelVars } from "./tokens.stylex";
import { color, runtimeColor } from "./lib/helpers";
import type { ColorToken } from "./tokens.stylex";

function Text({ children }: { children?: React.ReactNode }) {
  const theme = useTheme();
  return (
    <span sx={[styles.text, theme.isDark ? styles.textDark : styles.textLight]}>{children}</span>
  );
}

type HelperColorBoxProps = {
  dark: ColorToken;
  light: ColorToken;
} & Omit<React.ComponentProps<"div">, "className" | "style" | "sx">;

// theme.isDark choosing between curried color helper calls with dynamic keys
function HelperColorBox(props: HelperColorBoxProps) {
  const { children, dark, light } = props;
  const theme = useTheme();

  return (
    <div
      sx={styles.helperColorBox(
        theme.isDark
          ? color(props.dark)({
              ...props,
              theme,
            })
          : color(props.light)({
              ...props,
              theme,
            }),
      )}
    >
      {children}
    </div>
  );
}

// theme.isDark choosing between helper-backed template background values
function HelperGradientBox({ children }: { children?: React.ReactNode }) {
  const theme = useTheme();

  return (
    <div
      sx={[
        styles.helperGradientBox,
        theme.isDark ? styles.helperGradientBoxDark : styles.helperGradientBoxLight,
      ]}
    >
      {children}
    </div>
  );
}

// theme.isDark with one unresolved helper branch that falls back to inline style
function RuntimeColorBox({ children }: { children?: React.ReactNode }) {
  const theme = useTheme();
  const sx = stylex.props(styles.runtimeColorBox);

  return (
    <div
      {...sx}
      style={{
        ...sx.style,
        color: theme.isDark ? runtimeColor() : undefined,
      }}
    >
      {children}
    </div>
  );
}

// negated theme.isDark with one unresolved helper branch that falls back to inline style
function NegatedRuntimeColorBox({ children }: { children?: React.ReactNode }) {
  const theme = useTheme();
  const sx = stylex.props(styles.negatedRuntimeColorBox);

  return (
    <div
      {...sx}
      style={{
        ...sx.style,
        color: theme.isDark ? undefined : runtimeColor(),
      }}
    >
      {children}
    </div>
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
    <HelperColorBox dark="bgBorderSolid" light="bgBaseHover">
      Helper color box
    </HelperColorBox>
    <HelperGradientBox>Helper gradient box</HelperGradientBox>
    <RuntimeColorBox>Runtime color box</RuntimeColorBox>
    <NegatedRuntimeColorBox>Negated runtime color box</NegatedRuntimeColorBox>
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
  helperColorBox: (backgroundColor: string) => ({
    color: $colors.labelBase,
    padding: 12,
    backgroundColor,
  }),
  helperGradientBox: {
    color: $colors.labelBase,
    padding: 12,
  },
  helperGradientBoxDark: {
    backgroundImage: `linear-gradient(to bottom, ${$colors.bgSub} 0%, transparent 100%)`,
    backgroundColor: "transparent",
  },
  helperGradientBoxLight: {
    backgroundImage: `linear-gradient(to bottom, transparent 0%, ${$colors.bgBaseHover} 100%)`,
    backgroundColor: "transparent",
  },
  runtimeColorBox: {
    color: $colors.labelMuted,
    padding: 8,
  },
  negatedRuntimeColorBox: {
    color: $colors.labelMuted,
    padding: 8,
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
