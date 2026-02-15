// @expected-warning: Unsupported selector: element selector with combined ancestor and child pseudos
import styled from "styled-components";

const ActionButton = styled.button`
  background: gray;
  padding: 8px 16px;
`;

// Combined ancestor+child pseudo: &:focus > button:disabled
// Cannot be represented in StyleX — would need both ancestor(:focus) AND child(:disabled)
const Card = styled.div`
  padding: 16px;

  &:focus > button:disabled {
    opacity: 0.5;
  }
`;

export const App = () => (
  <Card>
    <ActionButton disabled>Click me</ActionButton>
  </Card>
);
