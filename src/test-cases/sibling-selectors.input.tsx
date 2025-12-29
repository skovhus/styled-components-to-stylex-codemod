import styled from 'styled-components';

const Thing = styled.div`
  color: blue;

  /* Adjacent sibling: element immediately following */
  & + & {
    color: red;
    background: lime;
  }

  /* General sibling: all following siblings */
  &.something ~ & {
    background: yellow;
  }
`;

export const App = () => (
  <div>
    <Thing>First (blue)</Thing>
    <Thing>Second (red, lime background - adjacent to first)</Thing>
    <Thing className="something">Third with .something class</Thing>
    <Thing>Fourth (yellow background - sibling after .something)</Thing>
    <Thing>Fifth (yellow background - sibling after .something)</Thing>
  </div>
);