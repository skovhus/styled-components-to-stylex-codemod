// Generated wrappers must only reference className and style after binding them from props.
import * as React from "react";
import styled from "styled-components";

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

export const StatusBadge = styled(BadgeBase)`
  display: inline-flex;
  padding: 4px 8px;
  border-radius: 6px;
  color: #0f172a;
  background-color: #bae6fd;
`;

const DecorativeBadge = styled(DecorativeBadgeBase)`
  display: inline-block;
  padding: 4px 8px;
  border-radius: 999px;
  color: #713f12;
  background-color: #fde68a;
`;

const UnionBadge = styled(UnionBadgeBase)`
  display: inline-block;
  padding: 4px 8px;
  border-radius: 999px;
  color: #1e3a8a;
  background-color: #bfdbfe;
`;

export const App = () => (
  <div style={{ padding: 12 }}>
    <StatusBadge style={{ border: "1px solid #0369a1" }}>Available</StatusBadge>
    <DecorativeBadge tone="warning">Decorative</DecorativeBadge>
    <UnionBadge kind="classy">Union</UnionBadge>
  </div>
);
