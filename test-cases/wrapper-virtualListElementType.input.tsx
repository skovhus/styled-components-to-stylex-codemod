// Private styled elements passed to element-type props. A style-only host (forwards only `style`)
// gets the narrow style-only wrapper; a host that forwards `className` must keep the broad
// className-merging wrapper so the host className is not overwritten.
import * as React from "react";
import styled from "styled-components";

const InnerContainer = styled.div`
  position: relative;
  background-color: #eef8ff;
  padding: 4px;
`;

const ClassyRow = styled.div`
  background-color: #ffe8cc;
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

// Forwards `className` to the element-type slot, so ClassyRow must keep a broad wrapper.
function ClassyList(props: { innerElementType?: React.ElementType; children: React.ReactNode }) {
  const Inner = props.innerElementType ?? "div";
  return (
    <Inner className="classy-row" style={{ width: "100%" }}>
      {props.children}
    </Inner>
  );
}

export const App = () => (
  <div>
    <FixedSizeList innerElementType={InnerContainer}>
      <div style={{ padding: 8 }}>Row</div>
    </FixedSizeList>
    <ClassyList innerElementType={ClassyRow}>
      <div style={{ padding: 8 }}>Classy Row</div>
    </ClassyList>
  </div>
);
