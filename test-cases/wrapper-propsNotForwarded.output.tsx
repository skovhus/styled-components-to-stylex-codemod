// styled(InnerComponent) where props are used for both CSS and inner rendering logic.
// The wrapper must forward props used by the inner component, not just use them for StyleX.
import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

function Badge_({
  selected,
  highlighted,
  children,
  ...rest
}: {
  selected?: boolean;
  highlighted?: boolean;
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div {...rest}>
      {selected && <span>★</span>}
      <span style={{ opacity: highlighted ? 0.7 : 1 }}>{children}</span>
    </div>
  );
}

type BadgeProps = React.ComponentPropsWithRef<typeof Badge_> & {
  selected?: boolean;
  highlighted?: boolean;
};

function Badge(props: BadgeProps) {
  const { className, children, style, highlighted, ...rest } = props;

  return (
    <Badge_
      highlighted={highlighted}
      {...rest}
      {...mergedSx(
        [styles.badge, highlighted ? styles.badgeHighlighted : undefined],
        className,
        style,
      )}
    >
      {children}
    </Badge_>
  );
}

export const App = () => (
  <div style={{ display: "flex", gap: 16, padding: 16 }}>
    <Badge>Default</Badge>
    <Badge selected>Selected (should show ★)</Badge>
    <Badge highlighted>Highlighted (should be 0.7 opacity + scaled)</Badge>
    <Badge highlighted selected>
      Both (should show ★ + 0.7 opacity + scaled)
    </Badge>
  </div>
);

const styles = stylex.create({
  badge: {
    paddingBlock: "8px",
    paddingInline: "12px",
    borderRadius: "4px",
    backgroundColor: "#f0f0f0",
  },
  badgeHighlighted: {
    transform: "scale(0.9)",
  },
});
