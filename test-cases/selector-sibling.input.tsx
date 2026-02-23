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

// NOTE: StyleX siblingBefore() emits `~ *` (general sibling), not `+ *`
// (adjacent sibling). When an unrelated element is interleaved between two
// Thing instances, CSS `& + &` would NOT match the second Thing, but
// siblingBefore() WILL — this is a known semantic broadening.
export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: 16 }}>
    <Thing>First (blue)</Thing>
    <Thing>Second (red, lime - adjacent)</Thing>
    <Thing>Third (red, lime - adjacent)</Thing>
  </div>
);
