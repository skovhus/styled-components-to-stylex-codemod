import styled from "styled-components";
import { CollapseArrowIcon } from "./lib/collapse-arrow-icon";

// Reverse selector: the imported component is the PARENT, and "self" is the child.
// ${CollapseArrowIcon}:hover & { ... } means "when CollapseArrowIcon is hovered, style me"
const Label = styled.span`
  color: gray;

  ${CollapseArrowIcon}:hover & {
    color: blue;
  }
`;

export const App = () => (
  <CollapseArrowIcon>
    <Label>Hover the icon</Label>
  </CollapseArrowIcon>
);
