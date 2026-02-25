// styled(Component) with conditional styles - props used in conditions must still be forwarded
import * as React from "react";
import styled from "styled-components";

interface BaseProps {
  /** Label text to display */
  label: string;
  /** Whether to show in compact mode */
  compact?: boolean;
  /** Whether the item is highlighted */
  highlighted?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

/** Base component that uses compact and highlighted props for its own rendering logic */
function BaseCard(props: BaseProps) {
  const { label, compact, highlighted, className, style } = props;
  return (
    <div className={className} style={style}>
      <span style={{ fontWeight: highlighted ? "bold" : "normal" }}>
        {compact ? label.slice(0, 3) : label}
      </span>
    </div>
  );
}

/** Styled wrapper that adds conditional transform based on props, but the base component also needs those props */
export const Card = styled(BaseCard)<{ compact?: boolean; highlighted?: boolean }>`
  background-color: #e0e0e0;
  padding: 12px;
  min-width: 80px;
  min-height: 40px;
  ${(p) => (p.compact ? "transform: scale(0.75);" : "")}
  ${(p) => (p.highlighted ? "border: 2px solid blue;" : "")}
`;

export const App = () => (
  <div style={{ display: "flex", gap: 12, padding: 16 }}>
    <Card label="Default" />
    <Card label="Compact" compact />
    <Card label="Highlighted" highlighted />
    <Card label="Both" compact highlighted />
  </div>
);
