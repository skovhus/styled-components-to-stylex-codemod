import styled from "styled-components";
import { gradient } from "./lib/helpers";

export const GradientText = styled.span`
  ${gradient()}
  font-weight: 600;
`;

export const App = () => (
  <div style={{ backgroundColor: "#101828", padding: 16 }}>
    <GradientText>Gradient text sample</GradientText>
  </div>
);
