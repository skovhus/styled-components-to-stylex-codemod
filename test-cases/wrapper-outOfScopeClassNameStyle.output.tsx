// Generated wrappers must only reference className and style after binding them from props.
import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

type BadgeBaseProps = React.PropsWithChildren<{
  className?: string;
  style?: React.CSSProperties;
}>;

type DecorativeBadgeBaseProps = {
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  tone?: "info" | "warning";
};

type HiddenPresentationProps<T> = keyof T;
type RemovedDecorativeBadgeProps = HiddenPresentationProps<
  Pick<DecorativeBadgeBaseProps, "className" | "style">
>;
type DecorativeBadgeProps = Omit<DecorativeBadgeBaseProps, RemovedDecorativeBadgeProps>;

type UnionBadgeProps =
  | {
      children?: React.ReactNode;
      className?: string;
      kind: "classy";
    }
  | {
      children?: React.ReactNode;
      kind: "styled";
      style?: React.CSSProperties;
    };

function BadgeBase(props: BadgeBaseProps) {
  const { children, className, style } = props;
  return (
    <span className={className} style={style}>
      {children}
    </span>
  );
}

function DecorativeBadgeBase(props: DecorativeBadgeProps) {
  const { children, tone } = props;
  return <strong data-tone={tone}>{children}</strong>;
}

function UnionBadgeBase(props: UnionBadgeProps) {
  return <em>{props.children}</em>;
}

export function StatusBadge(
  props: Omit<React.ComponentPropsWithRef<typeof BadgeBase>, "className">,
) {
  const { children, style, ...rest } = props;
  return (
    <BadgeBase {...rest} {...mergedSx(styles.statusBadge, undefined, style)}>
      {children}
    </BadgeBase>
  );
}

function DecorativeBadge(
  props: Omit<React.ComponentPropsWithRef<typeof DecorativeBadgeBase>, "className" | "style">,
) {
  return <DecorativeBadgeBase {...props} {...stylex.props(styles.decorativeBadge)} />;
}

function UnionBadge(
  props: Omit<React.ComponentPropsWithRef<typeof UnionBadgeBase>, "className" | "style">,
) {
  return <UnionBadgeBase {...props} {...stylex.props(styles.unionBadge)} />;
}

export const App = () => (
  <div style={{ padding: 12 }}>
    <StatusBadge style={{ border: "1px solid #0369a1" }}>Available</StatusBadge>
    <DecorativeBadge tone="warning">Decorative</DecorativeBadge>
    <UnionBadge kind="classy">Union</UnionBadge>
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
  decorativeBadge: {
    display: "inline-block",
    paddingBlock: 4,
    paddingInline: 8,
    borderRadius: 999,
    color: "#713f12",
    backgroundColor: "#fde68a",
  },
  unionBadge: {
    display: "inline-block",
    paddingBlock: 4,
    paddingInline: 8,
    borderRadius: 999,
    color: "#1e3a8a",
    backgroundColor: "#bfdbfe",
  },
});
