// @expected-warning: styled(ImportedComponent) wraps a component whose file contains internal styled-components — convert the base component's file first to avoid CSS cascade conflicts
// styled() wrapping a component whose internal styled-component sets the same CSS property
import * as React from "react";
import styled from "styled-components";
import { GroupHeader } from "./lib/styled-group-header";

const CustomGroupHeader = styled(GroupHeader)`
  padding-inline: 14px;
`;

CustomGroupHeader.HEIGHT = GroupHeader.HEIGHT;

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "20px" }}>
    <GroupHeader label="Base header (padding-inline: 11px)" id="base" />
    <CustomGroupHeader label="Custom header (padding-inline: 14px)" id="custom" />
  </div>
);
