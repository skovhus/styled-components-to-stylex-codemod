import * as stylex from "@stylexjs/stylex";
import { helpers } from "./lib/helpers.stylex";
import styled from "styled-components";
import { truncate } from "./lib/helpers";

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
    <span sx={[styles.convertedLabel, helpers.truncate]}>Converted label with long text</span>
  </PreservedNav>
);

const styles = stylex.create({
  convertedLabel: {
    color: "#2563eb",
    maxWidth: 120,
  },
});
