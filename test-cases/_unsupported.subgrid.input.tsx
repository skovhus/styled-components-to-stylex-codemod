import * as React from "react";
import styled, { css } from "styled-components";

const rowBase = css`
  display: grid;
  grid-template-columns: subgrid;
  color: white;
`;

const GroupHeaderRow = styled.div`
  ${rowBase}
  position: sticky;
  z-index: 3; /* above regular rows */
  background: ${({ theme }: any) => theme.colors.labelBase};
`;

export const App = () => (
  <div style={{ fontFamily: "system-ui", padding: 12 }}>
    <GroupHeaderRow>Group Header</GroupHeaderRow>
  </div>
);
