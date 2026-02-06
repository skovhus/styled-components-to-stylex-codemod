import React from "react";
import styled from "styled-components";
import { Loading } from "./lib/loading";

// Bug: When an exported styled() wraps a component whose props do NOT include
// className (e.g. Loading only accepts style/size/text), the codemod creates a
// wrapper that forwards className explicitly to the base component, causing TS2322.
// styled-components handled this internally, but the wrapper exposes the mismatch.

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
