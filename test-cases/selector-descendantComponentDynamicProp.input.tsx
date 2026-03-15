// Forward descendant component selector with dynamic prop-based interpolation
import styled from "styled-components";

const Icon = styled.span`
  width: 16px;
  height: 16px;
`;

// Forward descendant selector with prop-based interpolation.
// The prop value is bridged to the child via a CSS custom property.
const Button = styled.button<{ $color?: string }>`
  padding: 8px;

  &:hover ${Icon} {
    color: ${(props) => props.$color ?? "red"};
  }
`;

// Static parts around the interpolation must be preserved in the var() reference
// (e.g., `box-shadow: 0 4px 8px ${color}` → `"0 4px 8px var(--name)"`).
const Badge = styled.span`
  font-size: 12px;
`;

const Card = styled.div<{ $shadow?: string }>`
  padding: 16px;
  background: white;

  &:hover ${Badge} {
    box-shadow: 0 4px 8px ${(props) => props.$shadow ?? "rgba(0,0,0,0.2)"};
  }
`;

// Shorthand border with interpolation: static longhands stay static,
// dynamic color is bridged via CSS variable.
const Tag = styled.span`
  display: inline-block;
`;

const Toolbar = styled.div<{ $accent?: string }>`
  display: flex;
  gap: 8px;

  &:hover ${Tag} {
    border: 2px solid ${(props) => props.$accent ?? "gray"};
  }
`;

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 16 }}>
    <Button $color="blue">
      <Icon />
      Button hover → Icon color
    </Button>
    <Card $shadow="rgba(0,0,255,0.3)">
      <Badge>Card hover → Badge shadow</Badge>
    </Card>
    <Toolbar $accent="red">
      <Tag>Toolbar hover → Tag border</Tag>
    </Toolbar>
  </div>
);
