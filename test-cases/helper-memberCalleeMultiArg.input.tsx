import styled from "styled-components";
import { ColorConverter } from "./lib/helpers";

const Toggle = styled.div`
  background-color: ${({ theme }) => ColorConverter.cssWithAlpha(theme.color.bgBase, 0.4)};
  padding: 8px 16px;
`;

export const App = () => (
  <div style={{ display: "flex", gap: 16, padding: 16 }}>
    <Toggle>Toggle</Toggle>
  </div>
);
