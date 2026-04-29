import styled from "styled-components";
import RenamedBox from "./barrel";

export const WrappedBarrelBox = styled(RenamedBox)`
  padding: 5px;
`;

export const App = () => <WrappedBarrelBox>barrel leaf</WrappedBarrelBox>;
