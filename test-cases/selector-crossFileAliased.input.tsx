import styled from "styled-components";
import { CrossFileIcon as Arrow } from "./lib/cross-file-icon.styled";

const Card = styled.div`
  padding: 16px;
  background-color: #fafafa;

  ${Arrow} {
    border: 5px solid blue;
  }
`;

export function App() {
  return (
    <div style={{ padding: 16 }}>
      <Card>
        <Arrow />
        Aliased import
      </Card>
    </div>
  );
}
