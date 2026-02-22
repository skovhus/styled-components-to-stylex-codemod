import styled from "styled-components";
import { CrossFileIcon } from "./lib/cross-file-icon.styled";

const Card = styled.div`
  padding: 16px;
  background-color: #fafafa;

  ${CrossFileIcon} {
    width: 24px;
    height: 24px;
  }
`;

export function App() {
  return (
    <div style={{ padding: 16 }}>
      <Card>
        <CrossFileIcon />
        Base only
      </Card>
    </div>
  );
}
