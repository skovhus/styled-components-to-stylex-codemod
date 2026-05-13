import * as React from "react";
import styled from "styled-components";

export namespace WidgetSet {
  type GridProps = {
    $columnCount: number;
    $dense?: boolean;
  };

  export const Grid = styled.div<GridProps>`
    display: grid;
    grid-template-columns: ${(props) =>
      props.$dense
        ? `repeat(${props.$columnCount}, 6px 1fr)`
        : `repeat(${props.$columnCount}, 16px 1fr)`};
    gap: 4px;
  `;
}

export const App = () => (
  <WidgetSet.Grid $columnCount={2}>
    <span>Alpha</span>
    <span>Beta</span>
  </WidgetSet.Grid>
);
