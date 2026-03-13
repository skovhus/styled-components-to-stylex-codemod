import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type BadgeProps = React.PropsWithChildren<{
  badgeColor: string;
}>;

/**
 * Test case for dynamic styles in pseudo elements (::before / ::after).
 * Uses CSS custom properties on the parent element, referenced via var()
 * in the pseudo-element's static StyleX styles.
 */
function Badge(props: BadgeProps) {
  const { children, badgeColor } = props;

  const sx = stylex.props(styles.badge);

  return (
    <span
      {...sx}
      style={
        {
          ...sx.style,
          "--Badge-after-backgroundColor": badgeColor,
        } as React.CSSProperties
      }
    >
      {children}
    </span>
  );
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
      backgroundColor: "var(--Badge-after-backgroundColor)",
    },
  },
});
