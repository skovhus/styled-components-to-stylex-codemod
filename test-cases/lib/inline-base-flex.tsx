import * as React from "react";
import styled, { css } from "styled-components";

export interface FlexProps extends React.ComponentProps<"div"> {
  align?: "start" | "center" | "end" | "stretch";
  center?: boolean;
  gap?: number;
  direction?: "row" | "column";
  column?: boolean;
  noMinWidth?: boolean;
}

const ALIGN_TO_CSS: Record<NonNullable<FlexProps["align"]>, string> = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  stretch: "stretch",
};

export const Flex = styled.div<FlexProps>`
  display: flex;
  ${({ column, direction }) =>
    column
      ? css`
          flex-direction: column;
        `
      : direction
        ? css`
            flex-direction: ${direction};
          `
        : ""}
  ${({ gap }) =>
    gap !== undefined
      ? css`
          gap: ${gap}px;
        `
      : ""}
  ${({ align }) =>
    align
      ? css`
          align-items: ${ALIGN_TO_CSS[align]};
        `
      : ""}
`;
