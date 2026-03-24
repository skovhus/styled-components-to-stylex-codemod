import * as React from "react";
import * as stylex from "@stylexjs/stylex";

// Support multi-property CSS blocks with variant-based ternaries.
// Pattern: props.variant === "value" ? "prop1: val1; prop2: val2;" : ...

type BadgeSize = "micro" | "small";

type BadgeProps = { size: BadgeSize } & Omit<React.ComponentProps<"span">, "className" | "style">;

export function Badge(props: BadgeProps) {
  const { children, size, ...rest } = props;
  return (
    <span {...rest} sx={[styles.badge, size === "micro" && styles.badgeSizeMicro]}>
      {children}
    </span>
  );
}

export const App = () => (
  <div>
    <Badge size="micro">Micro</Badge>
    <Badge size="small">Small</Badge>
  </div>
);

const styles = stylex.create({
  badge: {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: 4,
    height: 20,
    fontSize: 12,
    paddingBlock: 0,
    paddingInline: 6,
  },
  badgeSizeMicro: {
    height: 16,
    fontSize: 10,
    paddingBlock: 0,
    paddingInline: 4,
  },
});
