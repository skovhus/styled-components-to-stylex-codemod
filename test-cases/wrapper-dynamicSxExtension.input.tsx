// Extending an sx-aware wrapper with dynamic styles must pass only the extension sx.
import styled from "styled-components";
import { SxAwareButton } from "./lib/sx-aware-component";

export const TopContainer = styled(SxAwareButton)<{
  $accentColor?: string;
}>`
  color: ${(props) => `${props.$accentColor ?? "black"}`};
`;

const AccountSwitcherContainer = styled(TopContainer)`
  margin-left: 4px;
`;

export const App = () => (
  <AccountSwitcherContainer $accentColor="rgb(20, 60, 90)">Account</AccountSwitcherContainer>
);
