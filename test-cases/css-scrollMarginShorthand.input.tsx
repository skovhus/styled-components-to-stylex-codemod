// scroll-margin and scroll-padding shorthand expansion to physical longhands
import styled from "styled-components";

// Single-value shorthand: should stay as scrollMargin
const Section = styled.div`
  scroll-margin: 12px;
  background-color: lightblue;
  padding: 16px;
`;

// Multi-value shorthand: should expand to block/inline
const Card = styled.div`
  scroll-margin: 8px 16px;
  scroll-padding: 4px 12px;
  background-color: lightyellow;
  padding: 16px;
`;

// Four-value shorthand: should expand to directional longhands
const Panel = styled.div`
  scroll-margin: 1px 2px 3px 4px;
  background-color: lightgreen;
  padding: 16px;
`;

// Single-value scroll-padding
const Container = styled.div`
  scroll-padding: 20px;
  background-color: lavender;
  padding: 16px;
`;

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 16 }}>
    <Section>Single-value scroll-margin</Section>
    <Card>Two-value scroll-margin/padding</Card>
    <Panel>Four-value scroll-margin</Panel>
    <Container>Single-value scroll-padding</Container>
  </div>
);
