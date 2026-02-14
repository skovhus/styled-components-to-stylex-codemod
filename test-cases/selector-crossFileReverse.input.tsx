import styled from "styled-components";
import { CrossFileLink } from "./lib/cross-file-icon.styled";

const Badge = styled.span`
  display: inline-block;
  width: 20px;
  height: 20px;
  background-color: gray;
  transition: background-color 0.25s;

  ${CrossFileLink}:hover & {
    background-color: rebeccapurple;
  }
`;

export function App() {
  return (
    <div style={{ padding: 16 }}>
      <CrossFileLink href="#">
        <Badge />
        Hover me
      </CrossFileLink>
    </div>
  );
}
