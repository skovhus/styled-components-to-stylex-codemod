// @expected-warning: Forwarded sx conditional default would override an unproven wrapped component base style
import * as React from "react";
import styled from "styled-components";
import { BranchyBox as Box } from "./lib/sx-branchy-box";

const PrintBox = styled(Box)`
  @media print {
    display: block;
  }
`;

export const App = () => (
  <div style={{ padding: 16 }}>
    <PrintBox bare>Base display may be absent</PrintBox>
  </div>
);
