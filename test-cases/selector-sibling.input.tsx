import styled from "styled-components";

const Thing = styled.div`
  color: blue;
  padding: 8px 16px;

  /* Adjacent sibling: element immediately following */
  & + & {
    color: red;
    background: lime;
  }
`;

// Adjacent sibling with theme interpolation
const ThingThemed = styled.div`
  color: blue;

  & + & {
    color: ${(props) => props.theme.color.labelBase};
  }
`;

// Minimal adjacent sibling (margin-top spacing pattern)
const Row = styled.div`
  & + & {
    margin-top: 16px;
  }
`;

// NOTE: StyleX siblingBefore() emits `~ *` (general sibling), not `+ *`
// (adjacent sibling). When an unrelated element is interleaved between two
// Thing instances, CSS `& + &` would NOT match the second Thing, but
// siblingBefore() WILL — this is a known semantic broadening.
export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: 16 }}>
    <Thing>First (blue)</Thing>
    <Thing>Second (red, lime - adjacent)</Thing>
    <Thing>Third (red, lime - adjacent)</Thing>
    <ThingThemed>First themed</ThingThemed>
    <ThingThemed>Second themed (theme color)</ThingThemed>
    <Row>First row</Row>
    <Row>Second row (margin-top)</Row>
  </div>
);
