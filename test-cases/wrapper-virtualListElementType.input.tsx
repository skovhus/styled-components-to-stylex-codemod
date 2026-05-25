// Private styled element passed as a virtual-list elementType should keep a narrow layout prop surface.
import * as React from "react";
import styled from "styled-components";

const InnerContainer = styled.div`
  position: relative;
  background-color: #eef8ff;
  padding: 4px;
`;

function FixedSizeList(props: { innerElementType?: React.ElementType; children: React.ReactNode }) {
  const Inner = props.innerElementType ?? "div";
  return (
    <Inner
      ref={React.createRef<HTMLDivElement>()}
      style={{ height: 120, width: "100%", position: "relative" }}
    >
      {props.children}
    </Inner>
  );
}

export const App = () => (
  <FixedSizeList innerElementType={InnerContainer}>
    <div style={{ padding: 8 }}>Row</div>
  </FixedSizeList>
);
