import styled from "styled-components";

const Thing = styled.div`
  color: blue;

  /* General sibling: all following siblings */
  &.something ~ & {
    background: yellow;
  }
`;

export const App = () => (
  <div>
    <Thing>First (blue)</Thing>
    <Thing>Second (blue)</Thing>
    <Thing className="something">Third with .something class</Thing>
    <Thing>Fourth (yellow background - sibling after .something)</Thing>
    <Thing>Fifth (yellow background - sibling after .something)</Thing>
  </div>
);
