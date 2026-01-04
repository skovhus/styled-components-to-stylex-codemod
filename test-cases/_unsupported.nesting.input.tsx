import styled from "styled-components";

// expected-warnings: universal-selector

const EqualDivider = styled.div`
  display: flex;
  margin: 0.5rem;
  padding: 1rem;
  background: papayawhip;

  > * {
    flex: 1;

    &:not(:first-child) {
      margin-left: 1rem;
    }
  }
`;

export const App = () => (
  <EqualDivider>
    <div>First</div>
    <div>Second</div>
    <div>Third</div>
  </EqualDivider>
);
