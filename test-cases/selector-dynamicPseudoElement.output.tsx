import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type BadgeProps = React.PropsWithChildren<{
  $badgeColor: string;
}>;

/**
 * Test case for dynamic styles in pseudo elements (::before / ::after).
 * Uses CSS custom properties as a workaround for StyleX's limitation
 * with dynamic values inside pseudo elements.
 * See: https://github.com/facebook/stylex/issues/1396
 */
function Badge(props: BadgeProps) {
  const { children, $badgeColor } = props;

  const sx = stylex.props(styles.badge);

  return (
    <span
      {...sx}
      style={
        {
          ...sx.style,
          "--Badge-after-backgroundColor": $badgeColor,
        } as React.CSSProperties
      }
    >
      {children}
    </span>
  );
}

export const App = () => (
  <div style={{ display: "flex", gap: "16px", padding: "16px" }}>
    <Badge $badgeColor="red">Notification</Badge>
    <Badge $badgeColor="green">Online</Badge>
    <Badge $badgeColor="blue">Info</Badge>
  </div>
);

const styles = stylex.create({
  /**
   * Test case for dynamic styles in pseudo elements (::before / ::after).
   * Uses CSS custom properties as a workaround for StyleX's limitation
   * with dynamic values inside pseudo elements.
   * See: https://github.com/facebook/stylex/issues/1396
   */
  badge: {
    position: "relative",
    paddingBlock: "8px",
    paddingInline: "16px",
    backgroundColor: "#f0f0f0",

    "::after": {
      content: '""',
      position: "absolute",
      width: "8px",
      height: "8px",
      borderRadius: "50%",
      top: 0,
      right: 0,
      backgroundColor: "var(--Badge-after-backgroundColor)",
    },
  },
});
