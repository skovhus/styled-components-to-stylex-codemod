// @expected-warning: styled(ImportedComponent) wraps a component whose file uses styled-components — convert the base component's file first to avoid CSS cascade conflicts
// styled() wrapping a component imported through a barrel whose source file still uses styled-components
import * as React from "react";
import styled from "styled-components";
import { GroupHeader } from "./lib/styled-group-header-barrel";

const CustomGroupHeader = styled(GroupHeader)`
  padding-inline: 14px;
`;

export const App = () => (
  <div>
    <CustomGroupHeader label="Custom header" id="custom" />
  </div>
);
