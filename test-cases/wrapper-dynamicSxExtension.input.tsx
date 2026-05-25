// Extending an sx-aware wrapper with dynamic styles must pass only the extension sx.
import styled from "styled-components";
import { SxAwareButton } from "./lib/sx-aware-component";

export const TopContainer = styled(SxAwareButton)<{
  electronYTrafficLightPosition?: number;
}>`
  padding-left: ${(props) => `${props.electronYTrafficLightPosition ?? 0}px`};
`;

const AccountSwitcherContainer = styled(TopContainer)`
  margin-left: 4px;
`;

export const App = () => (
  <AccountSwitcherContainer electronYTrafficLightPosition={12}>
    Account
  </AccountSwitcherContainer>
);
