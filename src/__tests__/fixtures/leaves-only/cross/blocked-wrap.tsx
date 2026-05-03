import styled from "styled-components";
import { BlockedBox } from "./blocked-box";

export const WrappedBlockedBox = styled(BlockedBox)`
  padding: 6px;
`;

export const App = () => <WrappedBlockedBox>blocked leaf</WrappedBlockedBox>;
