// Print media styles must not become normal screen defaults.
import styled from "styled-components";

const LoadingContainer = styled.div`
  display: flex;
  overflow: auto;
  align-items: center;
  justify-content: center;
  min-height: 80px;

  @media print {
    display: block;
    overflow: visible;
  }
`;

export const App = () => <LoadingContainer>Loading</LoadingContainer>;
