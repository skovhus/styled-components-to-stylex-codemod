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

type RemovedDecorativeBadgeProps = Exclude<keyof DecorativeBadgeBaseProps, "children" | "tone">;
type DecorativeBadgeProps = Omit<DecorativeBadgeBaseProps, RemovedDecorativeBadgeProps>;

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

export const App = () => (
  <div style={{ padding: 12 }}>
    <StatusBadge style={{ border: "1px solid #0369a1" }}>Available</StatusBadge>
    <DecorativeBadge tone="warning">Decorative</DecorativeBadge>
  </div>
);
