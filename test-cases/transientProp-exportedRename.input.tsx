// Transient prop renaming: exported styled(Component) with $-prefixed props
import * as React from "react";
import styled, { css } from "styled-components";

interface IconProps {
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

function Icon(props: IconProps) {
  return (
    <span className={props.className} style={props.style}>
      {props.children}
    </span>
  );
}

interface ExpandIconProps extends IconProps {
  $isExpanded: boolean;
}

function ExpandIcon(props: ExpandIconProps) {
  const { $isExpanded, ...rest } = props;
  return (
    <Icon {...rest}>
      <svg viewBox="0 0 16 16">
        <path d={$isExpanded ? "M3 10L8 5L13 10" : "M3 6L8 11L13 6"} />
      </svg>
    </Icon>
  );
}

// Exported styled(Component) with $-prefixed prop used for styling.
// The $ prefix must be stripped so styled-components v6 consumers
// doing styled(TreeToggle) don't lose the prop.
export const TreeToggle = styled(ExpandIcon)`
  transition: transform 0.15s ease;
  cursor: pointer;
  padding: 4px;
  ${(props) =>
    props.$isExpanded &&
    css`
      transform: rotate(180deg);
    `}
`;

// Exported styled.div with multiple $-prefixed props.
// All should be renamed for the same sc v6 forwarding reason.
export const StatusBadge = styled.div<{
  $variant: "success" | "warning" | "error";
  $compact?: boolean;
}>`
  display: inline-flex;
  align-items: center;
  padding: ${(props) => (props.$compact ? "2px 6px" : "4px 12px")};
  border-radius: 12px;
  font-size: ${(props) => (props.$compact ? "11px" : "13px")};
  background-color: ${(props) =>
    props.$variant === "success" ? "green" : props.$variant === "warning" ? "orange" : "red"};
  color: white;
`;

// Non-exported component — should keep $-prefix
const PrivateLabel = styled.span<{ $bold?: boolean }>`
  font-weight: ${(props) => (props.$bold ? 700 : 400)};
`;

// Collision: $color cannot be renamed because `color` already exists as a prop
export const ColorChip = styled.div<{ $color: string; color: string }>`
  background-color: ${(props) => props.$color};
  color: ${(props) => props.color};
  padding: 4px 8px;
  border-radius: 4px;
`;

// Specifier export (export { ... }) — should also be renamed
const SpecifierTag = styled.div<{ $highlighted?: boolean }>`
  border: 2px solid ${(props) => (props.$highlighted ? "gold" : "gray")};
  padding: 4px 8px;
  border-radius: 4px;
`;

export { SpecifierTag };

export function App() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 16 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <TreeToggle $isExpanded>Expanded</TreeToggle>
        <TreeToggle $isExpanded={false}>Collapsed</TreeToggle>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <StatusBadge $variant="success">OK</StatusBadge>
        <StatusBadge $variant="warning" $compact>
          Warn
        </StatusBadge>
        <StatusBadge $variant="error" $compact={false}>
          Fail
        </StatusBadge>
      </div>
      <PrivateLabel $bold>Bold text</PrivateLabel>
      <PrivateLabel>Normal text</PrivateLabel>
      <ColorChip $color="blue" color="white">
        Collision kept
      </ColorChip>
      <SpecifierTag $highlighted>Highlighted</SpecifierTag>
      <SpecifierTag>Normal</SpecifierTag>
    </div>
  );
}
