// Generated wrappers must only reference className and style after binding them from props.
import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

type BadgeBaseProps = React.PropsWithChildren<{
  className?: string;
  style?: React.CSSProperties;
}>;

function BadgeBase(props: BadgeBaseProps) {
  const { children, className, style } = props;
  return (
    <span className={className} style={style}>
      {children}
    </span>
  );
}

export function StatusBadge(props: React.ComponentPropsWithRef<typeof BadgeBase>) {
  const { className, children, style, ...rest } = props;
  return (
    <BadgeBase {...rest} {...mergedSx(styles.statusBadge, className, style)}>
      {children}
    </BadgeBase>
  );
}

export const App = () => (
  <div style={{ padding: 12 }}>
    <StatusBadge style={{ border: "1px solid #0369a1" }}>Available</StatusBadge>
  </div>
);

const styles = stylex.create({
  statusBadge: {
    display: "inline-flex",
    paddingBlock: 4,
    paddingInline: 8,
    borderRadius: 6,
    color: "#0f172a",
    backgroundColor: "#bae6fd",
  },
});
