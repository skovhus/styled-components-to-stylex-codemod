import styled from "styled-components";
import { CollapseArrowIcon } from "./lib/collapse-arrow-icon";

// CollapseArrowIcon used as a VALUE (mixin), not a selector.
// The prepass should NOT detect this as a cross-file selector.
const Button = styled.button`
  display: flex;
  color: ${CollapseArrowIcon};
`;

export const App = () => <Button>Click</Button>;
