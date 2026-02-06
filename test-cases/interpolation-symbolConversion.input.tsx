import styled from "styled-components";
import { thinPixel } from "./lib/helpers";

// Bug: When thinPixel() is resolved to pixelVars.thin (a StyleXVar<string>),
// wrapping it in a template literal causes TS2731: Implicit conversion of a 'symbol' to a 'string'
// Real-world cases: DashboardPageTitle.tsx:295, LabelDescriptionInput.tsx:120

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
