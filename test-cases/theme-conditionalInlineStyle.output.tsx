import * as React from "react";
import { useTheme } from "styled-components";
import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";

export function Chip(props: Pick<React.ComponentProps<"div">, "ref" | "children">) {
  const { children, ...rest } = props;
  const theme = useTheme();
  const sx = stylex.props(styles.chip);

  return (
    <div
      {...rest}
      {...sx}
      style={{
        ...sx.style,
        backgroundColor: theme.isDark ? theme.highlightVariant(theme.color.bgFocus) : undefined,
      }}
    >
      {children}
    </div>
  );
}

// CSS custom property with one unresolvable theme member expression branch
function DayPicker(props: React.PropsWithChildren<{}>) {
  const theme = useTheme();
  const sx = stylex.props(styles.dayPicker);

  return (
    <div
      {...sx}
      style={
        {
          ...sx.style,
          "--highlighted-color": theme.isDark ? theme.baseTheme?.color.bgBorderSolid : undefined,
        } as React.CSSProperties
      }
    >
      {props.children}
    </div>
  );
}

export const App = () => (
  <div style={{ display: "flex", gap: 16, padding: 16 }}>
    <Chip>Default</Chip>
    <DayPicker>DayPicker</DayPicker>
  </div>
);

const styles = stylex.create({
  chip: {
    paddingBlock: 8,
    paddingInline: 16,
    backgroundColor: $colors.bgFocus,
  },
  dayPicker: {
    "--highlighted-color": $colors.bgBorderFaint,
    backgroundColor: "var(--highlighted-color)",
    padding: 16,
  },
});
