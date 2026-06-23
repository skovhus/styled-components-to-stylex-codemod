// Dynamic inline style objects on intrinsic styled components should stay as JSX style props.
import * as React from "react";
import styled from "styled-components";

const Input = styled.input`
  font-size: 14px;
  border: 1px solid #ccc;
  padding: 4px 8px;
`;

const InputRow = ({ hasRange }: { hasRange: boolean }) => (
  <Input
    style={{
      width: hasRange ? 48 : "100%",
      cursor: hasRange ? "text" : "ew-resize",
      textAlign: hasRange ? "right" : "left",
    }}
    defaultValue={hasRange ? "hasRange" : "no range"}
  />
);

// Preserving dynamic style props keeps per-property expression evaluation
// semantics for impure conditions.
const ImpureBox = styled.div`
  padding: 8px;
`;
// Deterministic at runtime so input/output renders match pixel-for-pixel.
const isImpureFlag = () => true;
const ImpureRow = () => (
  <ImpureBox
    style={{
      width: isImpureFlag() ? 48 : 96,
      color: isImpureFlag() ? "red" : "blue",
    }}
  >
    call
  </ImpureBox>
);

// Preserving the caller style avoids generating extra keys that can collide
// with unrelated styled components.
const Box = styled.div`
  padding: 4px;
`;
const BoxActive = styled.div`
  background: yellow;
`;
const ActiveRow = ({ active }: { active: boolean }) => (
  <>
    <Box
      style={{
        width: active ? 40 : 80,
        height: active ? 40 : 20,
      }}
    >
      box
    </Box>
    <BoxActive>active marker</BoxActive>
  </>
);

export const App = () => (
  <div style={{ display: "flex", gap: 8, padding: 16 }}>
    <InputRow hasRange={true} />
    <InputRow hasRange={false} />
    <ImpureRow />
    <ActiveRow active={true} />
  </div>
);
