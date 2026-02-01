// @expected-warning: Adapter resolved StyleX styles cannot be applied under nested selectors/at-rules
import styled from "styled-components";
import { truncate } from "./lib/helpers";

// Helper call conditional inside a pseudo selector - should bail
// because the :hover context would be lost when emitting stylex.props
const Text = styled.p<{ $truncate?: boolean }>`
  font-size: 14px;
  &:hover {
    ${(props) => (props.$truncate ? truncate() : "")}
  }
`;

export const App = () => (
  <div>
    <Text>Normal text</Text>
    <Text $truncate>Truncated text on hover</Text>
  </div>
);
