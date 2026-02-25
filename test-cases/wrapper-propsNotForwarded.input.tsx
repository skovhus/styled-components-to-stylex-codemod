// styled(InnerComponent) where props are used for both CSS and inner rendering logic.
// The wrapper must forward props used by the inner component, not just use them for StyleX.
import * as React from "react";
import styled from "styled-components";

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

const Badge = styled(Badge_)<{ selected?: boolean; highlighted?: boolean }>`
  padding: 8px 12px;
  border-radius: 4px;
  background: #f0f0f0;
  ${(props) => (props.highlighted ? "transform: scale(0.9);" : "")}
`;

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
