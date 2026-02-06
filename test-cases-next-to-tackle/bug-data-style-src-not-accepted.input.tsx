import React from "react";
import styled from "styled-components";
import { Loading } from "./lib/loading";

export const StyledLoading = styled(Loading)`
  height: 100%;
  flex-direction: column;
  gap: 8px;
  flex: 1;
`;

export const App = () => (
  <div>
    <StyledLoading size="large" text="Loading settings…" />
    <StyledLoading size="small" text={false} />
  </div>
);
