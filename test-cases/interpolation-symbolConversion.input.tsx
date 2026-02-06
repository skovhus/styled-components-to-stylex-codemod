import styled from "styled-components";
import { thinPixel } from "./lib/helpers";

const Container = styled.div<{ $compact: boolean }>`
  padding: ${(props) => (props.$compact ? `${thinPixel()}` : "16px")};
  margin-left: ${(props) => (props.$compact ? `calc(-4px + ${thinPixel()})` : "0px")};
  background: #f0f0f0;
`;

export const App = () => (
  <div>
    <Container $compact>Compact mode</Container>
    <Container $compact={false}>Normal mode</Container>
  </div>
);
