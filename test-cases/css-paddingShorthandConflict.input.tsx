// Padding shorthand followed by longhand override
import styled from "styled-components";

// Pattern 1: padding shorthand with longhand override
// padding: 0 12px sets top/right/bottom/left padding longhands
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

// Pattern 4: later logical longhand override must beat shorthand-derived physical sides
const LogicalOverride = styled.div`
  padding: 4px 8px;
  padding-inline: 2px;
  background-color: honeydew;
`;

// Pattern 5: later conditional logical shorthand must preserve earlier side defaults
const ConditionalLogicalOverride = styled.div`
  padding-right: 20px;
  padding-left: 10px;
  background-color: mistyrose;

  &:hover {
    padding-inline: 12px;
  }
`;

// Pattern 6: overwritten physical longhand order must reflect its latest declaration
const LaterPhysicalOverride = styled.div`
  padding: 4px 8px;
  padding-inline: 2px;
  padding-right: 3px;
  background-color: peachpuff;
`;

// Pattern 7: later base shorthand must become the default for earlier pseudo longhands
const PseudoBeforeBase = styled.div`
  &:hover {
    padding-right: 20px;
  }

  padding: 4px 8px;
  background-color: aliceblue;
`;

// Pattern 8: later logical side longhand must beat shorthand-derived physical side
const LogicalSideOverride = styled.div`
  padding: 4px 8px;
  padding-inline-start: 2px;
  background-color: lavenderblush;
`;

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 16 }}>
    <ProgressBar>Progress Bar</ProgressBar>
    <Header>Header</Header>
    <Row>Row one</Row>
    <Row>Row two</Row>
    <LogicalOverride>Logical override</LogicalOverride>
    <ConditionalLogicalOverride>Conditional logical override</ConditionalLogicalOverride>
    <LaterPhysicalOverride>Later physical override</LaterPhysicalOverride>
    <PseudoBeforeBase>Pseudo before base</PseudoBeforeBase>
    <LogicalSideOverride>Logical side override</LogicalSideOverride>
  </div>
);
