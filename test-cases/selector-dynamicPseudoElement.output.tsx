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

export const App = () => (
  <div style={{ display: "flex", gap: "16px", padding: "16px" }}>
    <Badge badgeColor="red">Notification</Badge>
    <Badge badgeColor="green">Online</Badge>
    <Badge badgeColor="blue">Info</Badge>
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
});
