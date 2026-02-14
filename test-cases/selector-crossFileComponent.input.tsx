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

export function App() {
  return (
    <div style={{ display: "flex", gap: 16, padding: 16 }}>
      <CrossFileIcon />
      <IconButton>
        <CrossFileIcon />
        Hover
      </IconButton>
    </div>
  );
}
