// Conditional css blocks with theme.isDark ternary inside the template expression
import * as React from "react";
import { useTheme } from "styled-components";
import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";

interface InitialProps {
  $fontSize: number;
  /** Should the avatar render as inactive. */
  isInactive?: boolean;
  /** Should the avatar render as for an invite. */
  isInvite?: boolean;
  /** Whether the avatar should be rendered as disabled. */
  isDisabled?: boolean;
}

function Thing(
  props: InitialProps & Omit<React.ComponentProps<"div">, "className" | "style" | "sx">,
) {
  const { children, isInactive, isInvite, isDisabled } = props;
  const theme = useTheme();

  return (
    <div
      sx={[
        styles.thing,
        isDisabled && theme.isDark ? styles.thingIsDisabledThemeIsDark : undefined,
        isDisabled && !theme.isDark ? styles.thingIsDisabledNotThemeIsDark : undefined,
        isInactive ? styles.thingInactive : undefined,
        isInvite ? styles.thingInvite : undefined,
      ]}
    >
      {children}
    </div>
  );
}

// Non-transient prop (no $ prefix) — verifies prop is dropped from DOM forwarding
interface HighlightProps {
  highlighted?: boolean;
}

function Highlight(props: React.PropsWithChildren<HighlightProps>) {
  const { children, highlighted } = props;
  const theme = useTheme();

  return (
    <div
      sx={[
        styles.highlight,
        highlighted && styles.highlightHighlighted,
        highlighted && theme.isDark ? styles.highlightHighlightedThemeIsDark : undefined,
        highlighted && !theme.isDark && styles.highlightHighlightedNotThemeIsDark,
      ]}
    >
      {children}
    </div>
  );
}

export const App = () => (
  <div style={{ display: "flex", gap: 16, padding: 16 }}>
    <Thing $fontSize={14} isDisabled>
      Disabled
    </Thing>
    <Thing $fontSize={14} isInactive>
      Inactive
    </Thing>
    <Thing $fontSize={14} isInvite>
      Invite
    </Thing>
    <Thing $fontSize={14}>Default</Thing>
    <Highlight highlighted>Highlighted</Highlight>
    <Highlight>Normal</Highlight>
  </div>
);

const styles = stylex.create({
  thing: {
    display: "flex",
  },
  thingIsDisabledThemeIsDark: {
    color: "#ffffff55",
  },
  thingIsDisabledNotThemeIsDark: {
    color: "#FFFFFF",
  },
  thingInactive: {
    backgroundColor: $colors.bgBorderSolid,
  },
  thingInvite: {
    backgroundColor: $colors.bgBase,
  },
  highlight: {
    padding: 8,
  },
  highlightHighlighted: {
    borderStyle: "solid",
    borderColor: $colors.bgBorderSolid,
  },
  highlightHighlightedThemeIsDark: {
    borderWidth: 2,
  },
  highlightHighlightedNotThemeIsDark: {
    borderWidth: 1,
  },
});
