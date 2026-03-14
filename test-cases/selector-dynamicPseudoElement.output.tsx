import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type BadgeProps = React.PropsWithChildren<{
  badgeColor: string;
}>;

/**
 * Test case for dynamic styles in pseudo elements (::before / ::after).
 * Emits a StyleX dynamic style function with pseudo-element nesting.
 */
function Badge(props: BadgeProps) {
  const { children, badgeColor } = props;

  return <span sx={[styles.badge, styles.badgeAfterBackgroundColor(badgeColor)]}>{children}</span>;
}

type TooltipProps = React.PropsWithChildren<{
  tipColor?: string;
}>;

// Computed interpolation inside pseudo-element: expression with fallback
function Tooltip(props: TooltipProps) {
  const { children, tipColor } = props;

  return (
    <div sx={[styles.tooltip, styles.tooltipBeforeBackgroundColor(tipColor || "black")]}>
      {children}
    </div>
  );
}

type ButtonProps = React.PropsWithChildren<{
  glowColor: string;
}>;

// Dynamic pseudo-element style inside :hover context
function Button(props: ButtonProps) {
  const { children, glowColor } = props;

  return (
    <button sx={[styles.button, styles.buttonAfterBackgroundColor(glowColor)]}>{children}</button>
  );
}

export const App = () => (
  <div style={{ display: "flex", gap: "16px", padding: "16px", width: 560 }}>
    <Badge badgeColor="red">Notification</Badge>
    <Badge badgeColor="green">Online</Badge>
    <Badge badgeColor="blue">Info</Badge>
    <Tooltip tipColor="navy">With color</Tooltip>
    <Tooltip>Default</Tooltip>
    <Button glowColor="rgba(0,128,255,0.3)">Hover me</Button>
  </div>
);

const styles = stylex.create({
  badge: {
    position: "relative",
    paddingBlock: 8,
    paddingInline: 16,
    backgroundColor: "#f0f0f0",
    "::after": {
      content: '""',
      position: "absolute",
      width: 8,
      height: 8,
      borderRadius: "50%",
      top: 0,
      right: 0,
    },
  },
  badgeAfterBackgroundColor: (backgroundColor: string) => ({
    "::after": {
      backgroundColor,
    },
  }),
  tooltip: {
    position: "relative",
    padding: 8,
    "::before": {
      content: '""',
      position: "absolute",
      top: -4,
      left: "50%",
    },
  },
  tooltipBeforeBackgroundColor: (backgroundColor: string) => ({
    "::before": {
      backgroundColor,
    },
  }),
  button: {
    paddingBlock: 8,
    paddingInline: 16,
    backgroundColor: "#333",
    color: "white",
    "::after": {
      content: '""',
      position: "absolute",
      inset: 0,
      opacity: {
        default: 0,
        ":hover": 1,
      },
    },
  },
  buttonAfterBackgroundColor: (backgroundColor: string) => ({
    "::after": {
      backgroundColor: {
        default: null,
        ":hover": backgroundColor,
      },
    },
  }),
});
