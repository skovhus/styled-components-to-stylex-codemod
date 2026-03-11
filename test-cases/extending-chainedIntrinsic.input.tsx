// Extending chain with style props promoted to stylex styles and dynamic functions
import * as React from "react";
import styled from "styled-components";

const FADE_WIDTH = 20;
const GAP = 4;
const OFFSET = 4;

const Container = styled.div`
  position: absolute;
  left: 0;
  right: 0;
  pointer-events: none;
`;

const ItemRow = styled.div`
  position: absolute;
  pointer-events: none;
  display: flex;
  gap: ${GAP}px;
  align-items: center;
`;

const FadeBase = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
`;

const FadeLeft = styled(FadeBase)`
  width: ${FADE_WIDTH}px;
  background: linear-gradient(to right, transparent, #f0f5ff);
`;

const FadeRight = styled(FadeBase)`
  width: ${FADE_WIDTH}px;
  background: linear-gradient(to left, transparent, #f0f5ff);
`;

const SmallFade = styled(FadeLeft)`
  width: 10px;
`;

const Tick = styled.div`
  position: absolute;
  top: -${OFFSET}px;
  height: 6px;
  border-right: 1px solid transparent;
  z-index: 1;
`;

export function App() {
  const measureRef = React.useRef<HTMLDivElement>(null);
  const offset = 50;
  const lineColor = "#999";

  return (
    <div style={{ position: "relative", height: 120, padding: 16 }}>
      <Container>
        <ItemRow style={{ height: 24, left: 10, width: 100 }}>
          <span>Label A</span>
          <SmallFade style={{ right: 0 }} />
        </ItemRow>
        <ItemRow ref={measureRef} style={{ opacity: 0, zIndex: -1 }}>
          <span>Measure</span>
        </ItemRow>
        <FadeLeft style={{ zIndex: 1, left: offset }} />
        <FadeRight style={{ left: offset }} />
        <Tick style={{ left: 40, borderRightColor: lineColor }} />
      </Container>
    </div>
  );
}
