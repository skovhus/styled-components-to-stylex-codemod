// Padding shorthand followed by longhand override
import styled from "styled-components";

// Pattern 1: padding shorthand with longhand override
// padding: 0 12px sets paddingBlock: 0, paddingInline: 12px
// padding-bottom: 10px then overrides just the bottom
const ProgressBar = styled.div`
  padding: 0 12px;
  padding-bottom: 10px;
  background-color: #eee;
`;

// Pattern 2: directional padding with same-axis longhand override
// padding-top and padding-bottom set block axis individually
const Header = styled.div`
  padding: 8px 16px;
  padding-top: 0;
  background-color: lightblue;
`;

// Pattern 3: pseudo longhand override must preserve the shorthand-derived default
const Row = styled.div`
  padding: 6px 12px;
  background-color: lavender;

  &:last-child {
    padding-bottom: 0;
  }
`;

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 16 }}>
    <ProgressBar>Progress Bar</ProgressBar>
    <Header>Header</Header>
    <Row>Row one</Row>
    <Row>Row two</Row>
  </div>
);
