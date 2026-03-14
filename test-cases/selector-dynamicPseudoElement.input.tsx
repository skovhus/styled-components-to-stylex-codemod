import styled from "styled-components";

/**
 * Test case for dynamic styles in pseudo elements (::before / ::after).
 * Emits a StyleX dynamic style function with pseudo-element nesting.
 */
const Badge = styled.span<{ $badgeColor: string }>`
  position: relative;
  padding: 8px 16px;
  background-color: #f0f0f0;

  &::after {
    content: "";
    position: absolute;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    top: 0;
    right: 0;
    background-color: ${(props) => props.$badgeColor};
  }
`;

// Computed interpolation inside pseudo-element: expression with fallback
const Tooltip = styled.div<{ $tipColor?: string }>`
  position: relative;
  padding: 8px;

  &::before {
    content: "";
    position: absolute;
    top: -4px;
    left: 50%;
    background-color: ${(props) => props.$tipColor || "black"};
  }
`;

// Optional simple identity prop in pseudo-element: should emit null guard
const Tag = styled.span<{ $tagColor?: string }>`
  position: relative;
  padding: 4px 8px;
  background-color: #e0e0e0;

  &::after {
    content: "";
    display: block;
    height: 2px;
    background-color: ${(props) => props.$tagColor};
  }
`;

// Dynamic pseudo-element style inside :hover context
const Button = styled.button<{ $glowColor: string }>`
  padding: 8px 16px;
  background-color: #333;
  color: white;

  &::after {
    content: "";
    position: absolute;
    inset: 0;
    opacity: 0;
  }

  &:hover::after {
    opacity: 1;
    background-color: ${(props) => props.$glowColor};
  }
`;

// Dynamic ::placeholder with theme color
const StyledInput = styled.input`
  padding: 12px;
  border: 1px solid #ccc;
  background: white;

  &::placeholder {
    color: ${(props) => props.theme.color.labelMuted};
  }
`;

// Indexed theme lookup in ::placeholder pseudo-element
type PlaceholderColor = "labelBase" | "labelMuted";

const DynamicPlaceholder = styled.input<{ $placeholderColor: PlaceholderColor }>`
  padding: 12px;
  border: 1px solid #ccc;

  &::placeholder {
    color: ${(props) => props.theme.color[props.$placeholderColor]};
  }
`;

export const App = () => (
  <div style={{ display: "flex", gap: "16px", padding: "16px", width: 560, flexWrap: "wrap" }}>
    <Badge $badgeColor="red">Notification</Badge>
    <Badge $badgeColor="green">Online</Badge>
    <Badge $badgeColor="blue">Info</Badge>
    <Tooltip $tipColor="navy">With color</Tooltip>
    <Tooltip>Default</Tooltip>
    <Tag $tagColor="tomato">With color</Tag>
    <Tag>No color</Tag>
    <Button $glowColor="rgba(0,128,255,0.3)">Hover me</Button>
    <StyledInput placeholder="Muted placeholder" />
    <DynamicPlaceholder $placeholderColor="labelBase" placeholder="Base" />
    <DynamicPlaceholder $placeholderColor="labelMuted" placeholder="Muted" />
  </div>
);
