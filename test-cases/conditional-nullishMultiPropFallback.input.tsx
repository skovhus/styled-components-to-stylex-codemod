// Optional props with `?? namedConst` fallback, referenced from multiple CSS
// properties. The fallback is applied at every call site, so the value flowing
// into each generated style fn is always a definite primitive.
//
// Regression repro: the codemod widens
// each style fn parameter to `string | undefined`, which breaks the StyleX
// callable-style signature and produces "This expression is not callable" at
// every call site, plus drops the constant base styles (e.g. `background`).
import React from "react";
import styled from "styled-components";

const DEFAULT_GUTTER = 44;
const gutterTokens = { sticky: 8 };

type GutterBoxProps = {
  $gutter?: number;
  $zIndex?: number;
};

export const GutterBox = styled.div<GutterBoxProps>`
  height: ${(props) => props.$gutter ?? DEFAULT_GUTTER}px;
  margin-bottom: -${(props) => props.$gutter ?? DEFAULT_GUTTER}px;
  z-index: ${(props) => props.$zIndex ?? gutterTokens.sticky};
  background: papayawhip;
  color: black;
  padding: 8px;
`;

const AutoLayerBox = styled.div<{ $zIndex?: number }>`
  position: relative;
  z-index: ${(props) => props.$zIndex ?? "auto"};
  background: lavender;
  color: black;
  padding: 8px;
`;

export const App = () => (
  <div>
    <GutterBox>Default gutter</GutterBox>
    <GutterBox $gutter={80} $zIndex={3}>
      Custom gutter
    </GutterBox>
    <AutoLayerBox>Auto layer</AutoLayerBox>
    <AutoLayerBox $zIndex={2}>Numeric layer</AutoLayerBox>
  </div>
);
