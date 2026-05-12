// Ternary that returns multi-line CSS blocks (multiple declarations per branch).
import * as React from "react";
import styled from "styled-components";

const Text = (
  props: React.ComponentProps<"span"> & {
    column?: boolean;
    color?: "base" | "muted";
    gap?: number;
    variant?: "small" | "medium";
  },
) => {
  const { column, color, gap, variant, ...rest } = props;
  return (
    <span data-column={column} data-color={color} data-gap={gap} data-variant={variant} {...rest} />
  );
};

const ErrorMessage = styled.div<{ $inline?: boolean }>`
  color: red;
  font-size: 12px;
  ${(props) =>
    props.$inline === true
      ? `padding: 0 6px;
         border-radius: 4px;
         position: absolute;
         right: 4px;
         top: 4px;`
      : `margin-top: 8px;
         padding: 4px 0;
         border-top: 1px solid red;`}
`;

const StyledText = styled(Text).attrs({ gap: 16, column: true })<{
  $addBottomBorder?: boolean;
  $hasSubtitle: boolean;
}>`
  margin-bottom: 8px;
  ${(props) =>
    props.$addBottomBorder
      ? `
      border-bottom: 1px solid ${props.theme.color.bgBorder};
      ${props.$hasSubtitle ? "padding-bottom: 20px;" : "padding-bottom: 40px;"}
    `
      : ""}
`;

export const App = () => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      gap: 16,
      padding: "16px",
      position: "relative",
    }}
  >
    <ErrorMessage $inline>Inline error</ErrorMessage>
    <ErrorMessage $inline={false}>Block error</ErrorMessage>
    <StyledText variant="small" color="muted" $hasSubtitle={false}>
      No bottom border
    </StyledText>
    <StyledText variant="small" color="muted" $addBottomBorder $hasSubtitle>
      Border with subtitle
    </StyledText>
    <StyledText variant="small" color="muted" $addBottomBorder $hasSubtitle={false}>
      Border without subtitle
    </StyledText>
  </div>
);
