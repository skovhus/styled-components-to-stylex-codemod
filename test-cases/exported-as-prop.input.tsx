import * as React from "react";
import styled from "styled-components";

export const ContentViewContainer = styled.div`
  display: flex;
  flex-grow: 1;
  align-items: stretch;
  height: 100%;
  overflow: hidden;
  position: relative;
`;

// When this is used externally we might both add a ref and use the "as"
// <ContentViewContainer ref={...} onClick={e => {}} >
export const App = () => <ContentViewContainer onClick={() => {}} />;
