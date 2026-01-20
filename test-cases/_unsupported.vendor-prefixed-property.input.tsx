// expected-warnings: vendor-prefixed-property
import styled from "styled-components";

const Box = styled.div`
  -webkit-appearance: none;
  appearance: none;
`;

export const App = () => <Box />;
