import styled, { css } from "styled-components";

type Align = "left" | "right";

// Function call form returning a css template literal (not object syntax)
const FlexContainer = styled.div<{ $align?: Align }>(
  ({ $align }) => css`
    display: flex;
    gap: var(--spacing-xxs);
    overflow: hidden;
    white-space: nowrap;
    position: relative;
    justify-content: ${$align === "left" ? "flex-start" : "flex-end"};
  `,
);

const ColoredBox = styled.div<{ $color?: string }>(
  ({ $color }) => css`
    padding: 16px;
    background-color: ${$color || "lightgray"};
    border-radius: 4px;
  `,
);

// Non-destructured props pattern: (props) => css`...${props.color}...`
const BorderBox = styled.div<{ $borderColor?: string }>(
  (props) => css`
    padding: 8px;
    border-width: 2px;
    border-style: solid;
    border-color: ${props.$borderColor || "black"};
    margin: 4px;
  `,
);

// Non-destructured props with different param name: (p) => css`...${p.color}...`
const ShadowBox = styled.div<{ $shadow?: string }>(
  (p) => css`
    padding: 12px;
    box-shadow: ${p.$shadow || "none"};
  `,
);

// Block body with return statement: (props) => { return css`...`; }
const BlockBox = styled.div<{ $width?: string }>((props) => {
  return css`
      display: block;
      width: ${props.$width || "100%"};
    `;
});

export const App = () => (
  <div>
    <FlexContainer $align="left">
      <ColoredBox $color="lightblue">Left aligned</ColoredBox>
      <ColoredBox $color="lightgreen">Item</ColoredBox>
    </FlexContainer>
    <FlexContainer $align="right">
      <ColoredBox>Right aligned</ColoredBox>
    </FlexContainer>
    <BorderBox $borderColor="red">Red border</BorderBox>
    <ShadowBox $shadow="0 2px 4px rgba(0,0,0,0.2)">With shadow</ShadowBox>
    <BlockBox $width="50%">Half width</BlockBox>
  </div>
);
