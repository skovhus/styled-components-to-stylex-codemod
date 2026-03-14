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
  return (
    <span
      sx={styles.badge({
        badgeColor,
      })}
    >
      {children}
    </span>
  );
}

type TooltipProps = React.PropsWithChildren<{
  tipColor?: string;
}>;

// Computed interpolation inside pseudo-element: expression with fallback
function Tooltip(props: TooltipProps) {
  const { children, tipColor } = props;
  return (
    <div
      sx={styles.tooltip({
        backgroundColor: tipColor || "black",
      })}
    >
      {children}
    </div>
  );
}

type TagProps = React.PropsWithChildren<{
  tagColor?: string;
}>;

// Optional simple identity prop in pseudo-element: should emit null guard
function Tag(props: TagProps) {
  const { children, tagColor } = props;

  return (
    <span sx={[styles.tag, tagColor != null && styles.tagAfterBackgroundColor(tagColor)]}>
      {children}
    </span>
  );
}

type ButtonProps = React.PropsWithChildren<{
  glowColor: string;
}>;

// Dynamic pseudo-element style inside :hover context
function Button(props: ButtonProps) {
  const { children, glowColor } = props;
  return (
    <button
      sx={styles.button({
        glowColor,
      })}
    >
      {children}
    </button>
  );
}

export const App = () => (
  <div style={{ display: "flex", gap: "16px", padding: "16px", width: 560 }}>
    <Badge badgeColor="red">Notification</Badge>
    <Badge badgeColor="green">Online</Badge>
    <Badge badgeColor="blue">Info</Badge>
    <Tooltip tipColor="navy">With color</Tooltip>
    <Tooltip>Default</Tooltip>
    <Tag tagColor="tomato">With color</Tag>
    <Tag>No color</Tag>
    <Button glowColor="rgba(0,128,255,0.3)">Hover me</Button>
  </div>
);

const styles = stylex.create({
  badge: (props: { badgeColor: string }) => ({
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
      backgroundColor: props.badgeColor,
    },
  }),
  tooltip: (props: { backgroundColor: string }) => ({
    position: "relative",
    padding: 8,
    "::before": {
      content: '""',
      position: "absolute",
      top: -4,
      left: "50%",
      backgroundColor: props.backgroundColor,
    },
  }),
  tag: {
    position: "relative",
    paddingBlock: 4,
    paddingInline: 8,
    backgroundColor: "#e0e0e0",
    "::after": {
      content: '""',
      display: "block",
      height: 2,
    },
  },
  tagAfterBackgroundColor: (tagColor: string) => ({
    "::after": {
      backgroundColor: tagColor,
    },
  }),
  button: (props: { glowColor: string }) => ({
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
      backgroundColor: {
        default: null,
        ":hover": props.glowColor,
      },
    },
  }),
});
