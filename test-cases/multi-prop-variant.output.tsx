import * as React from "react";
import * as stylex from "@stylexjs/stylex";

// Support multi-property CSS blocks with variant-based ternaries.
// Pattern: props.variant === "value" ? "prop1: val1; prop2: val2;" : ...

type BadgeSize = "micro" | "small";

type BadgeProps = React.PropsWithChildren<{
  $size: BadgeSize;
}>;

export function Badge(props: BadgeProps) {
  const { children, $size, ...rest } = props;

  return (
    <span {...rest} {...stylex.props(styles.badge, $size === "micro" && styles.badgeSizeMicro)}>
      {children}
    </span>
  );
}

export const App = () => (
  <div>
    <Badge $size="micro">Micro</Badge>
    <Badge $size="small">Small</Badge>
  </div>
);

const styles = stylex.create({
  badge: {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: "4px",
    height: "20px",
    fontSize: "12px",
    paddingBlock: 0,
    paddingInline: "6px",
  },
  badgeSizeMicro: {
    height: "16px",
    fontSize: "10px",
    paddingBlock: 0,
    paddingInline: "4px",
  },
});
