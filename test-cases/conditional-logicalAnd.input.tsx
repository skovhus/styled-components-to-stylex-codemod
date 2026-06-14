import styled, { css } from "styled-components";

// Pattern 1: props.$zIndex !== undefined && template literal with interpolation
const LayeredBox = styled.div<{ $zIndex?: number }>`
  position: absolute;
  ${(props) => props.$zIndex !== undefined && `z-index: ${props.$zIndex};`}
`;

// Pattern 2: Simple logical AND with css helper (using destructured props)
const GrayscaleImage = styled.img<{ $isBw?: boolean }>`
  width: 100px;
  ${({ $isBw }) =>
    $isBw &&
    css`
      filter: grayscale(100%);
    `}
`;

// Pattern 3: Chained logical expressions with multiple conditions
const DialogText = styled.p<{ $renderingContext?: "dialog" | "page"; $lines?: number }>`
  font-size: 14px;
  ${(props) =>
    props.$renderingContext === "dialog" &&
    props.$lines === 1 &&
    css`
      background-color: hotpink;
    `}
`;

// Pattern 4: Logical AND with template literal containing theme expression
export const DropZone = styled.div<{ $isDraggingOver: boolean }>`
  padding: 16px;
  border-radius: 8px;
  box-shadow: 0px 1px 2px rgba(0, 0, 0, 0.06);
  ${(props) =>
    props.$isDraggingOver &&
    `box-shadow: inset 0 0 0 1px ${props.theme.color.primaryColor}, 0px 1px 2px rgba(0, 0, 0, 0.06);`}
`;

// Pattern 5: Logical AND with template literal containing multiple theme expressions
export const Card = styled.div<{ $isHighlighted: boolean }>`
  padding: 16px;
  ${(props) =>
    props.$isHighlighted &&
    `border: 1px solid ${props.theme.color.primaryColor}; box-shadow: 0 0 8px ${props.theme.color.bgSub};`}
`;

// Pattern 6: Ternary with template literal containing theme expression and undefined alternate
export const StatusBar = styled.div<{ $isDisconnected?: boolean }>`
  padding: 8px;
  ${(props) =>
    props.$isDisconnected ? `background-color: ${props.theme.color.bgSub};` : undefined}
`;

// Pattern 7: Conditional block BEFORE an unconditional declaration of the same
// property — the later base declaration always wins (CSS cascade: last
// declaration in the generated class), so the conditional color is dead
const LateOverride = styled.div<{ $hot?: boolean }>`
  ${(props) => props.$hot && "color: red;"}
  color: blue;
  padding: 4px;
`;

// Pattern 8: An `!important` conditional still wins over a LATER non-important
// base declaration of the same property (CSS importance beats source order), so
// the variant must be preserved rather than cleared. Covers both the css-block
// form and the ternary-with-undefined-alternate form.
const ImportantBlock = styled.div<{ $hot?: boolean }>`
  ${(props) => props.$hot && "color: red !important;"}
  color: blue;
  padding: 4px;
`;

const ImportantTernary = styled.div<{ $hot?: boolean }>`
  color: ${(props) => (props.$hot ? "red" : undefined)} !important;
  color: blue;
  padding: 4px;
`;

// Numeric `!important` conditional value (importance must survive even though
// the resolved branch is a number, not a string literal).
const ImportantNumeric = styled.div<{ $hot?: boolean }>`
  opacity: ${(props) => (props.$hot ? 1 : undefined)} !important;
  opacity: 0.5;
  padding: 4px;
`;

// Theme-token `!important` conditional value (resolves to a member expression,
// not a literal — importance must still survive the later-base cleanup).
const ImportantToken = styled.div<{ $hot?: boolean }>`
  color: ${(props) => (props.$hot ? props.theme.color.primaryColor : undefined)} !important;
  color: blue;
  padding: 4px;
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

    {/* Pattern 4-6: logical AND / ternary with theme template literals */}
    <DropZone $isDraggingOver>Dragging</DropZone>
    <DropZone $isDraggingOver={false}>Not dragging</DropZone>
    <Card $isHighlighted>Highlighted</Card>
    <Card $isHighlighted={false}>Normal</Card>
    <StatusBar $isDisconnected>Disconnected</StatusBar>
    <StatusBar>Connected</StatusBar>

    {/* Pattern 7: later base declaration wins over the earlier conditional */}
    <LateOverride $hot>Hot (still blue)</LateOverride>
    <LateOverride>Default (blue)</LateOverride>

    {/* Pattern 8: !important conditional wins over the later non-important base */}
    <ImportantBlock $hot>Hot (red, important)</ImportantBlock>
    <ImportantBlock>Default (blue)</ImportantBlock>
    <ImportantTernary $hot>Hot (red, important)</ImportantTernary>
    <ImportantTernary>Default (blue)</ImportantTernary>
    <ImportantNumeric $hot>Hot (opacity 1, important)</ImportantNumeric>
    <ImportantNumeric>Default (opacity 0.5)</ImportantNumeric>
    <ImportantToken $hot>Hot (token color, important)</ImportantToken>
    <ImportantToken>Default (blue)</ImportantToken>
  </div>
);
