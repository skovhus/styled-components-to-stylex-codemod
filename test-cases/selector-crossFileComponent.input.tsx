import styled from "styled-components";
import { CrossFileIcon } from "./lib/cross-file-icon.styled";

const Button = styled.button`
  display: inline-flex;
  align-items: center;
  padding: 8px 12px;
  background-color: #f0f0f0;
  cursor: pointer;
`;

const IconButton = styled(Button)`
  gap: 8px;

  ${CrossFileIcon} {
    width: 30px;
    height: 30px;
    transition: transform 0.2s;
  }

  &:hover ${CrossFileIcon} {
    transform: rotate(180deg);
  }
`;

// Grouped parent pseudos AND a base rule that sets the SAME property as the
// grouped-pseudo rule. The base value (opacity: 0) must survive as `default`.
const HoverFocusButton = styled(Button)`
  gap: 8px;

  ${CrossFileIcon} {
    opacity: 0;
  }

  &:hover,
  &:focus-within {
    ${CrossFileIcon} {
      opacity: 1;
    }
  }
`;

export function App() {
  return (
    <div style={{ display: "flex", gap: 16, padding: 16 }}>
      <CrossFileIcon />
      <IconButton>
        <CrossFileIcon />
        Hover
      </IconButton>
      <HoverFocusButton>
        <CrossFileIcon />
        Hover or focus
      </HoverFocusButton>
    </div>
  );
}
