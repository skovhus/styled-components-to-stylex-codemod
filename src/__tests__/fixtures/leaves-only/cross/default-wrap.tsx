import styled from "styled-components";
import RenamedBox from "./default-box";

export const WrappedDefaultBox = styled(RenamedBox)`
  padding: 3px;
`;

export const App = () => <WrappedDefaultBox>default leaf</WrappedDefaultBox>;
