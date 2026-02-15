import styled from "styled-components";
import { highlight } from "./lib/helpers";

const Badge = styled.div`
  background-color: #f4f4f4;
  color: #111;
  border: 1px solid #999;
  padding: 10px 14px;
  border-radius: 6px;
  display: inline-block;

  &:${highlight} {
    background-color: ${(props) => props.theme.color.bgBorderFaint};
    color: #003a8c;
    border-color: #003a8c;
  }
`;

export const App = () => (
  <div style={{ display: "flex", gap: 12, padding: 16 }}>
    <Badge>Alias Selector Function</Badge>
  </div>
);
