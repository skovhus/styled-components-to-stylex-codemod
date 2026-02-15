import styled from "styled-components";
import { CrossFileIcon } from "./lib/cross-file-icon.styled";

const ButtonA = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background-color: #e8f4e8;

  ${CrossFileIcon} {
    background-color: red;
  }
`;

const ButtonB = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background-color: #e8e8f4;

  ${CrossFileIcon} {
    background-color: blue;
  }
`;

export function App() {
  return (
    <div style={{ display: "flex", gap: 16, padding: 16 }}>
      <ButtonA>
        <CrossFileIcon />
        Parent A
      </ButtonA>
      <ButtonB>
        <CrossFileIcon />
        Parent B
      </ButtonB>
    </div>
  );
}
