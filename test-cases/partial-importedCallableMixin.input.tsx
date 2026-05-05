// Partial conversion must preserve callable helper imports used by remaining styled templates.
import styled from "styled-components";
import { truncate } from "./lib/helpers";

const ConvertedLabel = styled.span`
  ${truncate()};
  color: #2563eb;
  max-width: 120px;
`;

const PreservedNav = styled.nav`
  ${truncate()};
  padding: 8px;

  & a.active {
    color: tomato;
  }
`;

export const App = () => (
  <PreservedNav>
    <a className="active" href="#">
      Active link
    </a>
    <ConvertedLabel>Converted label with long text</ConvertedLabel>
  </PreservedNav>
);
