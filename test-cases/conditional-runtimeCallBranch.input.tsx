// Conditional with one branch being a preserved runtime call using theme adapter
import styled from "styled-components";
import { ColorConverter } from "./lib/helpers";

const CardContainer = styled.label<{ checked: boolean }>`
  background-color: ${(props) =>
    props.checked ? ColorConverter.cssWithAlpha(props.theme.color.bgSelected, 0.8) : "transparent"};
  padding: 8px 12px;
`;

export const App = () => (
  <div style={{ display: "flex", gap: 16, padding: 16 }}>
    <CardContainer checked={true}>Checked Card</CardContainer>
    <CardContainer checked={false}>Unchecked Card</CardContainer>
  </div>
);
