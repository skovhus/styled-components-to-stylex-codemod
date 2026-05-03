import styled from "styled-components";
import { Box } from "./box";

const WrappedBox = styled(Box)`
  padding: 2px;
`;

export const App = () => <WrappedBox>cross-file leaf</WrappedBox>;
