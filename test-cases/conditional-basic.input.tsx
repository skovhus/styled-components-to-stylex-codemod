import * as React from "react";
import styled from "styled-components";

const Title = styled.h1<{ $upsideDown?: boolean }>`
  ${(props) => props.$upsideDown && "transform: rotate(180deg);"}
  text-align: center;
  color: #BF4F74;
`;

const Box = styled.div<{ $isActive?: boolean; $isDisabled?: boolean }>`
  padding: 1rem;
  background: ${(props) => (props.$isActive ? "mediumseagreen" : "papayawhip")};
  opacity: ${(props) => (props.$isDisabled ? 0.5 : 1)};
  cursor: ${(props) => (props.$isDisabled ? "not-allowed" : "pointer")};
`;

// Ternary CSS block returning declaration text or empty string
export const Highlight = styled.span<{ $dim: boolean }>`
  font-weight: var(--font-weight-medium);
  ${(props) => (props.$dim ? "opacity: 0.5;" : "")}
`;

// Negated boolean conditions in ternary CSS blocks
export const Tooltip = styled.div<{ $open?: boolean }>`
  ${(props) => (!props.$open ? "pointer-events: none; opacity: 0.1;" : "")}
`;

// Negated ternary with styles in both branches
export const Overlay = styled.div<{ $visible?: boolean }>`
  inset: 0;
  ${(props) => (!props.$visible ? "opacity: 0;" : "opacity: 1;")}
`;

// String comparison: !== false (treated as boolean conditional)
const IconButton = (props: React.ComponentProps<"button">) => <button {...props} />;

const StyledIconButton = styled(IconButton)<{ useRoundStyle?: boolean }>`
  ${(props) => props.useRoundStyle !== false && "border-radius: 100%;"}
  padding: 4px;
`;

export const App = () => (
  <div>
    <Title>Normal Title</Title>
    <Title $upsideDown>Upside Down Title</Title>
    <Box>Normal Box</Box>
    <Box $isActive>Active Box</Box>
    <Box $isDisabled>Disabled Box</Box>
    <Highlight $dim>Dim</Highlight>
    <Highlight $dim={false}>No dim</Highlight>
    <Tooltip $open>Visible tooltip</Tooltip>
    <Tooltip $open={false}>Hidden tooltip</Tooltip>
    <Tooltip>Default hidden tooltip</Tooltip>
    <Overlay $visible>Visible overlay</Overlay>
    <Overlay $visible={false}>Hidden overlay</Overlay>
    <StyledIconButton>Icon</StyledIconButton>
  </div>
);
