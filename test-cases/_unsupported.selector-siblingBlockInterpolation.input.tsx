// @expected-warning: Unsupported interpolation: unknown
import styled, { css } from "styled-components";

const sharedSiblingStyles = css`
  color: red;
  background: lime;
`;

const Thing = styled.div`
  color: blue;

  &.anchor ~ & {
    ${sharedSiblingStyles}
  }
`;

export const App = () => (
  <div>
    <Thing className="anchor">First</Thing>
    <Thing>Second</Thing>
  </div>
);
