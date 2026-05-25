// @expected-warning: CSS block contains unsupported at-rule (only @media, @container, and @supports are supported; mixed nested at-rules require manual handling)
// Mixed nested StyleX condition at-rules cannot be preserved by relation selector lowering.
import styled from "styled-components";

const Thing = styled.div`
  color: blue;

  @media (min-width: 768px) {
    @container (min-width: 300px) {
      & ~ & {
        margin-top: 16px;
      }
    }
  }
`;

export const App = () => (
  <div style={{ padding: 16 }}>
    <Thing>First</Thing>
    <Thing>Second</Thing>
  </div>
);
