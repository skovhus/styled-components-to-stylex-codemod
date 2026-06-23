// Dynamic inline flex values should remain in the caller-owned JSX style prop.
import * as React from "react";
import styled from "styled-components";

const BranchSlot = styled.div`
  min-width: 0;
`;

export const App = ({ width, longBoth }: { width: number | null; longBoth: boolean }) => (
  <div>
    <BranchSlot
      style={{
        flex: width ? `0 0 ${width}px` : longBoth ? "1 1 0" : "0 1 auto",
      }}
    >
      branch slot
    </BranchSlot>
  </div>
);
