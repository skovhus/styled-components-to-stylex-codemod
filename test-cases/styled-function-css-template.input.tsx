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

export const App = () => (
  <div>
    <FlexContainer $align="left">
      <ColoredBox $color="lightblue">Left aligned</ColoredBox>
      <ColoredBox $color="lightgreen">Item</ColoredBox>
    </FlexContainer>
    <FlexContainer $align="right">
      <ColoredBox>Right aligned</ColoredBox>
    </FlexContainer>
  </div>
);
