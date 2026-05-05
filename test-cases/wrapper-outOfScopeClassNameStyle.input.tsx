// Generated wrappers must only reference className and style after binding them from props.
import * as React from "react";
import styled from "styled-components";

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

export const StatusBadge = styled(BadgeBase)`
  display: inline-flex;
  padding: 4px 8px;
  border-radius: 6px;
  color: #0f172a;
  background-color: #bae6fd;
`;

export const App = () => (
  <div style={{ padding: 12 }}>
    <StatusBadge style={{ border: "1px solid #0369a1" }}>Available</StatusBadge>
  </div>
);
