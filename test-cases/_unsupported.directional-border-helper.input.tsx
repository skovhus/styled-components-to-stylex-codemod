// @expected-warning: Directional border helper styles are not supported
import styled from "styled-components";
import { themedBorder } from "./lib/helpers";

const BorderedLeft = styled.div`
  border-left: ${themedBorder("labelMuted")};
`;

export const App = () => <BorderedLeft>Bordered left</BorderedLeft>;
