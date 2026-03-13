// Conditional with preserved runtime call using a theme boolean argument
import styled from "styled-components";
import { getRowHighlightColor } from "./lib/helpers";

const Row = styled.div<{ $isHighlighted: boolean }>`
  background-color: ${(props) =>
    props.$isHighlighted ? getRowHighlightColor(props.theme.isDark) : "transparent"};
  padding: 8px 16px;
`;

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 16 }}>
    <Row $isHighlighted={true}>Highlighted Row</Row>
    <Row $isHighlighted={false}>Normal Row</Row>
  </div>
);
