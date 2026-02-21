// @expected-warning: Arrow function: helper call body is not supported
import styled from "styled-components";
import { truncateMultiline } from "./lib/helpers";

// When the conditional test depends on `theme`, the handler should bail
// since theme is styled-components context, not a component prop.
const ThemeText = styled.div`
  line-height: 1rem;
  ${({ theme }) => truncateMultiline(theme ? 1 : 2)};
`;

export const App = () => (
  <div style={{ padding: "16px" }}>
    <ThemeText>Theme conditional bail</ThemeText>
  </div>
);
