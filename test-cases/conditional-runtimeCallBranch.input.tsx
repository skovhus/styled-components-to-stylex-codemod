// Conditional with one branch being a preserved runtime call using theme adapter
import styled from "styled-components";
import { ColorConverter, getRowHighlightColor } from "./lib/helpers";

const CardContainer = styled.label<{ checked: boolean }>`
  background-color: ${(props) =>
    props.checked ? ColorConverter.cssWithAlpha(props.theme.color.bgSelected, 0.8) : "transparent"};
  padding: 8px 12px;
`;

// Preserved runtime call using a theme boolean argument (plain function, not member expression)
const Row = styled.div<{ $isHighlighted: boolean }>`
  background-color: ${(props) =>
    props.$isHighlighted ? getRowHighlightColor(props.theme.isDark) : "transparent"};
  padding: 8px 16px;
`;

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 16 }}>
    <CardContainer checked={true}>Checked Card</CardContainer>
    <CardContainer checked={false}>Unchecked Card</CardContainer>
    <Row $isHighlighted={true}>Highlighted Row</Row>
    <Row $isHighlighted={false}>Normal Row</Row>
  </div>
);
