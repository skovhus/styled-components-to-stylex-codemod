import styled from "styled-components";
import { Text } from "./lib/text";

export const HeaderTitle = styled(Text)`
  font-size: 24px;
  font-weight: 600;
`;

export const App = () => (
  <div>
    <HeaderTitle variant="large">Default Title</HeaderTitle>
  </div>
);
