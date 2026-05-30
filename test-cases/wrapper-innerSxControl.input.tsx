// Components whose sx prop targets an inner input must not receive root layout styles through sx.
import styled from "styled-components";
import { InnerSxControl } from "./lib/inner-sx-control";

const StyledControl = styled(InnerSxControl)`
  margin-top: 2px;
`;

export const App = () => (
  <div style={{ display: "flex", gap: 8, padding: 16 }}>
    <span>Label</span>
    <StyledControl aria-label="Done" />
  </div>
);
