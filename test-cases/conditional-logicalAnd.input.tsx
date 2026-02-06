import styled, { css } from "styled-components";

// Pattern 1: props.$zIndex !== undefined && template literal with interpolation
const LayeredBox = styled.div<{ $zIndex?: number }>`
  position: absolute;
  ${(props) => props.$zIndex !== undefined && `z-index: ${props.$zIndex};`}
`;

// Pattern 2: Simple logical AND with css helper (using destructured props)
const GrayscaleImage = styled.img<{ $isBw?: boolean }>`
  width: 100px;
  ${({ $isBw }) => $isBw && css`filter: grayscale(100%);`}
`;

// Pattern 3: Chained logical expressions with multiple conditions
const DialogText = styled.p<{ $renderingContext?: "dialog" | "page"; $lines?: number }>`
  font-size: 14px;
  ${(props) =>
    props.$renderingContext === "dialog" && props.$lines === 1 && css`background-color: hotpink;`}
`;

export const App = () => (
  <div>
    {/* Pattern 1: with and without $zIndex */}
    <LayeredBox $zIndex={5}>With z-index</LayeredBox>
    <LayeredBox>Without z-index</LayeredBox>

    {/* Pattern 2: with and without $isBw */}
    <GrayscaleImage $isBw src="https://picsum.photos/100" />
    <GrayscaleImage $isBw={false} src="https://picsum.photos/100" />

    {/* Pattern 3: various condition combinations */}
    <DialogText $renderingContext="dialog" $lines={1}>
      Both conditions met
    </DialogText>
    <DialogText $renderingContext="dialog" $lines={2}>
      Only renderingContext met
    </DialogText>
    <DialogText $renderingContext="page" $lines={1}>
      Only lines met
    </DialogText>
    <DialogText>Neither condition met</DialogText>
  </div>
);
