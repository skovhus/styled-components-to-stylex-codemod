import styled from "styled-components";
import { gradient } from "./lib/helpers";

export const GradientText = styled.span`
  ${gradient()}
  font-weight: 600;
`;

export const App = () => <GradientText>Gradient text</GradientText>;
