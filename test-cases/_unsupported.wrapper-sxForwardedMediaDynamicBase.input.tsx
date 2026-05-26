// @expected-warning: Forwarded sx conditional default would override an unproven wrapped component base style
import * as React from "react";
import styled from "styled-components";
import { DynamicFlex as Flex } from "./lib/sx-dynamic-flex";

const PrintFlex = styled(Flex)`
  @media print {
    display: block;
  }
`;

export const App = () => (
  <div style={{ padding: 16 }}>
    <PrintFlex inline>Inline flex should not be forced to flex</PrintFlex>
  </div>
);
